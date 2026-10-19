#!/usr/bin/env python3
"""Fetch spending per pupil, per child and per inhabitant in the age group, and write site/data/malgruppe.json.

Per inhabitant says little about a school or a kindergarten when kommuner have different shares of
children. SSB's KOSTRA key figures put the same spending per user instead: per pupil, per child in a
kommunal kindergarten, per child in the child welfare service, or per inhabitant of the age the service is for.
Each measure in MEASURES is one ContentsCode in one SSB table (and for 12235 one function), fetched for Narvik
and the comparison regions in narvik.json, as SSB publishes it. Nothing is computed for those.

SSB no longer publishes helse og omsorg per inhabitant of an age group, so AGE_MEASURES are computed here and
marked «beregnet» on the page: netto driftsutgifter (SSB 12362, the same as the rest of the site) divided by the
inhabitants in the age group on 1 January the year after (SSB 07459, which is the date KOSTRA's own per-inhabitant
figures use). 07459 has no KOSTRA groups, so Landet uten Oslo is Hele landet minus Oslo, and the KOSTRA group is
the sum of its member kommuner from narvik.json, with their numbers before the 2024 renumbering taken from KLASS.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_malgruppe.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

from fetch_data import FIRST_YEAR, KLASS, KLASS_KOMMUNER, cells, fetch, labels

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "malgruppe.json"
ACCOUNTS = ROOT / "site" / "data" / "narvik.json"
REGION = "1806"

DIM_REGION = "KOKkommuneregion0000"
DIM_FUNCTION = "KOKfunksjon0000"
DIM_CONTENTS = "ContentsCode"
DIM_YEAR = "Tid"

# One measure per row. area is the key in config/categories.json; service the service key on omrade.html
# (a function code where the area has no named services), or None for the whole area. key is the value of
# ?maal= on the page, so it only needs to be unique within one area or service. per finishes "kr per …".
# basis says which spending SSB divides: netto (as the rest of the site), or korrigert brutto / brutto,
# which is before income is subtracted. functions are the KOSTRA functions the measure covers.
MEASURES = [
    # Grunnskole. Per elev is left out: the pupil count comes from the schools' own reporting (GSI) and the cost per
    # pupil has to be corrected for buying from and selling to other kommuner, so per inhabitant 6–15 år is the safer basis.
    {"area": "skole", "service": None, "key": "innb", "per": "innbygger 6–15 år", "basis": "netto",
     "table": "12255", "contents": "KOSregnind20000", "functions": ["202", "215", "222", "223"]},
    {"area": "skole", "service": "223", "key": "skyss", "per": "elev med skoleskyss", "basis": "korrigert brutto",
     "table": "12235", "function": "223", "contents": "KOSKBDUperskyss0000", "functions": ["223"]},
    # Barnehage
    {"area": "barnehage", "service": None, "key": "innb", "per": "innbygger 1–5 år", "basis": "netto",
     "table": "13502", "contents": "KOSutg020000", "functions": ["201", "211", "221"]},
    {"area": "barnehage", "service": None, "key": "barn", "per": "barn i kommunal barnehage", "basis": "korrigert brutto",
     "table": "12379", "contents": "KOSkbdbarn0000", "functions": ["201", "211", "221"]},
    {"area": "barnehage", "service": "201", "key": "barn", "per": "barn i kommunal barnehage", "basis": "korrigert brutto",
     "table": "12379", "contents": "KOSkbdf201barn0000", "functions": ["201"]},
    {"area": "barnehage", "service": "211", "key": "styrket", "per": "barn med styrket tilbud", "basis": "brutto",
     "table": "12379", "contents": "KOSbdbarnekstraa0000", "functions": ["211"]},
    {"area": "barnehage", "service": "211", "key": "barn", "per": "barn i kommunal barnehage", "basis": "korrigert brutto",
     "table": "12379", "contents": "KOSkbdf211barn0000", "functions": ["211"]},
    {"area": "barnehage", "service": "221", "key": "barn", "per": "barn i kommunal barnehage", "basis": "korrigert brutto",
     "table": "12379", "contents": "KOSkbdf221barn0000", "functions": ["221"]},
    # Barnevern
    {"area": "barnevern", "service": None, "key": "innb", "per": "innbygger 0–17 år", "basis": "netto",
     "table": "12279", "contents": "KOSndubvinnbygge0000", "functions": ["244", "251", "252"]},
    {"area": "barnevern", "service": None, "key": "tiltak", "per": "barn med tiltak", "basis": "netto",
     "table": "12279", "contents": "KOSndubvbvbarnti0000", "functions": ["244", "251", "252"]},
    {"area": "barnevern", "service": "244", "key": "barn", "per": "barn med undersøkelse eller tiltak", "basis": "brutto",
     "table": "12279", "contents": "KOSbdu244bvbarnu0000", "functions": ["244"]},
    {"area": "barnevern", "service": "251", "key": "barn", "per": "barn med tiltak som ikke er plassert", "basis": "brutto",
     "table": "12279", "contents": "KOSbdu251bvbarnt0000", "functions": ["251"]},
    {"area": "barnevern", "service": "252", "key": "barn", "per": "barn plassert av barnevernet", "basis": "netto",
     "table": "12279", "contents": "KOSndu252bvbarnt0000", "functions": ["252"]},
]


# Helse og omsorg per inhabitant in an age group, computed (see the docstring). ages is the age range (to None = and
# over). what replaces the area or service name in the sentence when the measure covers only part of it.
OMSORG = ["234", "253", "254", "257", "258", "261"]
AGE_MEASURES = [
    {"area": "helse", "service": None, "key": "67", "per": "innbygger 67 år og over", "ages": [67, None],
     "functions": OMSORG, "what": "omsorgstjenestene"},
    {"area": "helse", "service": None, "key": "80", "per": "innbygger 80 år og over", "ages": [80, None],
     "functions": OMSORG, "what": "omsorgstjenestene"},
    {"area": "helse", "service": "hjemmetjenester", "key": "67", "per": "innbygger 67 år og over", "ages": [67, None],
     "functions": ["254", "257", "258"]},
    {"area": "helse", "service": "hjemmetjenester", "key": "80", "per": "innbygger 80 år og over", "ages": [80, None],
     "functions": ["254", "257", "258"]},
    {"area": "helse", "service": "253", "key": "67", "per": "innbygger 67 år og over", "ages": [67, None], "functions": ["253"]},
    {"area": "helse", "service": "253", "key": "80", "per": "innbygger 80 år og over", "ages": [80, None], "functions": ["253"]},
    {"area": "helse", "service": "261", "key": "67", "per": "innbygger 67 år og over", "ages": [67, None], "functions": ["261"]},
    {"area": "helse", "service": "261", "key": "80", "per": "innbygger 80 år og over", "ages": [80, None], "functions": ["261"]},
    {"area": "helse", "service": "234", "key": "67", "per": "innbygger 67 år og over", "ages": [67, None], "functions": ["234"]},
    # Helsestasjon og skolehelsetjenesten is for 0–20 år, the age group SSB uses for its staffing figure in 12209.
    {"area": "helse", "service": "232", "key": "0-20", "per": "innbygger 0–20 år", "ages": [0, 20], "functions": ["232"]},
]
POP_TABLE = "07459"
AMOUNT_TABLE = "12362"
NORWAY, OSLO, NORDLAND = "0", "0301", "18"


def api(table: str) -> str:
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data"


def query(table: str, regions: str, contents: list[str], functions: list[str] | None, years: str) -> str:
    params = {"lang": "no", f"valueCodes[{DIM_REGION}]": regions, f"valueCodes[{DIM_CONTENTS}]": ",".join(contents),
              f"valueCodes[{DIM_YEAR}]": years}
    if functions:
        params[f"valueCodes[{DIM_FUNCTION}]"] = ",".join(functions)
    return api(table) + "?" + urllib.parse.urlencode(params, safe="[](),")


def compare_regions() -> list[dict]:
    """Narvik and the comparison regions from narvik.json, with old codes of renumbered kommuner."""
    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    return [{"key": "narvik", "code": REGION}] + [
        {"key": r["key"], "code": r["code"], "earlier": r.get("earlier", [])} for r in acc["compare"]]


def pop_query(regions: list[str], years: list[str]) -> str:
    params = {"lang": "no", "valueCodes[Region]": ",".join(regions), "valueCodes[Kjonn]": "1,2", "valueCodes[Alder]": "*",
              "valueCodes[ContentsCode]": "Personer1", "valueCodes[Tid]": ",".join(years)}
    return api(POP_TABLE) + "?" + urllib.parse.urlencode(params, safe="[]*,")


def amount_query(regions: str, functions: list[str], years: str) -> str:
    params = {"lang": "no", f"valueCodes[{DIM_REGION}]": regions, f"valueCodes[{DIM_FUNCTION}]": ",".join(functions),
              "valueCodes[KOKart0000]": "AGD2", f"valueCodes[{DIM_CONTENTS}]": "KOSbelop0000", f"valueCodes[{DIM_YEAR}]": years}
    return api(AMOUNT_TABLE) + "?" + urllib.parse.urlencode(params, safe="[](),")


def age_measures(regions: list[dict], codes: str) -> list[dict]:
    """AGE_MEASURES for Narvik and the comparison regions: netto from 12362 divided by inhabitants in the age group."""
    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    years = acc["years"]
    functions = list(dict.fromkeys(f for m in AGE_MEASURES for f in m["functions"]))
    url = amount_query(codes, functions, ",".join(years))
    print(f"Henter {url}", file=sys.stderr)
    amount = {}
    for c, v in cells(fetch(url)):
        if v is not None:
            amount[(c[DIM_REGION], c[DIM_FUNCTION], c[DIM_YEAR])] = v

    # Which 07459 regions make up each comparison region. A kommune that got a new number keeps its old one too.
    changes = fetch(f"{KLASS}/classifications/{KLASS_KOMMUNER}/changes?from={FIRST_YEAR}-01-01&to={dt.date.today().isoformat()}")
    before = {}
    for ch in changes["codeChanges"]:
        if ch["oldCode"] != ch["newCode"]:
            before.setdefault(ch["newCode"], []).append(ch["oldCode"])
    members = [m["code"] for m in acc["kostra_group"]["members"]]
    parts = {}
    for r in regions:
        kind = next((c["kind"] for c in acc["compare"] if c["key"] == r["key"]), "kommune")
        if r["key"] == "landet":
            parts[r["key"]] = ([NORWAY], [OSLO])
        elif r["key"] == "nordland":
            parts[r["key"]] = ([NORDLAND], [])
        elif kind == "gruppe":
            parts[r["key"]] = ([c for m in members for c in [m, *before.get(m, [])]], [])
        else:
            parts[r["key"]] = ([r["code"], *r.get("earlier", [])], [])
    pop_regions = list(dict.fromkeys(c for plus, minus in parts.values() for c in plus + minus))
    pop_years = [str(int(y) + 1) for y in years]
    url = pop_query(pop_regions, pop_years)
    print(f"Henter {url}", file=sys.stderr)
    people = {}  # (region, 07459 year, age) -> persons
    for c, v in cells(fetch(url)):
        if v:
            age = 105 if c["Alder"] == "105+" else int(c["Alder"])
            key = (c["Region"], c["Tid"], age)
            people[key] = people.get(key, 0) + v

    def population(key, y, lo, hi):
        plus, minus = parts[key]
        count = lambda rs: sum(n for (r, t, a), n in people.items() if r in rs and t == str(int(y) + 1) and a >= lo and (hi is None or a <= hi))
        return count(plus) - count(minus) or None

    # The whole population summed the same way should match the one KOSTRA uses; warn if a member kommune is missing.
    for r in acc["compare"]:
        for y in years:
            mine, theirs = population(r["key"], y, 0, None), r["population"].get(y)
            if mine and theirs and abs(mine / theirs - 1) > 0.005:
                print(f"Merk: {r['name']} {y} har {mine} innbyggere i 07459, men {theirs} i KOSTRA", file=sys.stderr)

    out = []
    for m in AGE_MEASURES:
        values, pops = {}, {}
        for r in regions:
            rc = [r["code"], *r.get("earlier", [])]
            values[r["key"]], pops[r["key"]] = {}, {}
            for y in years:
                vals = [amount[k] for k in ((c, f, y) for f in m["functions"] for c in rc) if k in amount]
                n = population(r["key"], y, *m["ages"])
                pops[r["key"]][y] = n
                values[r["key"]][y] = round(sum(vals) * 1000 / n) if vals and n else None
        out.append({**{k: v for k, v in m.items() if k != "ages"}, "basis": "netto", "beregnet": True,
                    "ssb": "Netto driftsutgifter", "table": AMOUNT_TABLE, "url": f"https://www.ssb.no/statbank/table/{AMOUNT_TABLE}",
                    "query": amount_query(codes, m["functions"], ",".join(years)),
                    "population": {"table": POP_TABLE, "url": f"https://www.ssb.no/statbank/table/{POP_TABLE}",
                                   "query": pop_query(parts["narvik"][0], pop_years), "values": pops},
                    "values": values})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    regions = compare_regions()
    codes = ",".join(c for r in regions for c in [r["code"], *r.get("earlier", [])])
    years: set = set()
    measures = []
    for table in dict.fromkeys(m["table"] for m in MEASURES):
        ms = [m for m in MEASURES if m["table"] == table]
        contents = list(dict.fromkeys(m["contents"] for m in ms))
        fs = list(dict.fromkeys(m["function"] for m in ms if m.get("function"))) or None
        url = query(table, codes, contents, fs, f"from({FIRST_YEAR})")
        print(f"Henter {url}", file=sys.stderr)
        ds = fetch(url)
        raw = {}
        for c, v in cells(ds):
            years.add(c[DIM_YEAR])
            if v is not None:
                raw[(c[DIM_REGION], c.get(DIM_FUNCTION), c[DIM_CONTENTS], c[DIM_YEAR])] = v
        names = labels(ds, DIM_CONTENTS)
        for m in ms:
            values = {}
            for r in regions:
                rc = [r["code"], *r.get("earlier", [])]
                values[r["key"]] = {y: next((raw[k] for k in ((c, m.get("function"), m["contents"], y) for c in rc) if k in raw), None)
                                    for y in sorted(years)}
            measures.append({**m, "ssb": names.get(m["contents"], m["contents"]),
                             "url": f"https://www.ssb.no/statbank/table/{table}",
                             "query": query(table, codes, [m["contents"]], [m["function"]] if m.get("function") else None, ",".join(sorted(years))),
                             "values": values})
            if values["narvik"].get(max(years)) is None:
                print(f"Merk: Narvik mangler {table} {m['contents']} for {max(years)}", file=sys.stderr)

    measures += age_measures(regions, codes)

    data = {
        "generated": dt.date.today().isoformat(),
        "regions": codes,
        "years": sorted(years | set(json.loads(ACCOUNTS.read_text(encoding="utf-8"))["years"])),
        "measures": measures,
    }
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {args.out.relative_to(ROOT)}: {len(measures)} mål, år {data['years'][0]}–{data['years'][-1]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
