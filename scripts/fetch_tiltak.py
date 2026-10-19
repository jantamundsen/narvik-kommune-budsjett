#!/usr/bin/env python3
"""Fetch the measures (tiltak) behind each budget change from Framsikt and write site/data/tiltak.json.

Source: the "Endring driftsbudsjett" page in Narvik's budget documents on Framsikt. It explains how each
tjenesteområde's frame changed from last year's adopted budget, sorted into Framsikt's categories
(Innsparingstiltak, Nye utfordringer, Vedtak forrige periode, Politisk vedtak and so on) and down to each
named measure with its code, its amount for the four plan years and the kommunedirektør's description.
Each publication serves this as JSON under content/data/budgetreductiongraph/0/:

    {revenue|cost}.json                          categories ("revenue" = money freed, "cost" = money used)
    {side}/{category}.json                       areas within a category
    {side}/{category}/{area}.json                the measures, one row each
    {side}/{category}/{area}/{action}.json       one measure's description

The script marks which measures are savings, which savings the kommunestyre took back in the same budget
decision, and joins on what the tertial reports and årsrapporter say happened to them, typed in by hand
in config/tiltak_oppfolging.json with the page. Every line keeps the URL of the JSON it came from.

    python scripts/fetch_tiltak.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

from fetch_budget import ALIASES, AREAS, fetch, number, text

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "tiltak.json"
FOLLOWUP = ROOT / "config" / "tiltak_oppfolging.json"
FAKTA = ROOT / "config" / "fakta.json"

GRAPH = "content/data/budgetreductiongraph/0/"
# Budget year → the Framsikt publication that explains the change into it.
SOURCES = {
    "2025": {
        "name": "Økonomiplan 2025–2028, kommunestyrets vedtak",
        "url": "https://pub.framsikt.net/2025/narvik/bm-2025-budsjettvedtak_2025/",
        "status": "vedtatt",
    },
    "2026": {
        "name": "Budsjett 2026 og økonomiplan 2026–2029, kommunedirektørens forslag",
        "url": "https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/",
        "status": "forslag",
    },
}
SIDES = {"revenue": "frigjort", "cost": "brukt"}

# Framsikt category codes. 70 holds the new savings; a negative line under 60 is a cut the kommunestyre added.
SAVINGS, POLITICAL = "70", "60"
# Earlier savings carried into this year, or new restructuring targets: negative lines in these categories
# whose name says so. Lines that move money between areas or swap one income for another don't match.
CARRIED = {"20", "80"}
SAVING_NAME = re.compile(r"struktur|innsparing|nedtrekk|avvikl|avslutt|reduksjon|redusere|omstilling", re.I)
# A code at the start of a name: "113-25-O: Kjøkkenstruktur", "NK-26-A: …", "23-26 A Fordeling …", "360-23-Strukturtiltak".
CODE = re.compile(r"^((?:NK|\d{2,3})-\d{2}(?:-[A-ZÆØÅ]{1,3}(?:-[A-Z])?(?=[\s:]|$)| [A-Z](?=\s))?)\s*[:\-]?\s*")
STATUSES = {"gjennomfort", "i-arbeid", "forsinket", "ikke-gjennomfort", "ikke-oppgitt"}
DESC_MAX = 1500


def get(url: str):
    """Framsikt answers an empty body for a path it doesn't have."""
    try:
        return fetch(url)
    except json.JSONDecodeError:
        return None


def nodes(data) -> list[dict]:
    """The boxes of a treemap; the 2026 publication uses Highcharts series, the 2025 one an older graphData."""
    if not data:
        return []
    if "series" in data:
        return data["series"][0]["data"]
    if "graphData" in data:
        return data["graphData"][0]["items"]
    sys.exit(f"Unknown Framsikt treemap shape: {list(data)[:5]}")


def area_key(name: str) -> str:
    name = ALIASES.get(name, name)
    if name not in AREAS:
        sys.exit(f"Unknown tjenesteområde {name!r}. Update AREAS in fetch_budget.py if Narvik changed its structure.")
    return AREAS[name]


def split_code(name: str) -> tuple[str | None, str]:
    m = CODE.match(name)
    return (m.group(1), name[m.end():].strip() or name) if m else (None, name)


def description(html_text: str) -> str:
    s = re.sub(r"\s+", " ", text(re.sub(r"<(br|/p|/li)[^>]*>", "\n", html_text or ""))).strip()
    return s if len(s) <= DESC_MAX else s[:DESC_MAX].rsplit(" ", 1)[0] + " …"


def fetch_year(year: str, src: dict) -> tuple[list[dict], dict[str, str]]:
    base = src["url"] + GRAPH
    lines, categories = [], {}
    for side in SIDES:
        for cat in nodes(get(f"{base}{side}.json")):
            code = str(cat["alterCode"])
            categories[code] = text(cat["name"])
            for area in nodes(get(f"{base}{side}/{code}.json")):
                key = area_key(text(area["name"]))
                list_url = f"{base}{side}/{code}/{area['serviceId']}.json"
                rows = (get(list_url) or {}).get("data", [])
                listed = 0
                for r in rows:
                    aid = str(r.get("actionId", "")).strip()
                    if not aid:
                        continue  # the sum row
                    detail = get(f"{base}{side}/{code}/{area['serviceId']}/{aid}.json") or {}
                    full = text(detail.get("ActionDesc") or r["action"])
                    tcode, name = split_code(full)
                    values = [number(r[f"year{i}"]) for i in range(1, 5)]
                    listed += values[0]
                    lines.append({
                        "aar": year, "side": SIDES[side], "kategori": code, "omrade": key,
                        "action_id": int(aid), "kode": tcode, "navn": name,
                        "1000kr": dict(zip([str(int(year) + i) for i in range(4)], values)),
                        "beskrivelse": description(detail.get("FinPlanDesc", "")),
                        "data_url": list_url,
                    })
                # The box says what the area's rows add up to; a gap means a row was missed or misread.
                box = round(float(area["value"]))
                if rows and abs(abs(listed) - box) > 2:
                    sys.exit(f"{year} {side}/{code} {key}: rows sum to {listed}, the box says {area['value']}")
    return lines, categories


def classify(lines: list[dict]) -> None:
    for ln in lines:
        first = ln["1000kr"][ln["aar"]]
        ln["innsparing"] = ln["omrade"] != "felles" and ln["side"] == "frigjort" and first < 0 and (
            ln["kategori"] == SAVINGS
            or ln["kategori"] == POLITICAL
            or (ln["kategori"] in CARRIED and bool(SAVING_NAME.search(ln["navn"])))
        )
    # A saving the kommunestyre took back in the same decision shows up again as money used under Politisk vedtak.
    back = {(ln["aar"], ln["omrade"], ln["action_id"]): ln for ln in lines if ln["kategori"] == POLITICAL and ln["side"] == "brukt"}
    for ln in lines:
        if not ln["innsparing"]:
            continue
        rev = back.get((ln["aar"], ln["omrade"], ln["action_id"]))
        if rev:
            ln["reversert"] = {y: min(-v, rev["1000kr"][y]) for y, v in ln["1000kr"].items()}


def join_followups(lines: list[dict]) -> tuple[list[dict], dict]:
    cfg = json.loads(FOLLOWUP.read_text(encoding="utf-8"))
    kilder = json.loads(FAKTA.read_text(encoding="utf-8"))["kilder"]
    used = {}

    def check_source(where: str, k: dict) -> None:
        if "id" in k:
            if k["id"] not in kilder:
                sys.exit(f"{FOLLOWUP.name} {where}: unknown kilde {k['id']!r}; add it to config/fakta.json")
            used[k["id"]] = kilder[k["id"]]
        elif not (k.get("url") and k.get("navn")):
            sys.exit(f"{FOLLOWUP.name} {where}: kilde needs an id from config/fakta.json, or a url and a navn")

    def find(where: str, e: dict) -> list[dict]:
        hits = [ln for ln in lines if ln["aar"] == e["budsjett"] and ln["action_id"] == e["action_id"]
                and ln["omrade"] == e["omrade"] and ln["side"] == ("brukt" if where == "korreksjoner" else "frigjort")]
        if not hits:
            sys.exit(f"{FOLLOWUP.name} {where}: no measure {e['action_id']} in {e['omrade']} for {e['budsjett']}")
        return hits

    for e in cfg["oppfolging"]:
        where = f"oppfolging {e['budsjett']}/{e['action_id']}/{e['omrade']}"
        if e["status"] not in STATUSES:
            sys.exit(f"{FOLLOWUP.name} {where}: status must be one of {sorted(STATUSES)}")
        for n in e["notater"]:
            check_source(where, n["kilde"])
        for ln in find("oppfolging", e):
            ln["oppfolging"] = {"status": e["status"], "notater": e["notater"]}
    for e in cfg["korreksjoner"]:
        for ln in find("korreksjoner", e):
            ln["korreksjon"] = e["tekst"]
    for e in cfg["omradenotater"]:
        check_source(f"omradenotater {e['budsjett']}/{e['omrade']}", e["kilde"])
    return cfg["omradenotater"], used


def main() -> int:
    lines, categories = [], {}
    for year, src in SOURCES.items():
        ls, cats = fetch_year(year, src)
        lines += ls
        categories.update(cats)
    classify(lines)
    notes, kilder = join_followups(lines)
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "unit": "1000 kr",
        "sources": {y: {**s, "page_url": s["url"] + "#/bmproposals"} for y, s in SOURCES.items()},
        "kilder": kilder,
        "areas": [{"key": key, "name": name} for name, key in AREAS.items()],
        "kategorier": categories,
        "omradenotater": notes,
        "lines": lines,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(ln["innsparing"] for ln in lines)
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(lines)} lines, {n} savings, "
          f"{sum('reversert' in ln for ln in lines)} taken back, {sum('oppfolging' in ln for ln in lines)} with follow-up.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
