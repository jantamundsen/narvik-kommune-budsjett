#!/usr/bin/env python3
"""Fetch Narvik's budgets and accounts per tjenesteområde and write site/data/budsjett.json.

Source: the "Bevilgningsoversikt drift etter § 5-4 andre ledd" table (1B) in
Narvik's budget documents on Framsikt (pub.framsikt.net). Each publication
serves that table as JSON, and the table carries the accounts for two years
back, the original budget for last year and the four plan years.

Every series in the output names its publication, data URL and column, so a
number on the site can be traced to the table it came from.

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
    },
}

# (series id, kind, year, source, column title as Framsikt writes it)
SERIES = [
    ("regnskap-2023", "regnskap", "2023", "vedtak-2025", "Regnskap  2023"),
    ("budsjett-2024", "budsjett", "2024", "vedtak-2025", "Oppr. budsjett 2024"),
    ("regnskap-2024", "regnskap", "2024", "forslag-2026", "Regnskap  2024"),
    ("budsjett-2025", "budsjett", "2025", "vedtak-2025", "Øk.plan 2025"),
    ("forslag-2026", "forslag", "2026", "forslag-2026", "Øk.plan 2026"),
    ("forslag-2027", "forslag", "2027", "forslag-2026", "Øk.plan 2027"),
    ("forslag-2028", "forslag", "2028", "forslag-2026", "Øk.plan 2028"),
    ("forslag-2029", "forslag", "2029", "forslag-2026", "Øk.plan 2029"),
]

# Narvik's tjenesteområder in the order the documents list them.
AREAS = {
    "Politisk ledelse": "politisk",
    "Rådmannen": "radmannen",
    "Virksomhetsstyring": "virksomhet",
    "Oppvekst": "oppvekst",
    "Helse og omsorg": "helse",
    "Plan, næring og teknisk": "plan",
    "Fellesinntekter og kostnader": "felles",
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
    rows = {text(r[first]): r for r in data["data"]}
    return cols, rows


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
        # The published total is rounded on its own, so it can differ from the sum of the rows by a few thousand kroner.
        if abs(sum(values.values()) - total) > len(values):
            sys.exit(f"{src} {column}: areas sum to {sum(values.values())}, table says {total}")
        series.append({
            "id": sid, "kind": kind, "year": year, "source": src,
            "data_url": SOURCES[src]["url"] + TABLE_PATH, "column": column.replace("  ", " "),
            "total_1000kr": total, "1000kr": values,
        })

    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "unit": "1000 kr",
        "table": TABLE,
        "sources": SOURCES,
        "areas": [{"key": key, "name": name} for name, key in AREAS.items()],
        "series": series,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} with {len(series)} series.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
