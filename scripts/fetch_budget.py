#!/usr/bin/env python3
"""Fetch Narvik's budgets and accounts per tjenesteområde and write site/data/budsjett.json.

Source: the "Bevilgningsoversikt drift etter § 5-4 andre ledd" table (1B) in
Narvik's budget documents on Framsikt (pub.framsikt.net). Each publication
serves that table as JSON, and the table carries the accounts for two years
back, the original budget for last year and the four plan years.

Budgets that are only published as PDF (for now the adopted 2026 budget, from
the second tertial report) are typed into config/budsjett_manuelt.json with
their page, and merged in after the same sum check. So are the accounts and
original budget for finished years, taken from the same 1B table in that
year's årsrapport. Later documents can restate a finished year's accounts
after reorganisations (2024 differs by a few mill. kr per area between
Årsrapport 2024 and Årsrapport 2025), so budget and accounts for a year are
always taken from the same årsrapport, which is also what the fact sheets use.

Every series in the output names its publication, data URL and column, and the
PDF page where the same table is printed when a PDF exists, so a number on the
site can be traced to the table it came from.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_budget.py
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "budsjett.json"
MANUAL = ROOT / "config" / "budsjett_manuelt.json"

TABLE = "Bevilgningsoversikt drift etter § 5-4 andre ledd (1B)"
TABLE_PATH = "content/data/summary/appdx/budgetforms1b2020.json"
TOTAL_ROW = "Sum bevilgninger drift, netto"

SOURCES = {
    "vedtak-2025": {
        "name": "Økonomiplan 2025–2028, kommunestyrets vedtak",
        "url": "https://pub.framsikt.net/2025/narvik/bm-2025-budsjettvedtak_2025/",
        "status": "vedtatt",
    },
    "forslag-2026": {
        "name": "Budsjett 2026 og økonomiplan 2026–2029, kommunedirektørens forslag",
        "url": "https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/",
        "status": "forslag",
        # The same document as a PDF on narvik.kommune.no; the 1B table is on page 93.
        "pdf": "https://www.narvik.kommune.no/_f/p1/i3c0f427e-5acf-4d5c-836a-5db986e5cdcb/narvik-kommunes-okonomiplan-2026-2029-1.pdf",
        "pdf_page": 93,
    },
}

# (series id, kind, year, source, column title as Framsikt writes it). Kinds: regnskap (accounts),
# budsjett (original budget as adopted), forslag (the kommunedirektør's proposal for its budget year)
# and okonomiplan (the later plan years in a proposal).
SERIES = [
    ("regnskap-2023", "regnskap", "2023", "vedtak-2025", "Regnskap  2023"),
    ("forslag-2026", "forslag", "2026", "forslag-2026", "Øk.plan 2026"),
    ("okonomiplan-2027", "okonomiplan", "2027", "forslag-2026", "Øk.plan 2027"),
    ("okonomiplan-2028", "okonomiplan", "2028", "forslag-2026", "Øk.plan 2028"),
    ("okonomiplan-2029", "okonomiplan", "2029", "forslag-2026", "Øk.plan 2029"),
]

# Narvik's tjenesteområder in the order the documents list them, keyed by display name.
AREAS = {
    "Politisk ledelse": "politisk",
    "Kommunedirektør og stab": "radmannen",
    "Virksomhetsstyring": "virksomhet",
    "Oppvekst": "oppvekst",
    "Helse og omsorg": "helse",
    "Plan, næring og teknisk": "plan",
    "Fellesinntekter og kostnader": "felles",
}
# Names the documents use for the same area. "Rådmannen" (until 2026) and "Kommunedirektøren" (Tertialrapport
# 2/2026) read like one person's pay, but the area is the whole office, so the site uses a clearer name.
ALIASES = {"Rådmannen": "Kommunedirektør og stab", "Kommunedirektøren": "Kommunedirektør og stab"}
# Short explanations shown under an area's name, each taken from the page named.
DESCRIPTIONS = {
    "radmannen": "Kommunedirektøren og kommunedirektørens stab (ansvar 100 og 102). Heter «Rådmannen» eller «Kommunedirektøren» i dokumentene. Kilde: Tertialrapport 2/2026, s. 17.",
}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "narvik-kommune-budsjett"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def text(cell: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", str(cell))).replace("\xa0", " ").strip()


def number(cell: str) -> int:
    s = text(cell).replace(" ", "").replace("−", "-")
    if not re.fullmatch(r"-?\d+", s):
        raise ValueError(f"not a number: {cell!r}")
    return int(s)


def leaf_columns(columns: list[dict]) -> dict[str, str]:
    """Map each leaf column's title to its field name."""
    out = {}
    for c in columns:
        if c.get("columns"):
            out.update(leaf_columns(c["columns"]))
        elif c.get("field"):
            out[c["title"].strip()] = c["field"]
    return out


def read_table(source: dict) -> tuple[dict[str, str], dict[str, dict]]:
    data = fetch(source["url"] + TABLE_PATH)
    cols = leaf_columns(data["column"])
    first = min(cols.values(), key=lambda f: int(f.removeprefix("column")))
    rows = {}
    for r in data["data"]:
        name = text(r[first])
        rows[ALIASES.get(name, name)] = r
    return cols, rows


def check_total(label: str, values: dict[str, int], total: int) -> None:
    # The published total is rounded on its own, so it can differ from the sum of the rows by a few thousand kroner.
    if abs(sum(values.values()) - total) > len(values):
        sys.exit(f"{label}: areas sum to {sum(values.values())}, table says {total}")


def manual_series() -> tuple[dict, list[dict]]:
    """Series typed in from PDFs, with the page they came from."""
    data = json.loads(MANUAL.read_text(encoding="utf-8"))
    series = []
    for s in data["series"]:
        named = {ALIASES.get(k, k): v for k, v in s["1000kr"].items()}
        missing = [a for a in AREAS if a not in named]
        if missing:
            sys.exit(f"{MANUAL.name} {s['id']}: missing tjenesteområder {missing}")
        values = {key: named[name] for name, key in AREAS.items()}
        check_total(f"{MANUAL.name} {s['id']}", values, s["total_1000kr"])
        src = data["sources"][s["source"]]
        series.append({**s, "data_url": src["pdf"], "1000kr": values})
    return data["sources"], series


def main() -> int:
    tables = {sid: read_table(src) for sid, src in SOURCES.items()}
    series = []
    for sid, kind, year, src, column in SERIES:
        cols, rows = tables[src]
        if column not in cols:
            sys.exit(f"{src}: column {column!r} not found, got {list(cols)}")
        field = cols[column]
        missing = [a for a in AREAS if a not in rows]
        if missing:
            sys.exit(f"{src}: missing tjenesteområder {missing}. Update AREAS if Narvik changed its structure.")
        values = {key: number(rows[name][field]) for name, key in AREAS.items()}
        total = number(rows[TOTAL_ROW][field])
        check_total(f"{src} {column}", values, total)
        series.append({
            "id": sid, "kind": kind, "year": year, "source": src,
            "data_url": SOURCES[src]["url"] + TABLE_PATH, "column": column.replace("  ", " "),
            "total_1000kr": total, "1000kr": values,
        })

    manual_sources, manual = manual_series()
    taken = {(s["kind"], s["year"]) for s in series}
    clash = [s["id"] for s in manual if (s["kind"], s["year"]) in taken]
    if clash:
        sys.exit(f"{MANUAL.name}: {clash} duplicate a series fetched from Framsikt")
    series = sorted(series + manual, key=lambda s: (s["year"], ["regnskap", "budsjett", "forslag", "okonomiplan"].index(s["kind"])))

    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "unit": "1000 kr",
        "table": TABLE,
        "sources": {**SOURCES, **manual_sources},
        "areas": [{"key": key, "name": name, **({"description": DESCRIPTIONS[key]} if key in DESCRIPTIONS else {})} for name, key in AREAS.items()],
        "series": series,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} with {len(series)} series.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
