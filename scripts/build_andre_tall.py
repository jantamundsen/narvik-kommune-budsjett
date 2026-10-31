#!/usr/bin/env python3
"""Check the hand-typed numbers in config/andre_tall.json and write site/data/andre_tall.json.

«Andre tall» is a timeline of numbers about Narvik kommune that are not shown
anywhere else on the site. Each card says when the source published the number
(or when it was fetched from a database that has no publication date), which
period the number is about, and the source with page or table. This script
refuses a card that breaks that, works out the change in percent from the
previous value, and links an old card to the newest card in the same series.

Only the standard library is used, and nothing is fetched.

    python scripts/build_andre_tall.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "andre_tall.json"
FAKTA = ROOT / "config" / "fakta.json"
OUT = ROOT / "site" / "data" / "andre_tall.json"

REQUIRED = ["id", "gjelder", "tema", "kildetype", "tall", "enhet", "tekst", "kilde"]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def number(s: str) -> float:
    """«1 855» and «19,5» as numbers."""
    return float(s.replace(" ", "").replace(" ", "").replace(",", "."))


def pct_text(p: float, periode: str) -> str:
    arrow = "▲" if p > 0 else "▼" if p < 0 else ""
    return f"{arrow} {abs(p):.1f} % fra {periode}".replace(".", ",").strip()


def series(item: dict) -> str:
    return item.get("serie") or re.sub(r"-\d{4}$", "", item["id"])


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    refs = json.loads(FAKTA.read_text(encoding="utf-8"))["kilder"]
    errors: list[str] = []
    seen: set[str] = set()
    out = []

    for it in cfg["tall"]:
        tid = it.get("id", "?")
        err = lambda msg: errors.append(f"{tid}: {msg}")
        for k in REQUIRED:
            if it.get(k) in (None, "", {}):
                err(f"mangler «{k}»")
        if tid in seen:
            err("id finnes fra før")
        seen.add(tid)

        # Exactly one of publisert/hentet: the date on the timeline.
        dates = [k for k in ("publisert", "hentet") if k in it]
        if len(dates) != 1:
            err("trenger enten «publisert» eller «hentet»")
            continue
        dato = it[dates[0]]
        if not DATE.match(dato):
            err(f"«{dates[0]}» må være en dato som 2026-10-31")

        k = it.get("kilde") or {}
        if "ssb" in k:
            kilde = {"navn": f"SSB tabell {k['ssb']}", "url": f"https://www.ssb.no/statbank/table/{k['ssb']}"}
        elif "ref" in k:
            r = refs.get(k["ref"])
            if not r:
                err(f"ukjent kilde «{k['ref']}» (ikke i config/fakta.json)")
                continue
            kilde = {"navn": r.get("full", r["navn"]), "url": r.get("pdf") or r["url"]}
        elif k.get("navn") and k.get("url"):
            kilde = {"navn": k["navn"], "url": k["url"]}
        else:
            err("kilde må ha ssb, ref eller navn og url")
            continue
        if k.get("side"):
            kilde["side"] = k["side"]
        if "ssb" not in k and "hentet" not in it and not k.get("side"):
            err("et dokument som kilde trenger «side»")

        card = {
            "id": tid,
            "dato": dato,
            "datotype": "Hentet" if dates[0] == "hentet" else "Publisert",
            "gjelder": it["gjelder"],
            "tema": it["tema"],
            "kildetype": it["kildetype"],
            "tall": it["tall"],
            "enhet": it["enhet"],
            "tekst": it["tekst"],
            "kilde": kilde,
            "serie": series(it),
        }
        e = it.get("endring")
        if e:
            if not e.get("periode"):
                err("endring trenger «periode»")
            elif "pst" in e:
                card["endring"] = pct_text(float(e["pst"]), e["periode"])
            elif "forrige" in e:
                try:
                    p = (number(it["tall"]) - number(e["forrige"])) / abs(number(e["forrige"])) * 100
                    card["endring"] = pct_text(p, e["periode"])
                except (ValueError, ZeroDivisionError):
                    err("kan ikke regne endring fra «tall» og «forrige»")
            else:
                err("endring trenger «forrige» eller «pst»")
        out.append(card)

    # An old card in a series points to the newest one.
    newest: dict[str, dict] = {}
    for c in out:
        n = newest.get(c["serie"])
        if not n or c["dato"] > n["dato"]:
            newest[c["serie"]] = c
    for c in out:
        n = newest[c["serie"]]
        if n is not c:
            c["nyere"] = {"id": n["id"], "gjelder": n["gjelder"]}

    if errors:
        print("Feil i config/andre_tall.json:", *errors, sep="\n  ", file=sys.stderr)
        return 1
    out.sort(key=lambda c: c["dato"], reverse=True)
    OUT.write_text(json.dumps({"kontrollert": cfg["kontrollert"], "tall": out}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Skrev {len(out)} tall til {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
