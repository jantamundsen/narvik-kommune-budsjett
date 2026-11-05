#!/usr/bin/env python3
"""Check the lines in config/nytt.json and write site/data/nytt.json.

«Nytt på siden» on the front page lists new pages, maps, graphs and hand-typed
numbers, newest first. Each line has a date, a type, a short text and a link to
the place on the site. This script refuses a line with a wrong date or type, or
a link to a page that does not exist, and sorts the lines newest first.

Only the standard library is used, and nothing is fetched.

    python scripts/build_nytt.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "nytt.json"
SITE = ROOT / "site"
OUT = SITE / "data" / "nytt.json"

TYPES = {"Ny side", "Nytt kart", "Ny graf", "Nye tall", "Ny sak"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def page_exists(link: str) -> bool:
    """«befolkning#areas», «selskaper/» and «sak/budsjett-2027» as files under site/."""
    path = link.split("#")[0].split("?")[0]
    if path in ("", "./"):
        return (SITE / "index.html").exists()
    if path.endswith("/"):
        return (SITE / path / "index.html").exists()
    return (SITE / f"{path}.html").exists() or (SITE / path / "index.html").exists()


def main() -> None:
    lines = json.loads(CONFIG.read_text(encoding="utf-8"))["nytt"]
    errors = []
    for i, n in enumerate(lines, 1):
        where = f"linje {i} ({n.get('tekst', '?')})"
        for key in ("dato", "type", "tekst", "lenke"):
            if not str(n.get(key, "")).strip():
                errors.append(f"{where}: mangler {key}")
        if n.get("dato") and not DATE.match(n["dato"]):
            errors.append(f"{where}: dato må være ÅÅÅÅ-MM-DD")
        if n.get("type") and n["type"] not in TYPES:
            errors.append(f"{where}: type må være en av {', '.join(sorted(TYPES))}")
        if n.get("lenke") and not page_exists(n["lenke"]):
            errors.append(f"{where}: siden {n['lenke']} finnes ikke")
    if errors:
        sys.exit("config/nytt.json:\n  " + "\n  ".join(errors))
    # Newest first; lines from the same day keep the order they have in the file.
    out = sorted(lines, key=lambda n: n["dato"], reverse=True)
    OUT.write_text(json.dumps({"nytt": [{k: n[k] for k in ("dato", "type", "tekst", "lenke")} for n in out]},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out)} linjer")


if __name__ == "__main__":
    main()
