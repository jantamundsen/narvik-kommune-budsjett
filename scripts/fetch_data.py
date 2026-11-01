#!/usr/bin/env python3
"""Fetch Narvik's KOSTRA accounts from SSB and write site/data/narvik.json.

Source: SSB table 12362 "Utgifter til tjenesteområdene, kommunekonsern, etter
funksjon og art (K)", net operating expenditure (art AGD2), via PxWebApi v2.
The same table gives the comparison regions in COMPARE: three similar kommuner,
Narvik's KOSTRA group (looked up in SSB's KLASS 112), Nordland and the country without Oslo.

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

NARVIK = "1806"
# Regions Narvik is compared with, in the order the site lists them. "gruppe" is filled in
# from KLASS (Narvik's KOSTRA group); the code here is only used with --from-file.
COMPARE = [
    {"key": "gruppe", "code": "EKG09", "name": "KOSTRA-gruppe 9", "kind": "gruppe"},
    {"key": "landet", "code": "EAKUO", "name": "Landet uten Oslo", "kind": "snitt"},
    {"key": "nordland", "code": "EKA18", "name": "Nordland", "kind": "snitt"},
    # Harstad and Alta got new numbers when Troms og Finnmark was split in 2024, with the same borders.
    {"key": "harstad", "code": "5503", "earlier": ["5402"], "name": "Harstad", "kind": "kommune"},
    {"key": "rana", "code": "1833", "name": "Rana", "kind": "kommune"},
    {"key": "alta", "code": "5601", "earlier": ["5403"], "name": "Alta", "kind": "kommune"},
]
KLASS = "https://data.ssb.no/api/klass/v1"
KLASS_GROUPS = "112"  # Kodeliste for KOSTRA - kommunegruppering
KLASS_KOMMUNER = "131"  # Standard for kommuneinndeling
KLASS_URL = "https://www.ssb.no/klass/klassifikasjoner/112"
AMOUNT = "KOSbelop0000"  # 1000 kr
PER_CAPITA = "KOSbelopinnbygge0000"  # kr per inhabitant

DIM_REGION = "KOKkommuneregion0000"
DIM_FUNCTION = "KOKfunksjon0000"
DIM_ART = "KOKart0000"
DIM_CONTENTS = "ContentsCode"
DIM_YEAR = "Tid"


def build_url(regions: dict) -> str:
    params = {
        "lang": "no",
        f"valueCodes[{DIM_REGION}]": ",".join(regions.values()),
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


def kostra_group(date: str) -> dict:
    """Narvik's KOSTRA group and its members on a date, from SSB's classification KLASS 112."""
    corr = fetch(f"{KLASS}/classifications/{KLASS_GROUPS}/correspondsAt?targetClassificationId={KLASS_KOMMUNER}&date={date}")
    items = corr["correspondenceItems"]
    code = next(i["sourceCode"] for i in items if i["targetCode"] == NARVIK)
    group = fetch(f"{KLASS}/classifications/{KLASS_GROUPS}")
    version = fetch(group["versions"][-1]["_links"]["self"]["href"])
    item = next(i for i in version["classificationItems"] if i["code"] == code)
    return {
        "code": code,
        "name": item["name"],
        "description": (item.get("notes") or "").strip(),
        "version": version["name"],
        "members": sorted(({"code": i["targetCode"], "name": i["targetName"]} for i in items if i["sourceCode"] == code), key=lambda m: m["name"]),
        "source": {"name": f"SSB KLASS {KLASS_GROUPS}, {version['name']}, kommuneinndeling per {date}", "url": KLASS_URL},
    }


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


def registered_population() -> dict:
    """Narvik's registered population 1 January (SSB 06913), by year."""
    url = ("https://data.ssb.no/api/pxwebapi/v2/tables/06913/data?lang=no&valueCodes[Region]=" + NARVIK
           + "&valueCodes[ContentsCode]=Folkemengde&valueCodes[Tid]=*&outputFormat=json-stat2")
    try:
        ds = fetch(url)
    except Exception as e:  # the derived population is close enough to fall back on
        print(f"MERK: fikk ikke folketallet fra 06913 ({e}), bruker utledet folketall.", file=sys.stderr)
        return {}
    years = ds["dimension"]["Tid"]["category"]["index"]
    return {y: ds["value"][i] for y, i in years.items() if ds["value"][i] is not None}


def transform(ds: dict, config: dict, compare: list, group: dict | None, registered: dict | None = None) -> dict:
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
    for r in compare:  # fill years before a renumbering from the old code
        for old in r.get("earlier", []):
            for table in (amount, per_cap):
                for (reg, f, y), v in list(table.items()):
                    if reg == old:
                        table.setdefault((r["code"], f, y), v)
    narvik = NARVIK
    fn_labels = labels(ds, DIM_FUNCTION)

    # Only numeric KOSTRA functions; SSB's FGK groups overlap and would double count.
    functions = sorted({f for (r, f, _y) in amount if r == narvik and f.isdigit()})

    # Population is not in the table. Derive it per year from amount / per-capita,
    # taking the median over functions so one rounded value cannot skew it.
    def population_of(region):
        out = {}
        for y in years:
            ratios = [
                amount[(region, f, y)] * 1000 / per_cap[(region, f, y)]
                for f in functions
                if abs(amount.get((region, f, y)) or 0) >= 10000 and per_cap.get((region, f, y))
            ]
            out[y] = round(statistics.median(ratios)) if ratios else None
        return out

    population = population_of(narvik)
    # The derived value can be a person or two off, because SSB rounds kroner per innbygger. KOSTRA divides by the
    # population at the end of the year, which is the registered population 1 January the year after, so use that
    # when SSB has it. Then the site shows the same folketall on every page.
    for y in years:
        reg = (registered or {}).get(str(int(y) + 1))
        if reg and population[y] and abs(reg - population[y]) <= 10:
            population[y] = reg

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
            r["key"]: {y: region_sum(per_cap, r["code"], fs, y) for y in years}
            for r in compare
        }
        # SSB's own kroner per innbygger, summed over the functions like for the other regions, so the number is
        # the same as where the site quotes SSB directly. Computed only if SSB has none.
        per_capita["narvik"] = {
            y: region_sum(per_cap, narvik, fs, y)
            if region_sum(per_cap, narvik, fs, y) is not None or not population[y]
            else round(narvik_amount[y] * 1000 / population[y]) for y in years
        }
        categories.append({
            "key": cat["key"],
            "name": cat["name"],
            "description": cat["description"],
            "functions": fs,
            **({"services": cat["services"]} if cat.get("services") else {}),
            "narvik_1000kr": narvik_amount,
            "per_capita": per_capita,
        })

    return {
        "generated": dt.date.today().isoformat(),
        "source": {"table": "12362", "url": TABLE_URL, "api": API, "art": "AGD2 Netto driftsutgifter", "region": "1806 Narvik",
                   "dims": {"region": DIM_REGION, "function": DIM_FUNCTION, "art": DIM_ART, "contents": DIM_CONTENTS, "year": DIM_YEAR},
                   "per_capita": PER_CAPITA},
        # Per capita for these regions is SSB's own "beløp per innbygger", summed over the functions of each area.
        # Population is derived like Narvik's, and used to put SSB 12367 amounts per inhabitant.
        "compare": [
            {**r, "population": population_of(r["code"])}
            for r in compare
        ],
        "kostra_group": group,
        "years": years,
        "offset_categories": config.get("offset_categories", []),
        "population": population,
        "total_1000kr": {y: sum(c["narvik_1000kr"][y] for c in categories) for y in years},
        "categories": categories,
        "functions": {
            f: {"name": fn_labels.get(f, "").split(" ", 1)[-1] if fn_labels.get(f, "").startswith(f) else fn_labels.get(f, ""),
                "narvik_1000kr": {y: amount.get((narvik, f, y)) for y in years},
                # SSB's "beløp per innbygger" for Narvik and each comparison region, for the service level.
                "per_capita": {k: {y: per_cap.get((code, f, y)) for y in years}
                               for k, code in [("narvik", narvik), *((r["key"], r["code"]) for r in compare)]}}
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
    compare = [dict(r) for r in COMPARE]
    group = None
    if args.from_file:
        ds = json.loads(args.from_file.read_text(encoding="utf-8"))
    else:
        group = kostra_group(dt.date.today().replace(month=1, day=1).isoformat())
        g = next(r for r in compare if r["key"] == "gruppe")
        if group["code"] != g["code"]:
            print(f"MERK: Narvik er nå i {group['code']} {group['name']}, ikke {g['code']}. Oppdater COMPARE.", file=sys.stderr)
        g.update(code=group["code"], name=group["name"])
        url = build_url({"narvik": NARVIK, **{c: c for r in compare for c in [r["code"], *r.get("earlier", [])]}})
        print(f"Henter {url}", file=sys.stderr)
        ds = fetch(url)

    data = transform(ds, config, compare, group, None if args.from_file else registered_population())
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
