#!/usr/bin/env python3
"""Build the running overview for the current budget year and write site/data/lopende.json.

Two sources:
- Narvik's tertial reports, which are only published as PDF. Their tables are
  typed into config/lopende_2026.json with the page they came from, and checked
  here: every row's avvik must be budget minus accounts, and the rows must add
  up to the printed total.
- Paid-in tax to the kommune per month, from SSB table 07022 (Skatterekneskaps-
  statistikk, accumulated), for this year and the year before. SSB updates it
  every month, so this part is fresh between the tertial reports.

Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_lopende.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "lopende_2026.json"
OUT = ROOT / "site" / "data" / "lopende.json"

TAX_API = "https://data.ssb.no/api/pxwebapi/v2/tables/07022/data"
TAX_TABLE_URL = "https://www.ssb.no/statbank/table/07022"
TAX_REGION = "1806"  # Narvik
TAX_KIND = "06"  # Ordinær skatt til primærkommunen

# The same keys as scripts/fetch_budget.py, so the two pages name the areas alike.
AREAS = {
    "Politisk ledelse": "politisk",
    "Kommunedirektør og stab": "radmannen",
    "Virksomhetsstyring": "virksomhet",
    "Oppvekst": "oppvekst",
    "Helse og omsorg": "helse",
    "Plan, næring og teknisk": "plan",
    "Fellesinntekter og kostnader": "felles",
}
ALIASES = {"Rådmannen": "Kommunedirektør og stab", "Kommunedirektøren": "Kommunedirektør og stab"}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "narvik-kommune-budsjett"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def check_table(label: str, table: dict) -> dict[str, dict[str, int]]:
    """Return {row name: {column: value}} after checking avvik and sums."""
    cols = table["columns"]
    rows = {name: dict(zip(cols, vals)) for name, vals in table["rows"].items()}
    total = dict(zip(cols, table["total"]))
    for name, r in [*rows.items(), ("Sum", total)]:
        if len(r) != len(cols):
            sys.exit(f"{label} {name}: expected {len(cols)} values")
        if r["budsjett_hia"] - r["regnskap_hia"] != r["avvik_hia"]:
            # The report rounds each cell on its own, so allow one thousand kroner.
            if abs(r["budsjett_hia"] - r["regnskap_hia"] - r["avvik_hia"]) > 1:
                sys.exit(f"{label} {name}: avvik {r['avvik_hia']} is not budsjett minus regnskap")
    for c in cols:
        s = sum(r[c] for r in rows.values())
        if abs(s - total[c]) > len(rows):
            sys.exit(f"{label} {c}: rows sum to {s}, table says {total[c]}")
    return {**rows, "Sum": total}


def tax(year: int) -> dict:
    params = {
        "lang": "no",
        "valueCodes[Region]": TAX_REGION,
        "valueCodes[Skatteart]": TAX_KIND,
        "valueCodes[ContentsCode]": "Skatt",
        "valueCodes[Tid]": f"{year - 1}M*,{year}M*",
    }
    url = TAX_API + "?" + urllib.parse.urlencode(params, safe="[]*,")
    data = fetch(url)
    periods = data["dimension"]["Tid"]["category"]["index"]
    values = data["value"]
    by_year: dict[str, list] = {str(year - 1): [None] * 12, str(year): [None] * 12}
    for code, i in periods.items():
        y, m = code.split("M")
        if y in by_year and values[i] is not None:
            by_year[y][int(m) - 1] = values[i]
    if not any(v is not None for v in by_year[str(year)]):
        sys.exit(f"SSB 07022 has no months for {year} yet")
    return {
        "name": "SSB tabell 07022, Skatterekneskapsstatistikk",
        "label": data["dimension"]["Skatteart"]["category"]["label"][TAX_KIND],
        "unit": "mill. kr, akkumulert",
        "updated": data.get("updated"),
        "url": TAX_TABLE_URL,
        "data_url": url,
        "months": by_year,
    }


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    reports = []
    for r in cfg["reports"]:
        areas = check_table(f"{r['id']} areas", r["areas"])
        named = {ALIASES.get(k, k): v for k, v in areas.items()}
        missing = [a for a in AREAS if a not in named]
        if missing:
            sys.exit(f"{r['id']}: missing tjenesteområder {missing}")
        income = check_table(f"{r['id']} income", r["income"])
        reports.append({
            "id": r["id"], "name": r["name"], "period": r["period"], "months": r["months"],
            "url": r["url"], "pdf": r["pdf"],
            "areas": {"table": r["areas"]["_table"], "pdf_page": r["areas"]["pdf_page"],
                      "rows": {key: named[name] for name, key in AREAS.items()}, "total": named["Sum"]},
            "income": {"table": r["income"]["_table"], "pdf_page": r["income"]["pdf_page"],
                       "rows": {k: v for k, v in income.items() if k != "Sum"}, "total": income["Sum"]},
            "fund": {k: v for k, v in r["fund"].items() if not k.startswith("_")},
            "regulations": {"pdf_page": r["regulations"]["pdf_page"], "items": r["regulations"]["items"]},
        })

    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "year": cfg["year"],
        "unit": "1000 kr",
        "areas": [{"key": key, "name": name} for name, key in AREAS.items()],
        "reports": reports,
        "missing": cfg.get("missing"),
        "tax": tax(int(cfg["year"])),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    t = out["tax"]["months"][cfg["year"]]
    last = max(i for i, v in enumerate(t) if v is not None) + 1
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(reports)} tertial report(s), tax through month {last}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
