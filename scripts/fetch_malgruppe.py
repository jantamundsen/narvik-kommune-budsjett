#!/usr/bin/env python3
"""Fetch spending per pupil, per child and per inhabitant in the age group, and write site/data/malgruppe.json.

Per inhabitant says little about a school or a kindergarten when kommuner have different shares of
children. SSB's KOSTRA key figures put the same spending per user instead: per pupil, per child in a
kommunal kindergarten, per child in the child welfare service, or per inhabitant of the age the service is for.
Each measure below is one ContentsCode in one SSB table (and for 12235 one function), fetched for Narvik
and the comparison regions in narvik.json, as SSB publishes it. Nothing is computed here.

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

from fetch_data import FIRST_YEAR, cells, fetch, labels

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
    # Grunnskole
    {"area": "skole", "service": None, "key": "innb", "per": "innbygger 6–15 år", "basis": "netto",
     "table": "12255", "contents": "KOSregnind20000", "functions": ["202", "215", "222", "223"]},
    {"area": "skole", "service": None, "key": "elev", "per": "elev", "basis": "korrigert brutto",
     "table": "12235", "function": "FGK8a", "contents": "KOSKBDUperelev0000", "functions": ["202", "222", "223"]},
    {"area": "skole", "service": "202", "key": "elev", "per": "elev", "basis": "korrigert brutto",
     "table": "12235", "function": "202", "contents": "KOSKBDUperelev0000", "functions": ["202"]},
    {"area": "skole", "service": "215", "key": "elev", "per": "elev", "basis": "korrigert brutto",
     "table": "12235", "function": "215", "contents": "KOSKBDUperelev0000", "functions": ["215"]},
    {"area": "skole", "service": "222", "key": "elev", "per": "elev", "basis": "korrigert brutto",
     "table": "12235", "function": "222", "contents": "KOSKBDUperelev0000", "functions": ["222"]},
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

    data = {
        "generated": dt.date.today().isoformat(),
        "regions": codes,
        "years": sorted(years),
        "measures": measures,
    }
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {args.out.relative_to(ROOT)}: {len(measures)} mål, år {data['years'][0]}–{data['years'][-1]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
