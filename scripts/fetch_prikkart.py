#!/usr/bin/env python3
"""Fetch SSB's population on a 250 m grid for Narvik and write site/data/prikkart.json for the dot map on befolkning.html.

SSB publishes the number of residents per 250 × 250 m cell on 1 January each year (Befolkning på rutenett), through
the OGC API at kart.ssb.no. Cells where nobody lives are left out, and SSB has already protected small cells.
We fetch the first year of today's Narvik (2020) and the newest year SSB has, keep the cells whose centre is
inside the kommune, and give each the delområde it lies in. The delområde polygons come from
config/prikkart_delomrader.json, which scripts/build_prikkart_kart.py makes from Kartverket's grunnkretser
(together with the base map in site/data/prikkart-kart.json, whose origin the cell coordinates here use).

The cells add up to a little less than SSB's folketall, because some people have no address that can be placed
on the map. The page says so.

Each cell is [x, y, residents first year, residents newest year, delområde], where x and y count cells from the
base map's origin (the south-west corner). Only the standard library is used.

    python scripts/fetch_prikkart.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "prikkart.json"
BASE = ROOT / "site" / "data" / "prikkart-kart.json"
LOOKUP = ROOT / "config" / "prikkart_delomrader.json"
API = "https://kart.ssb.no/api/ogc/v1/befolkning_paa_rutenett_ogc_api"
META = "https://kartkatalog.geonorge.no/metadata/uuid/20d06bca-484c-4353-a24b-61046296f5da"
FIRST = 2020
# Narvik with a margin, as longitude/latitude (the kommune spans about 15.90–18.15 E, 67.97–68.61 N).
BBOX = "15.85,67.95,18.2,68.65"


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "narviktall.no"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def years() -> list[int]:
    ids = [c["id"] for c in get(f"{API}/collections")["collections"]]
    return sorted(int(m.group(1)) for i in ids if (m := re.fullmatch(r"befolkning_250m_(\d{4})", i)))


def grid(year: int) -> dict[tuple[int, int], int]:
    """Residents per cell, keyed by the cell's south-west corner in UTM metres."""
    url = f"{API}/collections/befolkning_250m_{year}/items?bbox={BBOX}&limit=1000"
    out: dict[tuple[int, int], int] = {}
    while url:
        d = get(url)
        for f in d["features"]:
            ring = f["geometry"]["coordinates"][0][0]
            key = (int(min(p[0] for p in ring)), int(min(p[1] for p in ring)))
            out[key] = int(f["properties"]["pop_tot"] or 0)
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None) if d["features"] else None
    return out


def inside(x: float, y: float, polys: list) -> bool:
    """Even-odd test over every ring of the polygons, so holes count as outside."""
    hit = False
    for poly in polys:
        for ring in poly:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    hit = not hit
    return hit


def main() -> int:
    base = json.loads(BASE.read_text(encoding="utf-8"))
    ox, oy = base["origin"]
    cell = base["cell"]
    dels = json.loads(LOOKUP.read_text(encoding="utf-8"))["del"]
    boxes = {}
    for code, polys in dels.items():
        pts = [p for poly in polys for ring in poly for p in ring]
        boxes[code] = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))

    def delomrade(x: float, y: float) -> str | None:
        for code, (x0, y0, x1, y1) in boxes.items():
            if x0 <= x <= x1 and y0 <= y <= y1 and inside(x, y, dels[code]):
                return code
        return None

    try:
        last = years()[-1]
        a, b = grid(FIRST), grid(last)
    except Exception as e:  # keep the file we have if SSB is down
        print(f"Rutenett fra SSB feilet ({e}); beholder {OUT.name}", file=sys.stderr)
        return 0

    cells = []
    for key in sorted(set(a) | set(b), key=lambda k: (k[1], k[0])):
        code = delomrade(key[0] + cell / 2, key[1] + cell / 2)
        if code is None:
            continue
        cells.append([(key[0] - ox) // cell, (key[1] - oy) // cell, a.get(key, 0), b.get(key, 0), code])

    out = {
        "generated": dt.date.today().isoformat(),
        "years": [FIRST, last],
        "sum": [sum(c[2] for c in cells), sum(c[3] for c in cells)],
        "source": {"name": "SSB, Befolkning på rutenett 250 m", "url": META, "api": API},
        "cells": cells,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT}: {len(cells)} ruter, {out['sum'][0]} innbyggere i {FIRST} og {out['sum'][1]} i {last}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
