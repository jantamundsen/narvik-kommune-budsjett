#!/usr/bin/env python3
"""Fetch numbers on capacity in the care for the elderly, and write site/data/eldre.json.

Three sources, shown together on the Helse og omsorg page (omrade.html?omrade=helse):

- Overliggerdøgn per kommune from Helsedirektoratet (SAMDATA spesialisthelsetjenesten, «Utskrivningsklare
  pasienter (somatikk), bostedskommune», from Norsk pasientregister). The numbers are only published in a Power BI
  report on the page, so this script reads the embed token from the page and asks Power BI for the same measures
  the report shows. That is not an official API: if it stops working, the numbers from the last run are kept.
- SSB's KOSTRA figures on institution places and the share of the oldest living in an institution or a staffed home
  (tables 11875, 12209 and 12293), for Narvik and the comparison regions in narvik.json.
- The overliggerdøgn the kommune reports itself, typed in from its reports in config/eldre.json.

Helsedirektoratet counts from the first time a patient is reported ready for discharge, the kommune the days it pays
for, so the two series are kept apart.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_eldre.py
"""
from __future__ import annotations

import base64
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from fetch_data import FIRST_YEAR, cells, fetch
from fetch_malgruppe import compare_regions

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "eldre.json"
CONFIG = ROOT / "config" / "eldre.json"

DIM_REGION = "KOKkommuneregion0000"
DIM_CONTENTS = "ContentsCode"
DIM_YEAR = "Tid"

# KOSTRA figures, in the order the page lists them. name is the line on the page; unit "%" or "" (a count).
# own: only Narvik is shown, since a count of places says little next to kommuner of another size.
SSB = [
    {"key": "plasser", "table": "11875", "contents": "KOSinstdispplass0000", "name": "Plasser i institusjon", "unit": "", "own": True},
    {"key": "korttidsplasser", "table": "11875", "contents": "KOSinsttidsbegrp0000", "name": "Plasser for tidsbegrenset opphold", "unit": "", "own": True},
    {"key": "inst80", "table": "12209", "contents": "KOSsykhjand80aar0000", "name": "Innbyggere 80 år og over med opphold i institusjon", "unit": "%"},
    {"key": "langtid80", "table": "12293", "contents": "KOSlangtid80aaro0001", "name": "Innbyggere 80 år og over med langtidsopphold i sykehjem", "unit": "%"},
    {"key": "bolig80", "table": "12293", "contents": "KOSinnbbolig80aa0000", "name": "Innbyggere 80 år og over i bolig med fast bemanning hele døgnet", "unit": "%"},
    {"key": "dogn_korttid", "table": "12293", "contents": "KOStidsbegrdognp0000", "name": "Døgn per tidsbegrenset opphold, i snitt", "unit": "døgn"},
]

SAMDATA_PAGE = "https://www.helsedirektoratet.no/statistikk/samdata-spesialisthelsetjenesten/utskrivningsklare-pasienter-somatikk-bostedskommune"
SAMDATA_REPORT = "3eefe276-c503-492d-b2c5-6bc66216e027"
KOMMUNER = "Bostedsomraader til drilldown - Kommuner"
MEASURES = "DAX UKP Kommune"
DOGN = "UKP Kommune - Antall overliggerdøgn"
RATE = "UKP Kommune - rateOverliggerdøgn_uten_trend"  # per 1 000 innbyggere, standardised for sex and age


def ssb_query(table: str, regions: str, contents: list[str]) -> str:
    params = {"lang": "no", f"valueCodes[{DIM_REGION}]": regions, f"valueCodes[{DIM_CONTENTS}]": ",".join(contents),
              f"valueCodes[{DIM_YEAR}]": f"from({FIRST_YEAR})"}
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data?" + urllib.parse.urlencode(params, safe="[](),")


def ssb(regions: list[dict]) -> list[dict]:
    codes = ",".join(c for r in regions for c in [r["code"], *r.get("earlier", [])])
    out = []
    for table in dict.fromkeys(m["table"] for m in SSB):
        ms = [m for m in SSB if m["table"] == table]
        url = ssb_query(table, codes, [m["contents"] for m in ms])
        print(f"Henter {url}", file=sys.stderr)
        raw = {(c[DIM_REGION], c[DIM_CONTENTS], c[DIM_YEAR]): v for c, v in cells(fetch(url)) if v is not None}
        years = sorted({y for _, _, y in raw})
        for m in ms:
            values = {}
            for r in regions:
                rc = [r["code"], *r.get("earlier", [])]
                values[r["key"]] = {y: next((raw[(c, m["contents"], y)] for c in rc if (c, m["contents"], y) in raw), None) for y in years}
            out.append({**m, "url": f"https://www.ssb.no/statbank/table/{table}",
                        "query": ssb_query(table, codes, [m["contents"]]), "values": values})
    return out


def post(url: str, body: dict, token: str) -> dict:
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Authorization": "EmbedToken " + token, "Content-Type": "application/json"})
    for wait in (2, 4, 8, 0):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.load(resp)
        except OSError:
            if not wait:
                raise
            time.sleep(wait)


def samdata(regions: list[dict]) -> dict:
    """Overliggerdøgn and the rate per 1 000 for the kommuner in regions and for the whole country, per year."""
    req = urllib.request.Request(SAMDATA_PAGE, headers={"User-Agent": "narvik-kommune-budsjett"})
    page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    token = html.unescape(re.search(r'data-embedToken="([^"]+)"', page).group(1))
    config = html.unescape(re.search(r'data-embedUrl="[^"]*config=([^"&]+)', page).group(1))
    cluster = json.loads(base64.b64decode(urllib.parse.unquote(config)))["clusterUrl"]
    req = urllib.request.Request(f"{cluster}/explore/reports/{SAMDATA_REPORT}/modelsAndExploration?preferReadOnlySession=true",
                                 headers={"Authorization": "EmbedToken " + token})
    model = json.load(urllib.request.urlopen(req, timeout=60))["models"][0]

    def query(by_kommune: bool) -> list[list]:
        frm = [{"Name": "d", "Entity": "Dato", "Type": 0}, {"Name": "m", "Entity": MEASURES, "Type": 0}]
        sel = [{"Column": {"Expression": {"SourceRef": {"Source": "d"}}, "Property": "År"}, "Name": "år"}]
        q = {"Version": 2, "From": frm, "Select": sel}
        if by_kommune:
            frm.append({"Name": "k", "Entity": KOMMUNER, "Type": 0})
            sel.append({"Column": {"Expression": {"SourceRef": {"Source": "k"}}, "Property": "KommuneNr"}, "Name": "kommune"})
            nr = [c for r in regions if r["kind"] == "kommune" for c in [r["code"], *r.get("earlier", [])]]
            q["Where"] = [{"Condition": {"In": {"Expressions": [{"Column": {"Expression": {"SourceRef": {"Source": "k"}}, "Property": "KommuneNr"}}],
                                                "Values": [[{"Literal": {"Value": f"'{c}'"}}] for c in nr]}}}]
        sel += [{"Measure": {"Expression": {"SourceRef": {"Source": "m"}}, "Property": p}, "Name": p} for p in (DOGN, RATE)]
        body = {"version": "1.0.0", "cancelQueries": [], "modelId": model["id"], "queries": [{"Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
            "Query": q, "Binding": {"Primary": {"Groupings": [{"Projections": list(range(len(sel)))}]},
                                    "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 1000}}}, "Version": 1}}}]},
            "QueryId": "", "ApplicationContext": {"DatasetId": model["dbName"], "Sources": [{"ReportId": SAMDATA_REPORT}]}}]}
        ds = post(f"{cluster}/explore/querydata?synchronous=true", body, token)["results"][0]["result"]["data"]["dsr"]["DS"][0]
        dicts = ds.get("ValueDicts", {})
        # Power BI packs rows: R marks cells repeated from the row before, Ø cells that are empty, and a column
        # whose values are in ValueDicts gives an index into it.
        kinds = ds["PH"][0]["DM0"][0]["S"]
        rows, prev = [], None
        for row in ds["PH"][0]["DM0"]:
            it, vals = iter(row.get("C", [])), []
            for i, s in enumerate(kinds):
                if prev and (row.get("R", 0) >> i) & 1:
                    vals.append(prev[i])
                elif (row.get("Ø", 0) >> i) & 1:
                    vals.append(None)
                else:
                    v = next(it, None)
                    vals.append(dicts[s["DN"]][v] if "DN" in s and isinstance(v, int) else v)
            prev = vals
            rows.append(vals)
        return rows

    code_key = {c: r["key"] for r in regions if r["kind"] == "kommune" for c in [r["code"], *r.get("earlier", [])]}
    values = {}
    for y, nr, dogn, rate in query(True):
        values.setdefault(code_key[str(nr)], {})[str(y)] = {"dogn": dogn, "rate": round(float(rate), 1) if rate is not None else None}
    for y, dogn, rate in query(False):
        values.setdefault("norge", {})[str(y)] = {"dogn": dogn, "rate": round(float(rate), 1) if rate is not None else None}
    for k in values:
        values[k] = {y: v for y, v in sorted(values[k].items()) if int(y) >= FIRST_YEAR}
    return {"name": "Helsedirektoratet, SAMDATA spesialisthelsetjenesten: Utskrivningsklare pasienter (somatikk), bostedskommune",
            "url": SAMDATA_PAGE, "datakilde": "Norsk pasientregister", "hentet": dt.date.today().isoformat(), "values": values}


def main() -> int:
    regions = compare_regions()
    acc = json.loads((ROOT / "site" / "data" / "narvik.json").read_text(encoding="utf-8"))
    kinds = {r["key"]: r["kind"] for r in acc["compare"]}
    regions = [{**r, "kind": kinds.get(r["key"], "kommune")} for r in regions]
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}

    try:
        overliggere = samdata(regions)
        print(f"Samdata: {', '.join(f'{k} {len(v)} år' for k, v in overliggere['values'].items())}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 - any failure here means: keep what we had
        if not old.get("overliggere"):
            raise
        print(f"Merk: fikk ikke hentet fra Helsedirektoratet ({e}), beholder tallene fra forrige kjøring", file=sys.stderr)
        overliggere = old["overliggere"]

    data = {
        "generated": dt.date.today().isoformat(),
        "overliggere": overliggere,
        "kommunens_overliggerdogn": json.loads(CONFIG.read_text(encoding="utf-8"))["kommunens_overliggerdogn"],
        "ssb": ssb(regions),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {OUT.relative_to(ROOT)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
