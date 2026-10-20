#!/usr/bin/env python3
"""Fetch housing figures for Narvik from SSB and write site/data/bolig.json for bolig.html.

Everything is SSB's own numbers, fetched per table, except new dwellings per 1000 inhabitants in the
comparison, which is SSB's count divided by the population KOSTRA uses (from narvik.json) and is marked
«beregnet» on the page.

Tables:
    06265  dwellings by type of building (Narvik, every year from 2020)
    06266  dwellings by year of construction (newest year, summed over the types of building)
    12941  dwellings by type of building, per cent (comparison)
    05940  dwellings started and completed per year
    14310  average price per square metre and number of sales, by type of dwelling, per quarter
    14891  households by tenure: owner, housing cooperative or share, renter
    14903  crowded households
    12008  dwellings the kommune has at its disposal (KOSTRA)
    12012  applications for and refusals of those dwellings (KOSTRA)

The comparison is Harstad, Rana and Alta, Nordland and the whole country, and for the two KOSTRA tables
also KOSTRA-gruppe 9 and the country without Oslo, as on the rest of the site. Harstad and Alta have old
numbers before 2024 (5402, 5403); for each year the number that has a value is used.
Narvik got its current borders (code 1806) in 2020, so SSB has no figures for it before that.
Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_bolig.py
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
OUT = ROOT / "site" / "data" / "bolig.json"
ACCOUNTS = ROOT / "site" / "data" / "narvik.json"
REGION = "1806"
FIRST = 2020
KOSTRA_REGION = "KOKkommuneregion0000"

# Types of building in 06265, 06266 and 12941.
TYPES = [
    ("01", "Enebolig"),
    ("02", "Tomannsbolig"),
    ("03", "Rekkehus, kjedehus og andre småhus"),
    ("04", "Boligblokk"),
    ("05", "Bygning for bofellesskap"),
    ("999", "Andre bygningstyper"),
]
# Types of dwelling in the price table 14310.
PRICE_TYPES = [("00", "Alle boligtyper"), ("01", "Eneboliger"), ("02", "Småhus"), ("03", "Blokkleiligheter")]
TENURE = [("1", "Selveier"), ("2", "Andels- eller aksjeeier"), ("3", "Leier")]
# The KOSTRA figures the page shows from 12008 and 12012.
MUNICIPAL = {
    "KOSboligersamlet0000": "total",
    "KOSboligSper10000000": "per_1000",
    "KOSboligeid0000": "owned",
    "KOSboliginnleid0000": "rented_in",
    "KOSboligpkommuna0000": "private",
    "KOSAndeltilgjeng0000": "accessible_pct",
}
APPLICATIONS = {
    "KOSantallsoknade0000": "applications",
    "KOSantallavslag0000": "refusals",
    "KOSandelavslag0000": "refused_pct",
    "KOSnyesoknader0000": "new_applications",
}


def url(table: str, **codes: str) -> str:
    params = {"lang": "no", **{f"valueCodes[{k}]": v for k, v in codes.items()}}
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data?" + urllib.parse.urlencode(params, safe="[]*,()")


def source(table: str, query: str) -> dict:
    return {"table": table, "url": f"https://www.ssb.no/statbank/table/{table}", "query": query}


def get(query: str) -> dict:
    print(f"Henter {query}", file=sys.stderr)
    return fetch(query)


def regions() -> tuple[list[dict], dict, dict]:
    """The regions in the comparison, their SSB codes in the ordinary tables and in the KOSTRA tables."""
    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    kommuner = [r for r in acc["compare"] if r["kind"] == "kommune"]
    out = [{"key": "narvik", "name": "Narvik", "kind": "kommune", "population": acc["population"]}]
    out += [{"key": r["key"], "name": r["name"], "kind": "kommune", "population": r["population"]} for r in kommuner]
    nordland = next(r for r in acc["compare"] if r["key"] == "nordland")
    out += [{"key": "nordland", "name": "Nordland", "kind": "fylke", "population": nordland["population"]},
            {"key": "norge", "name": "Hele landet", "kind": "landet"}]
    plain = {"narvik": [REGION], **{r["key"]: [r["code"], *r.get("earlier", [])] for r in kommuner}, "nordland": ["18"], "norge": ["0"]}
    kostra = {"narvik": [REGION], **{r["key"]: [r["code"], *r.get("earlier", [])] for r in acc["compare"]}}
    for r in acc["compare"]:
        if r["kind"] != "kommune" and r["key"] != "nordland":
            out.append({"key": r["key"], "name": r["name"], "kind": r["kind"], "kostra_only": True})
    return out, plain, kostra


def pick(ds: dict, region_dim: str, codes: dict, key_dims: list[str]) -> dict:
    """{region key: {tuple of key_dims codes (or the single code): value}}, the first code with a value winning."""
    out: dict = {}
    for c, v in cells(ds):
        if v is None:
            continue
        for k, cs in codes.items():
            if c[region_dim] in cs:
                key = tuple(c[d] for d in key_dims)
                out.setdefault(k, {}).setdefault(key[0] if len(key) == 1 else "|".join(key), v)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    regs, plain, kostra = regions()
    all_plain = ",".join(c for cs in plain.values() for c in cs)
    all_kostra = ",".join(c for cs in kostra.values() for c in cs)
    current = ",".join(cs[0] for cs in plain.values())  # tables that only have today's kommune numbers
    sources = {}

    # The stock, every year for Narvik.
    q = url("06265", Region=REGION, BygnType="*", ContentsCode="Boliger", Tid=f"from({FIRST})")
    sources["06265"] = source("06265", q)
    stock: dict = {}
    for c, v in cells(get(q)):
        if v is not None:
            stock.setdefault(c["Tid"], {})[c["BygnType"]] = v
    year = max(stock)

    # Age of the stock in the newest year, summed over the types of building.
    q = url("06266", Region=all_plain, BygnType="*", BygnAr="*", ContentsCode="Boliger", Tid=year)
    sources["06266"] = source("06266", q)
    ds = get(q)
    periods = labels(ds, "BygnAr")
    by_code: dict = {}
    for c, v in cells(ds):
        if v is None:
            continue
        for k, cs in plain.items():
            if c["Region"] in cs:
                slot = by_code.setdefault(k, {}).setdefault(c["Region"], {})
                slot[c["BygnAr"]] = slot.get(c["BygnAr"], 0) + v
    # Keep the code with the most dwellings (Harstad and Alta changed number in 2024).
    age = {k: max(codes.values(), key=lambda d: sum(d.values())) for k, codes in by_code.items()}

    # Shares by type, for the comparison.
    q = url("12941", Region=all_plain, BygnType="*", ContentsCode="Boliger", Tid=year)
    sources["12941"] = source("12941", q)
    shares = pick(get(q), "Region", plain, ["BygnType"])

    # New dwellings, summed over the detailed building types.
    q = url("05940", Region=all_plain, Byggeareal="*", ContentsCode="Igangsatte,Fullforte", Tid=f"from({FIRST})")
    sources["05940"] = source("05940", q)
    new: dict = {}
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in plain.items():
            if c["Region"] in cs:
                slot = new.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(c["ContentsCode"], {})
                slot[c["Region"]] = slot.get(c["Region"], 0) + v
    # Keep one code per region and year: the one with figures (Harstad and Alta changed number in 2024).
    built = {k: {y: {m: max(by.values()) for m, by in ms.items()} for y, ms in ys.items()} for k, ys in new.items()}

    # Prices per quarter.
    q = url("14310", Region=current, Boligtype="*", ContentsCode="KvPris,Omsetninger", Tid="*")
    sources["14310"] = source("14310", q)
    prices: dict = {}
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in plain.items():
            if c["Region"] in cs:
                prices.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(c["Boligtype"], {})[
                    "price" if c["ContentsCode"] == "KvPris" else "sales"] = v

    # Tenure and crowding, every year for every region.
    q = url("14891", Region=current, EierStatus="*", ContentsCode="Husholdning,HusholdningProsent", Tid=f"from({FIRST})")
    sources["14891"] = source("14891", q)
    tenure: dict = {}
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in plain.items():
            if c["Region"] in cs:
                field = "pct" if c["ContentsCode"] == "HusholdningProsent" else "n"
                tenure.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(c["EierStatus"], {}).setdefault(field, v)
    q = url("14903", Region=current, Trangboddhet="1", ContentsCode="Husholdning,HusholdningProsent", Tid=f"from({FIRST})")
    sources["14903"] = source("14903", q)
    crowded: dict = {}
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in plain.items():
            if c["Region"] in cs:
                field = "pct" if c["ContentsCode"] == "HusholdningProsent" else "n"
                crowded.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(field, v)

    # Municipal dwellings and applications (KOSTRA).
    q = url("12008", **{KOSTRA_REGION: all_kostra}, ContentsCode=",".join(MUNICIPAL), Tid=f"from({FIRST})")
    sources["12008"] = source("12008", q)
    municipal: dict = {}
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in kostra.items():
            if c[KOSTRA_REGION] in cs:
                municipal.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(MUNICIPAL[c["ContentsCode"]], v)
    q = url("12012", **{KOSTRA_REGION: all_kostra}, ContentsCode=",".join(APPLICATIONS), Tid=f"from({FIRST})")
    sources["12012"] = source("12012", q)
    for c, v in cells(get(q)):
        if v is None:
            continue
        for k, cs in kostra.items():
            if c[KOSTRA_REGION] in cs:
                municipal.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(APPLICATIONS[c["ContentsCode"]], v)

    data = {
        "generated": dt.date.today().isoformat(),
        "region": REGION,
        "year": year,
        "types": [{"code": c, "name": n} for c, n in TYPES],
        "price_types": [{"code": c, "name": n} for c, n in PRICE_TYPES],
        "tenure_types": [{"code": c, "name": n} for c, n in TENURE],
        "periods": [{"code": c, "name": n} for c, n in periods.items()],
        "regions": regs,
        "stock": stock,
        "age": age,
        "shares": shares,
        "built": built,
        "prices": prices,
        "tenure": tenure,
        "crowded": crowded,
        "municipal": municipal,
        "sources": sources,
    }
    total = sum(stock[year].values())
    print(f"Skrev {args.out.relative_to(ROOT)}: {total} boliger i {year}, priser til {max(prices['narvik'])}", file=sys.stderr)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
