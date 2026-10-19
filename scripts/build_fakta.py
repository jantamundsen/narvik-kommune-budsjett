#!/usr/bin/env python3
"""Check the hand-typed facts in config/fakta.json and write site/data/fakta.json.

A fact explains a number on the site: sick leave, money spent on agency staff,
an investment project. It is typed in from a document (a tertial report, an
annual report) and must name that document and the page. This script refuses a
fact that does not, or that points at an area, service or cost type the site
does not have, so a typo can't hide a fact or show it in the wrong place.

Only the standard library is used, and nothing is fetched.

    python scripts/build_fakta.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fetch_details import GROUPS

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "fakta.json"
CATEGORIES = ROOT / "config" / "categories.json"
OUT = ROOT / "site" / "data" / "fakta.json"

TYPES = {"tall", "forklaring"}
REQUIRED = ["id", "type", "tema", "aar", "periode", "kommunalomrade", "omrader", "tekst", "kilde"]


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    cats = json.loads(CATEGORIES.read_text(encoding="utf-8"))["categories"]
    areas = {c["key"]: c for c in cats}
    # A service is one named in categories.json, or a single KOSTRA function shown with SSB's name.
    services = {k: {s["key"] for s in c.get("services", [])} | set(c["functions"]) for k, c in areas.items()}
    arts = {g["key"] for g in GROUPS}
    sources = cfg["kilder"]

    errors, seen = [], set()
    for f in cfg["fakta"]:
        fid = f.get("id", "?")
        err = lambda msg: errors.append(f"{fid}: {msg}")
        for k in REQUIRED:
            if f.get(k) in (None, ""):
                err(f"mangler «{k}»")
        if fid in seen:
            err("id finnes fra før")
        seen.add(fid)
        if f.get("type") not in TYPES:
            err(f"type må være en av {sorted(TYPES)}")
        if f.get("type") == "forklaring" and not f.get("sitat"):
            err("en forklaring må ha «sitat», kommunens egne ord")
        if not str(f.get("aar", "")).isdigit():
            err("aar må være et årstall")
        for a in f.get("omrader", []):
            if a not in areas:
                err(f"ukjent område «{a}»")
        t = f.get("tjeneste")
        if t is not None and not any(t in services[a] for a in f.get("omrader", []) if a in areas):
            err(f"tjenesten «{t}» finnes ikke i områdene {f.get('omrader')}")
        if f.get("art") is not None and f["art"] not in arts:
            err(f"ukjent art «{f['art']}», bruk en av {sorted(arts)}")
        k = f.get("kilde") or {}
        if k.get("id") not in sources:
            err(f"ukjent kilde «{k.get('id')}»")
        if not isinstance(k.get("side"), int) or k["side"] < 1:
            err("kilde.side må være et sidetall")

    for sid, s in sources.items():
        for key in ("navn", "full", "url", "pdf"):
            if not s.get(key):
                errors.append(f"kilde {sid}: mangler «{key}»")

    if errors:
        print("config/fakta.json har feil:", *errors, sep="\n  ", file=sys.stderr)
        return 1

    out = {"kilder": sources, "fakta": cfg["fakta"]}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(cfg['fakta'])} facts from {len(sources)} source(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
