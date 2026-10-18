#!/usr/bin/env python3
"""Fetch what Narvik's money is spent on and where it comes from, per KOSTRA function, and write site/data/detaljer.json.

Source: SSB table 12367 "Detaljerte regnskapstall driftsregnskapet, etter
regnskapsomfang, funksjon og art (K)", via PxWebApi v2. For each function the
table splits net operating expenditure (art AGD2) into the types of cost
(wages, purchases, transfers…) and income (user fees, refunds, grants…) behind it.

Both accounting scopes are kept: kommunekonsern (A, the same scope as
narvik.json) and kommunekasse (B, the municipality without its own companies,
Narvik Havn KF and Narvik Vann KF).

Every value in the output is one cell of the table, addressed by scope,
function, art and year, so the site can link to the query that returns it.
The groups below only say which arts to add up. Where SSB's sub-arts do not
add up to their parent, or the arts do not add up to AGD2, the gap is not
hidden: the site shows it as its own line, marked as computed.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_details.py                 # fetch from SSB
    python scripts/fetch_details.py --from-file x   # use a saved JSON-stat response
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
OUT = ROOT / "site" / "data" / "detaljer.json"
ACCOUNTS = ROOT / "site" / "data" / "narvik.json"

TABLE = "12367"
API = f"https://data.ssb.no/api/pxwebapi/v2/tables/{TABLE}/data"
TABLE_URL = f"https://www.ssb.no/statbank/table/{TABLE}"
REGION = "1806"
AMOUNT = "KOSbelop0000"  # 1000 kr

DIM_REGION = "KOKkommuneregion0000"
DIM_SCOPE = "KOKregnskapsomfa0000"
DIM_FUNCTION = "KOKfunksjon0000"
DIM_ART = "KOKart0000"
DIM_CONTENTS = "ContentsCode"
DIM_YEAR = "Tid"

SCOPES = {
    "konsern": {"code": "A", "name": "Hele kommunen (konsern)",
                "note": "Kommunen med kommunale foretak (Narvik Havn KF og Narvik Vann KF). Samme omfang som tallene ellers på siden."},
    "kasse": {"code": "B", "name": "Kommunekassen",
              "note": "Kommunen uten de kommunale foretakene."},
}

# How the arts make up net operating expenditure (AGD2):
#   AGD2 = sum of the "utgift" groups − sum of the "inntekt" groups.
# A group is the sum of its arts. Its parts are SSB's own sub-arts; whatever they leave of the group is shown
# as "rest" and marked as computed. Names are plain Norwegian, with SSB's art name kept in "ssb_name".
GROUPS = [
    {"key": "lonn", "side": "utgift", "name": "Lønn, pensjon og arbeidsgiveravgift", "arts": ["AG16", "A710"],
     "note": "AG16 er lønn fratrukket sykelønnsrefusjon. Refusjonen (A710) legges til her og vises som inntekt under refusjoner.",
     "parts": ["A090", "A099"], "rest": "Lønn uten pensjon og arbeidsgiveravgift"},
    {"key": "egen", "side": "utgift", "name": "Varer og tjenester til egen drift", "arts": ["AGD50"],
     "parts": ["A260", "A270"], "rest": "Andre varer og tjenester"},
    {"key": "kjop", "side": "utgift", "name": "Tjenester kjøpt i stedet for å lage dem selv", "arts": ["AGD51"],
     "parts": ["AG2", "A370", "AG3"], "rest": "Annet kjøp"},
    {"key": "overforing", "side": "utgift", "name": "Overføringer og tilskudd ut", "arts": ["AG34"],
     "parts": ["AG4", "A470", "AG52"], "rest": "Andre overføringer"},
    {"key": "mva", "side": "utgift", "name": "Merverdiavgift", "arts": ["A429"],
     "note": "Kompenseres av staten, se mva-kompensasjon under inntekter."},
    {"key": "avskrivning", "side": "utgift", "name": "Avskrivninger", "arts": ["A590"]},
    {"key": "fordelt", "side": "utgift", "name": "Fordelte utgifter og internsalg", "arts": ["AGD59"]},
    {"key": "brukerbetaling", "side": "inntekt", "name": "Brukerbetalinger", "arts": ["A600"]},
    {"key": "salg", "side": "inntekt", "name": "Salg og leie", "arts": ["AGD34"]},
    {"key": "refusjon", "side": "inntekt", "name": "Refusjoner", "arts": ["AG48"],
     "parts": ["A710", "AG9", "AD770", "AGD53"], "rest": "Andre refusjoner"},
    {"key": "mvakomp", "side": "inntekt", "name": "Mva-kompensasjon", "arts": ["AD729"]},
    {"key": "tilskudd", "side": "inntekt", "name": "Tilskudd og overføringer inn", "arts": ["AGD49"],
     "parts": ["A890", "AGD54", "AGD56"], "rest": "Andre overføringer inn"},
]
NET = "AGD2"
ARTS = [NET] + list(dict.fromkeys(a for g in GROUPS for a in g["arts"] + g.get("parts", [])))


def build_url(functions: str = "*", scopes: str = "A,B") -> str:
    params = {
        "lang": "no",
        f"valueCodes[{DIM_REGION}]": REGION,
        f"valueCodes[{DIM_SCOPE}]": scopes,
        f"valueCodes[{DIM_FUNCTION}]": functions,
        f"valueCodes[{DIM_ART}]": ",".join(ARTS),
        f"valueCodes[{DIM_CONTENTS}]": AMOUNT,
        f"valueCodes[{DIM_YEAR}]": f"from({FIRST_YEAR})",
    }
    return API + "?" + urllib.parse.urlencode(params, safe="[]*(),")


def transform(ds: dict) -> tuple[dict, list[str]]:
    scope_key = {v["code"]: k for k, v in SCOPES.items()}
    raw: dict = {}  # (scope, function, art, year) -> 1000 kr
    years: set = set()
    for c, v in cells(ds):
        years.add(c[DIM_YEAR])
        if v is not None:
            raw[(scope_key[c[DIM_SCOPE]], c[DIM_FUNCTION], c[DIM_ART], c[DIM_YEAR])] = v
    years = sorted(years)
    # Only numeric KOSTRA functions; SSB's FGK groups overlap and would double count.
    functions = sorted({f for (_s, f, _a, _y) in raw if f.isdigit()})

    values = {}
    for sc in SCOPES:
        values[sc] = {}
        for f in functions:
            arts = {a: [raw.get((sc, f, a, y)) for y in years] for a in ARTS}
            arts = {a: v for a, v in arts.items() if any(x not in (None, 0) for x in v)}
            if arts:
                values[sc][f] = arts

    # Report how far the arts are from AGD2. In the kommunekasse they should match to rounding.
    warnings = []
    for sc, fs in values.items():
        for f, arts in fs.items():
            for i, y in enumerate(years):
                get = lambda a: (arts.get(a) or [None] * len(years))[i] or 0
                net = sum(get(a) for g in GROUPS if g["side"] == "utgift" for a in g["arts"]) \
                    - sum(get(a) for g in GROUPS if g["side"] == "inntekt" for a in g["arts"])
                gap = get(NET) - net
                if abs(gap) > 3:
                    warnings.append(f"{sc} {f} {y}: AGD2 {get(NET)} men artene gir {net} (avvik {gap})")

    art_names = labels(ds, DIM_ART)
    fn_names = labels(ds, DIM_FUNCTION)
    return {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "unit": "1000 kr",
        "source": {
            "table": TABLE, "name": ds.get("label", ""), "url": TABLE_URL, "api": API,
            "query": build_url(), "updated": ds.get("updated"), "region": f"{REGION} Narvik",
            "dims": {"region": DIM_REGION, "scope": DIM_SCOPE, "function": DIM_FUNCTION, "art": DIM_ART,
                     "contents": DIM_CONTENTS, "year": DIM_YEAR},
            "contents": AMOUNT,
        },
        "years": years,
        "scopes": SCOPES,
        "net_art": NET,
        "groups": GROUPS,
        "arts": {a: art_names.get(a, a) for a in ARTS},
        "function_names": {f: fn_names.get(f, f).removeprefix(f + " ") for f in functions},
        "values": values,
    }, warnings


def check_against_accounts(data: dict) -> list[str]:
    """Konsern AGD2 from 12367 should be the same numbers narvik.json has from 12362."""
    if not ACCOUNTS.exists():
        return []
    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))["functions"]
    out = []
    for f, arts in data["values"]["konsern"].items():
        for i, y in enumerate(data["years"]):
            a = (arts.get(NET) or [None] * len(data["years"]))[i]
            b = acc.get(f, {}).get("narvik_1000kr", {}).get(y)
            if (a or 0) != (b or 0):
                out.append(f"{f} {y}: 12367 har {a}, 12362 har {b}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-file", type=Path, help="read a saved JSON-stat2 response instead of calling SSB")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    if args.from_file:
        ds = json.loads(args.from_file.read_text(encoding="utf-8"))
    else:
        url = build_url()
        print(f"Henter {url}", file=sys.stderr)
        ds = fetch(url)

    data, warnings = transform(ds)
    mismatch = check_against_accounts(data)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {args.out.relative_to(ROOT)}: år {data['years'][0]}–{data['years'][-1]}, "
          f"{len(data['values']['konsern'])} funksjoner", file=sys.stderr)
    for w in warnings:
        print(f"Merk: {w}. Vises som egen beregnet linje.", file=sys.stderr)
    for m in mismatch:
        print(f"ADVARSEL: netto avviker fra narvik.json: {m}", file=sys.stderr)
    kasse = [w for w in warnings if w.startswith("kasse")]
    return 1 if kasse or mismatch else 0


if __name__ == "__main__":
    sys.exit(main())
