#!/usr/bin/env python3
"""Write site/data/selskaper.json for the pages on the companies Narvik kommune owns (selskaper/).

The list of companies, the kommune's share and the book value come from config/selskaper.json, typed in from
note 5 of the kommune's årsregnskap. For each organisation number this script fetches from Brønnøysundregistrene
(open APIs, data.brreg.no, NLOD):

    Enhetsregisteret      name, form, purpose, employees, founded, industry, address, web page
    Regnskapsregisteret   the accounts for the last three years, for the company alone (SELSKAP) and, where the
                          company is the parent of a group, for the group (KONSERN)

Regnskapsregisteret only gives the last three years. Years already in the data file are kept when they drop out
of the API, so the series grows each year. Kommunale foretak (KF) and some IKS do not report to the register; for
those, the accounts can be typed in from their own årsregnskap under «regnskap_pdf» in the config, with the
document and pages for each year.

If Brønnøysund cannot be reached, the numbers from the last run are kept. Only the standard library is used.

    python scripts/fetch_selskaper.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "selskaper.json"
OUT = ROOT / "site" / "data" / "selskaper.json"
ENHET = "https://data.brreg.no/enhetsregisteret/api/enheter/"
REGNSKAP = "https://data.brreg.no/regnskapsregisteret/regnskap/"


def get(url: str):
    """JSON from url, or None when the register has nothing on this number (404)."""
    print(f"Henter {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "narvik-kommune-budsjett", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return None
        raise


def dig(d: dict, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def enhet(orgnr: str) -> dict | None:
    e = get(ENHET + orgnr)
    if not e:
        return None
    lines = lambda v: " ".join(v) if isinstance(v, list) else v
    adr = e.get("forretningsadresse") or {}
    return {
        "navn": e.get("navn"),
        "form": dig(e, "organisasjonsform", "beskrivelse"),
        "formaal": lines(e.get("vedtektsfestetFormaal")) or lines(e.get("aktivitet")),
        "ansatte": e.get("antallAnsatte") if e.get("harRegistrertAntallAnsatte") else None,
        "stiftet": e.get("stiftelsesdato"),
        "naering": dig(e, "naeringskode1", "beskrivelse"),
        "kommune": (adr.get("kommune") or "").title() or None,
        "hjemmeside": e.get("hjemmeside"),
        "sektor": dig(e, "institusjonellSektorkode", "beskrivelse"),
        "under_avvikling": bool(e.get("underAvvikling") or e.get("underTvangsavviklingEllerTvangsopplosning")),
        "konkurs": bool(e.get("konkurs")),
        "slettet": e.get("slettedato"),
    }


def regnskap(orgnr: str) -> dict:
    """{"selskap": {year: {...}}, "konsern": {year: {...}}} from Regnskapsregisteret."""
    out: dict = {}
    for r in get(REGNSKAP + orgnr) or []:
        typ = "konsern" if r.get("regnskapstype") == "KONSERN" else "selskap"
        til = dig(r, "regnskapsperiode", "tilDato") or ""
        res, eg, ei = r.get("resultatregnskapResultat") or {}, r.get("egenkapitalGjeld") or {}, r.get("eiendeler") or {}
        out.setdefault(typ, {})[til[:4]] = {
            "periode": [dig(r, "regnskapsperiode", "fraDato"), til],
            "driftsinntekter": dig(res, "driftsresultat", "driftsinntekter", "sumDriftsinntekter"),
            "driftskostnader": dig(res, "driftsresultat", "driftskostnad", "sumDriftskostnad"),
            "lonn": dig(res, "driftsresultat", "driftskostnad", "loennskostnad"),
            "driftsresultat": dig(res, "driftsresultat", "driftsresultat"),
            "finans": dig(res, "finansresultat", "nettoFinans"),
            "aarsresultat": res.get("aarsresultat"),
            "eiendeler": ei.get("sumEiendeler"),
            "anleggsmidler": dig(ei, "anleggsmidler", "sumAnleggsmidler"),
            "egenkapital": dig(eg, "egenkapital", "sumEgenkapital"),
            "gjeld": dig(eg, "gjeldOversikt", "sumGjeld"),
            "langsiktig_gjeld": dig(eg, "gjeldOversikt", "langsiktigGjeld", "sumLangsiktigGjeld"),
            "revidert": not dig(r, "revisjon", "ikkeRevidertAarsregnskap"),
            "journalnr": r.get("journalnr"),
        }
    return out


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    old_by_id = {s["id"]: s for s in old.get("selskaper", [])}
    out = []
    for s in cfg["selskaper"]:
        s = dict(s)
        prev = old_by_id.get(s["id"], {})
        if s.get("orgnr"):
            try:
                s["brreg"] = enhet(s["orgnr"])
                r = {} if s.get("ingen_regnskap") else regnskap(s["orgnr"])
                # Keep the years that have dropped out of the API (it only gives the last three). Years typed in from
                # a PDF come from the config each time, so a correction there is not hidden by the old data file.
                for typ, years in (prev.get("regnskap") or {}).items():
                    for y, v in years.items():
                        if not v.get("fra_pdf"):
                            r.setdefault(typ, {}).setdefault(y, v)
                # Companies that do not report to the register: the accounts typed in from their own årsregnskap
                # (config «regnskap_pdf»), each year with document and pages. The register wins where both exist.
                pdf = s.pop("regnskap_pdf", None)
                if pdf:
                    for typ in ("selskap", "konsern"):
                        for y, v in (pdf.get(typ) or {}).items():
                            r.setdefault(typ, {}).setdefault(y, {**v, "fra_pdf": True})
                    s["regnskap_merknad"] = " ".join(x for x in (pdf.get("enhet"), pdf.get("merknad")) if x) or None
                s["regnskap"] = {t: dict(sorted(ys.items())) for t, ys in sorted(r.items())}
            except Exception as e:
                if not prev:
                    raise
                print(f"Advarsel: kunne ikke hente {s['orgnr']} ({e}). Beholder tallene fra forrige gang.", file=sys.stderr)
                s["brreg"], s["regnskap"] = prev.get("brreg"), prev.get("regnskap", {})
        out.append(s)

    data = {
        "generated": dt.date.today().isoformat(),
        **{k: v for k, v in cfg.items() if k not in ("_comment", "selskaper")},
        "kilder_brreg": {
            "enhet": "https://data.brreg.no/enhetsregisteret/oppslag/enheter/",
            "regnskap": REGNSKAP,
        },
        "selskaper": out,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    with_acc = sum(1 for s in out if s.get("regnskap"))
    print(f"Skrev {OUT.relative_to(ROOT)}: {len(out)} selskaper, {with_acc} med regnskap", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
