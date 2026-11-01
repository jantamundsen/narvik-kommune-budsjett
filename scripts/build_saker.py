#!/usr/bin/env python3
"""Check the hand-typed cases in config/saker.json and write site/data/saker.json.

A case («sak») is a fact sheet about something people in Narvik talk about: an
overspend, a large event, a new industry. Each key number, each line about the
kommune's role and each date in the timeline must name a source and, where the
source has pages, the page. Sources are listed in config/saker.json or reused
from config/fakta.json. This script refuses a case that breaks that, and adds
the «Bak tallene» points from config/fakta.json that the case asks for, so the
page needs only one file.

A source with "type": "media" is a newspaper or NRK article. It may back what
someone in a public role said («sitat» + «hvem») or what the paper reports. The
page marks every line that rests on such a source as an utsagn or a
medieoppslag, so readers can tell it from what the documents say. A media
source needs a link and a date (dd.mm.åååå) at the end of its «navn».

Only the standard library is used, and nothing is fetched.

    python scripts/build_saker.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "saker.json"
FAKTA = ROOT / "config" / "fakta.json"
OUT = ROOT / "site" / "data" / "saker.json"

REQUIRED = ["id", "tittel", "ingress", "kontrollert", "nokkeltall", "rolle", "tidslinje"]
# A timeline date is a day (29.04.2021), a month (04.2021) or a year (2021).
DATE = re.compile(r"^(\d{2}\.)?(\d{2}\.)?\d{4}$")
MEDIA_NAME = re.compile(r"\d{2}\.\d{2}\.\d{4}$")


def sort_key(d: str) -> tuple:
    parts = d.split(".")[::-1]
    return tuple(int(p) for p in parts) + (0,) * (3 - len(parts))


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    fakta = json.loads(FAKTA.read_text(encoding="utf-8"))
    sources = {**fakta["kilder"], **cfg["kilder"]}
    clash = set(fakta["kilder"]) & set(cfg["kilder"])

    errors, seen, used = [f"kilde «{k}» finnes både i saker.json og fakta.json" for k in sorted(clash)], set(), set()
    for kid, k in cfg["kilder"].items():
        if k.get("type") == "media" and (not k.get("url") or not MEDIA_NAME.search(k.get("navn", ""))):
            errors.append(f"kilde «{kid}»: en mediekilde trenger url og dato (dd.mm.åååå) sist i navnet")
    out = []
    for s in cfg["saker"]:
        sid = s.get("id", "?")
        err = lambda msg: errors.append(f"{sid}: {msg}")
        for k in REQUIRED:
            if s.get(k) in (None, "", []):
                err(f"mangler «{k}»")
        if sid in seen:
            err("id finnes fra før")
        seen.add(sid)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s.get("kontrollert", "")):
            err("kontrollert må være en dato som 2026-10-20")

        def check_src(where: str, k: dict | list | None) -> None:
            # A line can rest on more than one page, so «kilde» may be a list.
            if isinstance(k, list) and k:
                for one in k:
                    check_src(where, one)
                return
            if not k or k.get("id") not in sources:
                err(f"{where}: ukjent eller manglende kilde")
                return
            used.add(k["id"])
            if "side" in k and not isinstance(k["side"], int):
                err(f"{where}: side må være et tall")
            if "side" not in k and sources[k["id"]].get("pdf") and not sources[k["id"]].get("url"):
                err(f"{where}: kilden er en PDF, så siden må med")

        for i, n in enumerate(s.get("nokkeltall", [])):
            for k in ("navn", "verdi", "tekst"):
                if not n.get(k):
                    err(f"nøkkeltall {i + 1}: mangler «{k}»")
            check_src(f"nøkkeltall {i + 1}", n.get("kilde"))
            ks = n.get("kilde") or []
            if any(sources.get(k.get("id"), {}).get("type") == "media" for k in (ks if isinstance(ks, list) else [ks])):
                err(f"nøkkeltall {i + 1}: et nøkkeltall må ha et dokument som kilde, ikke en avis")
        for i, a in enumerate(s.get("aktorer", [])):
            if not a.get("navn") or not a.get("rolle"):
                err(f"aktør {i + 1}: mangler navn eller rolle")
            check_src(f"aktør {i + 1}", a.get("kilde"))
        for t in s.get("temaer", []):
            if not t.get("tittel") or not t.get("punkter"):
                err("et tema mangler tittel eller punkter")
            for i, pt in enumerate(t.get("punkter", [])):
                where = f"{t.get('tittel')} {i + 1}"
                check_src(where, pt.get("kilde"))
                if not pt.get("tekst") and not pt.get("sitat"):
                    err(f"{where}: mangler «tekst» eller «sitat»")
                if pt.get("sitat") and not pt.get("hvem"):
                    err(f"{where}: et sitat må si hvem som sa det («hvem»)")
        for i, r in enumerate(s.get("rolle", [])):
            check_src(f"rolle {i + 1}", r.get("kilde"))
        for i, t in enumerate(s.get("tidslinje", [])):
            if not DATE.match(t.get("dato", "")):
                err(f"tidslinje {i + 1}: dato «{t.get('dato')}» må være dd.mm.åååå, mm.åååå eller åååå")
            check_src(f"tidslinje {i + 1}", t.get("kilde"))
            if t.get("sitat") and not t.get("hvem"):
                err(f"tidslinje {i + 1}: et sitat må si hvem som sa det («hvem»)")
        dates = [t["dato"] for t in s.get("tidslinje", []) if DATE.match(t.get("dato", ""))]
        if dates != sorted(dates, key=sort_key):
            err("tidslinjen må stå i datorekkefølge")
        tab = s.get("tabell")
        if tab:
            width = len(tab["kolonner"]) - 1  # the last column is the source
            for i, r in enumerate(tab["rader"]):
                if len(r["celler"]) != width:
                    err(f"tabellrad {i + 1}: {len(r['celler'])} celler, ventet {width}")
                check_src(f"tabellrad {i + 1}", r.get("kilde"))

        case = {k: v for k, v in s.items() if k != "fakta"}
        f = s.get("fakta")
        if f:
            picked = [x for x in fakta["fakta"]
                      if x["kommunalomrade"] == f["kommunalomrade"] and int(x["aar"]) >= f.get("fra_aar", 0)]
            if not picked:
                err(f"fant ingen punkter i fakta.json for «{f['kommunalomrade']}»")
            picked.sort(key=lambda x: (-int(x["aar"]), x["tema"]))
            case["fakta"] = picked
            used.update(x["kilde"]["id"] for x in picked)
        out.append(case)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    OUT.write_text(json.dumps({"kilder": {k: sources[k] for k in sorted(used)}, "saker": out},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(out)} saker skrevet til {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
