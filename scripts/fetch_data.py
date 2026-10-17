#!/usr/bin/env python3
"""Fetch Narvik's KOSTRA accounts from SSB and write site/data/narvik.json.

Source: SSB table 12362 "Utgifter til tjenesteområdene, kommunekonsern, etter
funksjon og art (K)", net operating expenditure (art AGD2), via PxWebApi v2.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_data.py                 # fetch from SSB
    python scripts/fetch_data.py --from-file x   # use a saved JSON-stat response
"""
from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import statistics
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "categories.json"
OUT = ROOT / "site" / "data" / "narvik.json"

API = "https://data.ssb.no/api/pxwebapi/v2/tables/12362/data"
TABLE_URL = "https://www.ssb.no/statbank/table/12362"
FIRST_YEAR = 2021  # Narvik got its current borders (code 1806) in 2020

REGIONS = {"narvik": "1806", "landet": "EAK", "nordland": "EKA18"}
AMOUNT = "KOSbelop0000"  # 1000 kr
PER_CAPITA = "KOSbelopinnbygge0000"  # kr per inhabitant

DIM_REGION = "KOKkommuneregion0000"
DIM_FUNCTION = "KOKfunksjon0000"
DIM_ART = "KOKart0000"
DIM_CONTENTS = "ContentsCode"
DIM_YEAR = "Tid"


def build_url() -> str:
    params = {
        "lang": "no",
        f"valueCodes[{DIM_REGION}]": ",".join(REGIONS.values()),
        f"valueCodes[{DIM_FUNCTION}]": "*",
        f"valueCodes[{DIM_ART}]": "AGD2",
        f"valueCodes[{DIM_CONTENTS}]": f"{AMOUNT},{PER_CAPITA}",
        f"valueCodes[{DIM_YEAR}]": f"from({FIRST_YEAR})",
    }
    return API + "?" + urllib.parse.urlencode(params, safe="[]*(),")


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "narvik-kommune-budsjett"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def cells(ds: dict):
    """Yield ({dim: code}, value) for every cell of a JSON-stat2 dataset."""
    dims = ds["id"]
    codes = []
    for d in dims:
        index = ds["dimension"][d]["category"]["index"]
        if isinstance(index, list):
            codes.append(index)
        else:
            codes.append(sorted(index, key=index.get))
    values = ds["value"]
    if isinstance(values, dict):  # sparse form
        values = [values.get(str(i)) for i in range(len(list(itertools.product(*codes))))]
    for i, combo in enumerate(itertools.product(*codes)):
        yield dict(zip(dims, combo)), values[i]


def labels(ds: dict, dim: str) -> dict:
    return ds["dimension"][dim]["category"].get("label", {})


def transform(ds: dict, config: dict) -> dict:
    amount: dict = {}  # (region, function, year) -> 1000 kr
    per_cap: dict = {}  # (region, function, year) -> kr
    years: set = set()
    for c, v in cells(ds):
        if c[DIM_ART] != "AGD2" or v is None:
            continue
        key = (c[DIM_REGION], c[DIM_FUNCTION], c[DIM_YEAR])
        years.add(c[DIM_YEAR])
        (amount if c[DIM_CONTENTS] == AMOUNT else per_cap)[key] = v
    years = sorted(years)
    narvik = REGIONS["narvik"]
    fn_labels = labels(ds, DIM_FUNCTION)

    # Only numeric KOSTRA functions; SSB's FGK groups overlap and would double count.
    functions = sorted({f for (r, f, _y) in amount if r == narvik and f.isdigit()})

    # Population is not in the table. Derive it per year from amount / per-capita,
    # taking the median over functions so one rounded value cannot skew it.
    population = {}
    for y in years:
        ratios = [
            amount[(narvik, f, y)] * 1000 / per_cap[(narvik, f, y)]
            for f in functions
            if abs(amount.get((narvik, f, y)) or 0) >= 10000 and per_cap.get((narvik, f, y))
        ]
        population[y] = round(statistics.median(ratios)) if ratios else None

    mapped = {f for cat in config["categories"] for f in cat["functions"]}
    unmapped = sorted(f for f in functions if f not in mapped and any(amount.get((narvik, f, y)) for y in years))

    def region_sum(table, region, fs, y):
        vals = [table.get((region, f, y)) for f in fs]
        vals = [v for v in vals if v is not None]
        return sum(vals) if vals else None

    categories = []
    for cat in config["categories"]:
        fs = cat["functions"]
        narvik_amount = {y: region_sum(amount, narvik, fs, y) or 0 for y in years}
        per_capita = {
            name: {y: region_sum(per_cap, code, fs, y) for y in years}
            for name, code in REGIONS.items() if name != "narvik"
        }
        per_capita["narvik"] = {
            y: round(narvik_amount[y] * 1000 / population[y]) if population[y] else None for y in years
        }
        categories.append({
            "key": cat["key"],
            "name": cat["name"],
            "description": cat["description"],
            "functions": fs,
            "narvik_1000kr": narvik_amount,
            "per_capita": per_capita,
        })

    return {
        "generated": dt.date.today().isoformat(),
        "source": {"table": "12362", "url": TABLE_URL, "art": "AGD2 Netto driftsutgifter", "region": "1806 Narvik"},
        "years": years,
        "offset_categories": config.get("offset_categories", []),
        "population": population,
        "total_1000kr": {y: sum(c["narvik_1000kr"][y] for c in categories) for y in years},
        "categories": categories,
        "functions": {
            f: {"name": fn_labels.get(f, "").split(" ", 1)[-1] if fn_labels.get(f, "").startswith(f) else fn_labels.get(f, ""),
                "narvik_1000kr": {y: amount.get((narvik, f, y)) for y in years}}
            for f in functions
        },
        "unmapped": unmapped,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-file", type=Path, help="read a saved JSON-stat2 response instead of calling SSB")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if args.from_file:
        ds = json.loads(args.from_file.read_text(encoding="utf-8"))
    else:
        url = build_url()
        print(f"Henter {url}", file=sys.stderr)
        ds = fetch(url)

    data = transform(ds, config)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Skrev {args.out.relative_to(ROOT)}: år {data['years'][0]}–{data['years'][-1]}, "
          f"{len(data['functions'])} funksjoner", file=sys.stderr)
    if data["unmapped"]:
        print(f"ADVARSEL: funksjoner uten kategori i config/categories.json: {', '.join(data['unmapped'])}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
