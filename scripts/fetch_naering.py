#!/usr/bin/env python3
"""Fetch figures on businesses in Narvik from SSB and Brønnøysundregistrene and write site/data/naering.json for
naering.html.

SSB:
    10309  bedrifter (local units) by main industry (SN2007) and number of employees, 1 January, from 2009
    08076  new enterprises each quarter, except public administration and primary industries
    07165  bankruptcies opened each quarter
    13701  new enterprises with activity, and how many of them were still there one, two and three years later
    12894  overnight stays each month, hotels and camping/cabins/hostels, from 2024
    07459  population 1 January, to give the numbers per 1 000 inhabitants
SSB moves to the new industry standard SN2025 from 2026. The totals used here continue in both standards; the
breakdown by industry (10309) is SN2007.

Brønnøysundregistrene, Enhetsregisteret (open API, data.brreg.no): the local units (underenheter) in Narvik with
at least 50 registered employees, with the sector of the enterprise they belong to.

The comparison is Harstad, Rana and Alta, Nordland and the whole country, as on arbeid.html. Harstad and Alta have
old numbers before 2024 (5402, 5403); for each year the number that has a value is used. Narvik got its current
borders (code 1806) in 2020, so the series start there.
Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_naering.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

from fetch_arbeid import REGIONS, ALL_CODES, by_region, region_of, source, url, get
from fetch_data import cells, fetch, labels

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "naering.json"
REGION = "1806"
FIRST = 2020
BRREG = "https://data.brreg.no/enhetsregisteret/api"
MIN_EMPLOYEES = 50

# The sector of the enterprise a local unit belongs to, from its institusjonell sektorkode and organisasjonsform.
SECTORS = {"6100": "Staten", "1110": "Statlig eid foretak", "1120": "Statlig eid foretak",
           "1510": "Kommunalt eid foretak", "1520": "Kommunalt eid foretak"}


def quarterly(ds: dict) -> dict:
    """{region key: {quarter: value}}, the first code with a value other than 0 winning."""
    out: dict = {}
    for c, v in cells(ds):
        k = region_of(c["Region"])
        if k and v is not None and not out.get(k, {}).get(c["Tid"]):
            out.setdefault(k, {})[c["Tid"]] = v
    return {k: dict(sorted(v.items())) for k, v in out.items()}


def fetch_ssb() -> tuple[dict, dict]:
    sources, data = {}, {}

    q = url("10309", Region=ALL_CODES, NACE2007="*", AntAnsatte="*", ContentsCode="Virksheter", Tid=f"from({FIRST})")
    sources["10309"] = source("10309", q)
    ds = get(q)
    data["industry_labels"] = labels(ds, "NACE2007")
    data["size_labels"] = labels(ds, "AntAnsatte")
    data["units"] = by_region(ds, "Region", ["NACE2007", "AntAnsatte"])

    q = url("08076", Region=ALL_CODES, NACE2007="01-99", OrgFormer="99", ContentsCode="Foretak", Tid=f"from({FIRST}K1)")
    sources["08076"] = source("08076", q)
    data["new"] = quarterly(get(q))

    q = url("07165", Region=ALL_CODES, NACE2007="01-99", OrgFormer="99", ContentsCode="Konkurser", Tid=f"from({FIRST}K1)")
    sources["07165"] = source("07165", q)
    data["bankruptcies"] = quarterly(get(q))

    # 13701 calls the whole country 0N.
    q = url("13701", Region=",".join(c if c != "0" else "0N" for r in REGIONS for c in r["codes"]),
            ForetakVer="akt", Alder="*", Overleving="00,01", ContentsCode="Foretak", Tid=f"from({FIRST})")
    sources["13701"] = source("13701", q)
    survival: dict = {}
    for c, v in cells(get(q)):
        k = region_of("0" if c["Region"] == "0N" else c["Region"])
        if k and v:
            slot = survival.setdefault(k, {}).setdefault(c["Tid"], {})
            slot.setdefault(c["Region"], {})[f'{int(c["Alder"])}|{c["Overleving"]}'] = v
    data["survival"] = {k: {y: max(by.values(), key=len) for y, by in sorted(ys.items())} for k, ys in survival.items()}

    q = url("12894", Region=",".join(r["codes"][0] for r in REGIONS[:4]), InnKvartering1="*", Landkoder2="00000",
            ContentsCode="Overnattinger", Tid="*")
    sources["12894"] = source("12894", q)
    stays: dict = {}
    for c, v in cells(get(q)):
        k = region_of(c["Region"])
        if k and v is not None:
            stays.setdefault(k, {}).setdefault(c["Tid"], {})[c["InnKvartering1"]] = v
    data["stays"] = {k: dict(sorted(v.items())) for k, v in stays.items()}

    q = url("07459", Region=ALL_CODES, Kjonn="1,2", Alder="*", ContentsCode="Personer1", Tid=f"from({FIRST})")
    sources["07459"] = source("07459", q)
    pop: dict = {}
    for c, v in cells(get(q)):
        k = region_of(c["Region"])
        if k and v:
            slot = pop.setdefault(k, {}).setdefault(c["Tid"], {})
            slot[c["Region"]] = slot.get(c["Region"], 0) + v
    data["population"] = {k: {y: max(by.values()) for y, by in sorted(ys.items())} for k, ys in pop.items()}
    return data, sources


def fetch_brreg() -> dict:
    q = f"{BRREG}/underenheter?" + urllib.parse.urlencode(
        {"kommunenummer": REGION, "fraAntallAnsatte": MIN_EMPLOYEES, "size": 200, "sort": "antallAnsatte,desc"})
    print(f"Henter {q}", file=sys.stderr)
    units = fetch(q).get("_embedded", {}).get("underenheter", [])
    parents: dict = {}
    out = []
    for u in units:
        # Sole proprietorships are named after the owner; leave them out.
        if u["organisasjonsform"]["kode"] not in ("BEDR", "AAFY"):
            continue
        p = u.get("overordnetEnhet")
        if p and p not in parents:
            parents[p] = fetch(f"{BRREG}/enheter/{p}")
        e = parents.get(p, {})
        sector = e.get("institusjonellSektorkode", {}).get("kode", "")
        # Parts of a kommune or fylkeskommune can be registered as their own organisation (ORGL) under it.
        top = e
        while top.get("overordnetEnhet"):
            o = top["overordnetEnhet"]
            if o not in parents:
                parents[o] = fetch(f"{BRREG}/enheter/{o}")
            top = parents[o]
        form = top.get("organisasjonsform", {}).get("kode", "")
        if e.get("organisasjonsform", {}).get("kode") == "ENK":
            continue
        name = ("Kommunen" if form == "KOMM" else "Fylkeskommunen" if form == "FYLK" else
                "Interkommunalt selskap" if form == "IKS" else SECTORS.get(sector, "Privat"))
        out.append({
            "orgnr": u["organisasjonsnummer"],
            "navn": u["navn"],
            "ansatte": u.get("antallAnsatte"),
            "naering": u.get("naeringskode1", {}).get("beskrivelse"),
            "naeringskode": u.get("naeringskode1", {}).get("kode"),
            "eier": top.get("navn"),
            "eier_orgnr": top.get("organisasjonsnummer", p),
            "sektor": name,
        })
    return {
        "source": {"name": "Enhetsregisteret", "url": "https://data.brreg.no/enhetsregisteret/oppslag/underenheter", "query": q},
        "min_employees": MIN_EMPLOYEES,
        "units": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    ssb, sources = fetch_ssb()
    try:
        brreg = fetch_brreg()
    except Exception as e:
        if not args.out.exists():
            raise
        print(f"Advarsel: kunne ikke hente fra Enhetsregisteret ({e}). Beholder tallene fra forrige gang.", file=sys.stderr)
        brreg = json.loads(args.out.read_text(encoding="utf-8"))["brreg"]

    data = {
        "generated": dt.date.today().isoformat(),
        "region": REGION,
        "regions": [{k: r[k] for k in ("key", "name", "kind")} for r in REGIONS],
        **ssb,
        "brreg": brreg,
        "sources": sources,
    }
    print(f"Skrev {args.out.relative_to(ROOT)}: bedrifter til {max(ssb['units']['narvik'])}, "
          f"nye foretak til {max(ssb['new']['narvik'])}, {len(brreg['units'])} store arbeidsplasser", file=sys.stderr)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
