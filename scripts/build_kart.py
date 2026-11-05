#!/usr/bin/env python3
"""Build the base map for the commuting map on arbeid.html and write site/data/kart.json.

The map is Ofoten, Vesterålen, Lofoten, Salten and Sør-Troms, from Kartverket's N1000 Kartdata (open data,
CC BY 4.0), downloaded from Geonorge as GML in EUREF89 UTM sone 33:
    N1000AdministrativeOmrader  Kommune  the kommune areas, which reach out into the sea
    N1000Arealdekke             Havflate the sea, drawn on top so the coastline shows
Coordinates are UTM metres, so the map has the right shape without further projection. They are clipped to the
map frame, thinned (points closer than TOLERANCE metres to the line are dropped) and rounded to whole
viewBox units, so the file stays small. Each kommune also gets a point for the end of the commuting arcs (the
centre of its largest built-up area, see main_point), and its Norwegian name from Kartverket's kommuneinfo API for the label
(N1000 has only the first official name, which for some kommuner is the Sami one).

The borders change seldom, so this is run by hand when kommuner merge or split, not in the weekly job.
Only the standard library is used.

    python scripts/build_kart.py
"""
from __future__ import annotations

import argparse
import io
import json
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "kart.json"
ZIP_URL = "https://nedlasting.geonorge.no/geonorge/Basisdata/N1000Kartdata/GML/Basisdata_0000_Norge_25833_N1000Kartdata_GML.zip"
NAMES_URL = "https://api.kartverket.no/kommuneinfo/v1/kommuner"
META_URL = "https://kartkatalog.geonorge.no/metadata/kartverket/n1000-kartdata/aee42bb6-d0e9-4d70-86fe-6ea76c381055"

# Map frame in UTM 33 metres: Bodø and Lofoten in the south-west, Tromsø in the north-east.
X0, X1 = 395_000, 705_000
Y0, Y1 = 7_440_000, 7_760_000
SCALE = 500          # metres per viewBox unit
TOLERANCE = 400      # metres

GML = "{http://www.opengis.net/gml/3.2}"


def rings(feature: ET.Element) -> list[list[list[tuple[float, float]]]]:
    """Polygons (exterior ring first, then holes) of one GML feature."""
    polys = []
    for patch in feature.iter(GML + "PolygonPatch"):
        poly = []
        for part in ("exterior", "interior"):
            for el in patch.findall(f"{GML}{part}/{GML}LinearRing/{GML}posList"):
                v = [float(t) for t in el.text.split()]
                poly.append(list(zip(v[0::2], v[1::2])))
        polys.append(poly)
    return polys


def clip(ring, edges=((0, X0, 1), (0, X1, -1), (1, Y0, 1), (1, Y1, -1))):
    """Sutherland–Hodgman clipping of a ring to the map frame (with a small margin)."""
    m = 2 * SCALE
    for axis, limit, sign in edges:
        limit -= sign * m
        inside = lambda p: (p[axis] - limit) * sign >= 0
        out = []
        for i, cur in enumerate(ring):
            prev = ring[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur, axis, limit))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur, axis, limit))
        ring = out
        if not ring:
            break
    return ring


def cross(a, b, axis, limit):
    t = (limit - a[axis]) / (b[axis] - a[axis])
    p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    p[axis] = limit
    return tuple(p)


def thin(pts, tol=TOLERANCE):
    """Douglas–Peucker line simplification."""
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    n = (dx * dx + dy * dy) ** 0.5
    best, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / n if n else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return thin(pts[: idx + 1], tol)[:-1] + thin(pts[idx:], tol)


def area(ring) -> float:
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1])) / 2


def centroid(ring) -> tuple[float, float]:
    a = area(ring)
    cx = sum((x0 + x1) * (x0 * y1 - x1 * y0) for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
    cy = sum((y0 + y1) * (x0 * y1 - x1 * y0) for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
    return cx / (6 * a), cy / (6 * a)


def vb(p) -> tuple[int, int]:
    return round((p[0] - X0) / SCALE), round((Y1 - p[1]) / SCALE)


def path(polys) -> str:
    parts = []
    for poly in polys:
        for ring in poly:
            ring = clip(ring)
            if len(ring) < 3:
                continue
            closed = ring + [ring[0]]
            pts = []
            for p in thin(closed)[:-1]:
                q = vb(p)
                if not pts or q != pts[-1]:
                    pts.append(q)
            if len(pts) < 3 or abs(area(pts)) < 1:
                continue
            first, rest = pts[0], pts[1:]
            parts.append(f"M{first[0]} {first[1]}" + "".join(
                f"l{b[0] - a[0]} {b[1] - a[1]}" for a, b in zip(pts, rest)) + "z")
    return "".join(parts)


def overlaps(polys) -> bool:
    if not polys:
        return False
    xs = [x for poly in polys for x, _ in poly[0]]
    ys = [y for poly in polys for _, y in poly[0]]
    return min(xs) < X1 and max(xs) > X0 and min(ys) < Y1 and max(ys) > Y0


def inside(pt, polys) -> bool:
    """Even-odd point-in-polygon test over all rings."""
    x, y = pt
    hit = False
    for poly in polys:
        for ring in poly:
            for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
                if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                    hit = not hit
    return hit


def main_point(polys, towns, sea) -> tuple[float, float]:
    """Where the arcs end: the centre of the largest built-up area (Tettbebyggelse) in the kommune, or, if N1000
    has none there, the land point in the kommune closest to the centre of its largest polygon."""
    in_k = [(abs(area(t)), centroid(t)) for t in towns if inside(centroid(t), polys)]
    if in_k:
        return max(in_k)[1]
    cx, cy = centroid(max((p[0] for p in polys), key=lambda r: abs(area(r))))
    step = 1000
    for r in range(0, 80):
        ring = [(cx + dx * step, cy + dy * step) for dx in range(-r, r + 1) for dy in range(-r, r + 1)
                if max(abs(dx), abs(dy)) == r]
        for pt in sorted(ring, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2):
            if inside(pt, polys) and not inside(pt, sea):
                return pt
    return cx, cy


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zip", type=Path, help="N1000 zip already downloaded")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    if args.zip:
        data = args.zip.read_bytes()
    else:
        req = urllib.request.Request(ZIP_URL, headers={"User-Agent": "narvik-kommune-budsjett"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
    z = zipfile.ZipFile(io.BytesIO(data))
    name = lambda part: next(n for n in z.namelist() if n.endswith(f"N1000{part}_GML.gml"))

    kommuner = {}
    for _, el in ET.iterparse(z.open(name("AdministrativeOmrader"))):
        if el.tag.endswith("}Kommune"):
            code = el.findtext("{*}kommunenummer")
            polys = rings(el)
            if overlaps(polys):
                kommuner[code] = {"name": el.findtext("{*}kommunenavn"), "polys": polys}
            el.clear()

    sea, towns = [], []
    for _, el in ET.iterparse(z.open(name("Arealdekke"))):
        if el.tag.endswith("}Havflate"):
            polys = rings(el)
            if overlaps(polys):
                sea.extend(polys)
            el.clear()
        elif el.tag.endswith("}Tettbebyggelse"):
            polys = rings(el)
            if overlaps(polys):
                towns.extend(p[0] for p in polys)
            el.clear()
        elif el.tag.endswith("}featureMember"):
            el.clear()

    # The land part of each kommune is what is left when the sea is drawn on top (fill-rule evenodd, since
    # islands are holes in the sea).
    req = urllib.request.Request(NAMES_URL, headers={"Accept": "application/json", "User-Agent": "narvik-kommune-budsjett"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        norsk = {k["kommunenummer"]: k["kommunenavnNorsk"] for k in json.load(resp)}

    out = {
        "source": {"name": "Kartverket, N1000 Kartdata (CC BY 4.0)", "url": META_URL},
        "frame": {"crs": "EPSG:25833", "x0": X0, "y1": Y1, "scale": SCALE},
        "width": round((X1 - X0) / SCALE),
        "height": round((Y1 - Y0) / SCALE),
        "sea": path(sea),
        "kommuner": [],
    }
    for code, k in sorted(kommuner.items()):
        d = path(k["polys"])
        if not d:
            continue
        x, y = vb(main_point(k["polys"], towns, sea))
        out["kommuner"].append({"code": code, "name": norsk.get(code, k["name"]), "d": d, "x": x, "y": y})
    args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Skrev {args.out} ({len(out['kommuner'])} kommuner, {args.out.stat().st_size // 1024} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
