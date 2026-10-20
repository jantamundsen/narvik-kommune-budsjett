#!/usr/bin/env python3
"""Fetch Narvik's income, operating result, funds, debt and investments from SSB and write
site/data/finans.json for inntekter.html and gjeld.html.

The largest investment projects per year are typed in from the årsrapporter in config/investeringer.json and
copied in after a check, with their documents from config/fakta.json.

Tables, all KOSTRA kommunekonsern (the same scope as the rest of the site):
    12364  Finansielle grunnlagsdata: amounts in 1000 kr for Narvik
    12137  Finansielle nøkkeltall i kroner per innbygger, for Narvik and the comparison regions
    12143  Finansielle nøkkeltall i prosent av brutto driftsinntekter, for Narvik and the comparison regions

The comparison regions are the ones in narvik.json (written by fetch_data.py). Harstad and Alta have old
numbers before 2024 (5402, 5403); for each year the number that has a value is used.
Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_finans.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

from fetch_data import cells, fetch, labels

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "finans.json"
ACCOUNTS = ROOT / "site" / "data" / "narvik.json"
INVESTMENTS = ROOT / "config" / "investeringer.json"
FAKTA = ROOT / "config" / "fakta.json"
REGION = "1806"
FIRST = 2021
DIM_REGION, DIM_ART = "KOKkommuneregion0000", "KOKartkap0000"

# Narvik's amounts (1000 kr) from 12364.
AMOUNTS = [
    # Where the operating income comes from; together they are AGD13 brutto driftsinntekter.
    "AG12", "A800", "AG10", "A810", "AGD16", "AD729", "AGD62", "AGD13", "AG11",
    # From income to result, and the fund.
    "AGD9", "AGD18", "AGD23", "56", "AGD21", "AGD24", "AD905", "AGD97", "AGD86",
    # Debt and investments.
    "KG31", "KG32", "KG25", "40", "KG39", "KG40", "AGI1", "AGI29", "AGI21", "AI729", "A590",
]
# Per inhabitant (12137) and share of brutto driftsinntekter (12143) for Narvik and the comparison regions.
PER_CAPITA = ["AGD13", "AG11", "AG12", "A800", "AG10", "AGD23", "KG31", "KG32", "AGI1", "40"]
SHARE = ["AGD23", "56", "KG31", "KG25", "AGD21", "AGD97", "AGD86", "KG39", "KG40", "AGI1"]


def url(table: str, regions: list[str], arts: list[str], contents: str) -> str:
    params = {
        "lang": "no",
        f"valueCodes[{DIM_REGION}]": ",".join(regions),
        f"valueCodes[{DIM_ART}]": ",".join(arts),
        "valueCodes[ContentsCode]": contents,
        "valueCodes[Tid]": f"from({FIRST})",
    }
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data?" + urllib.parse.urlencode(params, safe="[]*,()")


def get(query: str) -> dict:
    print(f"Henter {query}", file=sys.stderr)
    return fetch(query)


def source(table: str, query: str) -> dict:
    return {"table": table, "url": f"https://www.ssb.no/statbank/table/{table}", "query": query}


def by_region(ds: dict, codes: dict) -> dict:
    """{region key: {art: {year: value}}}, taking for each year whichever of a region's codes has a value."""
    out: dict = {}
    for c, v in cells(ds):
        if v is None:
            continue
        for key, cs in codes.items():
            if c[DIM_REGION] in cs:
                out.setdefault(key, {}).setdefault(c[DIM_ART], {}).setdefault(c["Tid"], v)
    return out


def investments() -> dict:
    """config/investeringer.json per year, with each year's document from fakta.json. Exits on a typo."""
    cfg = json.loads(INVESTMENTS.read_text(encoding="utf-8"))["aar"]
    sources = json.loads(FAKTA.read_text(encoding="utf-8"))["kilder"]
    errors, out = [], {}
    for y, v in cfg.items():
        k = sources.get(v.get("kilde"))
        if not k:
            errors.append(f"{y}: ukjent kilde «{v.get('kilde')}»")
            continue
        listed = sum(p["belop"] for p in v["prosjekter"])
        if listed > v["total"]:
            errors.append(f"{y}: prosjektene summerer til {listed}, mer enn totalen {v['total']}")
        for p in v["prosjekter"]:
            if not p.get("navn") or not isinstance(p.get("belop"), int) or not p.get("sider"):
                errors.append(f"{y}: prosjektet {p} mangler navn, belop eller sider")
        out[y] = {**v, "kilde": {"id": v["kilde"], **{key: k[key] for key in ("navn", "full", "pdf")}}}
    if errors:
        sys.exit("config/investeringer.json har feil:\n  " + "\n  ".join(errors))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    regions = [{"key": "narvik", "name": "Narvik", "kind": "kommune"}] + [
        {"key": r["key"], "name": r["name"], "kind": r["kind"]} for r in acc["compare"]]
    codes = {"narvik": [REGION], **{r["key"]: [r["code"], *r.get("earlier", [])] for r in acc["compare"]}}
    all_codes = [c for cs in codes.values() for c in cs]

    q_amount = url("12364", [REGION], AMOUNTS, "KOSbelop0000")
    ds = get(q_amount)
    names = labels(ds, DIM_ART)
    amounts = by_region(ds, {"narvik": [REGION]}).get("narvik", {})
    years = sorted({y for v in amounts.values() for y in v})

    q_cap = url("12137", all_codes, PER_CAPITA, "KOSbelopprinnb0000")
    q_share = url("12143", all_codes, SHARE, "KOSbelopbrinv0000")
    ds_cap, ds_share = get(q_cap), get(q_share)
    names.update(labels(ds_cap, DIM_ART))
    names.update(labels(ds_share, DIM_ART))

    data = {
        "generated": dt.date.today().isoformat(),
        "region": REGION,
        "years": years,
        "labels": {a: names.get(a, a) for a in dict.fromkeys(AMOUNTS + PER_CAPITA + SHARE)},
        "amounts": amounts,
        "per_capita": by_region(ds_cap, codes),
        "share": by_region(ds_share, codes),
        "regions": regions,
        "kostra_group_size": len(acc["kostra_group"]["members"]),
        "investeringer": investments(),
        "sources": {
            "12364": source("12364", url("12364", [REGION], ["*"], "KOSbelop0000")),
            "12137": source("12137", url("12137", [REGION] + all_codes[1:], ["*"], "KOSbelopprinnb0000")),
            "12143": source("12143", url("12143", [REGION] + all_codes[1:], ["*"], "KOSbelopbrinv0000")),
        },
    }
    # The income sources must add up to brutto driftsinntekter, or the page's «av hver hundrelapp» is wrong.
    parts = ["AG12", "A800", "AG10", "A810", "AGD16", "AD729", "AGD62"]
    for y in years:
        total = amounts.get("AGD13", {}).get(y)
        s = sum(amounts.get(a, {}).get(y) or 0 for a in parts)
        if total and abs(s - total) > 5:
            print(f"Advarsel: inntektene for {y} summerer til {s}, ikke {total} (brutto driftsinntekter)", file=sys.stderr)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {args.out.relative_to(ROOT)}: {years[0]}–{years[-1]}, {len(regions)} regioner", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
