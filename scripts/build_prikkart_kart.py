#!/usr/bin/env python3
"""Build the base map for the dot map («Hvor folk bor») on befolkning.html.

Writes two files:
    site/data/prikkart-kart.json   what the page draws: land, water, built-up areas, main roads, the railway and
                                   the delområde borders, in units of 250 m grid cells from a fixed origin
    config/prikkart_delomrader.json the delområde polygons in UTM metres, which fetch_prikkart.py uses to place each
                                   SSB grid cell in a delområde (and to drop cells outside the kommune)

Sources, both open data under CC BY 4.0 from Kartverket via Geonorge, in EUREF89 UTM sone 33 (EPSG:25833):
    N50 Kartdata for Narvik (1806), GML:
        N50AdministrativeOmrader  Kommune   the kommune area (land fill; it reaches out into the sea)
        N50Arealdekke             Havflate, Innsjø, InnsjøRegulert, Elv (water, drawn on top)
                                  Tettbebyggelse, BymessigBebyggelse (built-up areas, a light tint)
        N50Samferdsel             Veglenke with vegkategori E or R (europa- and riksveier), Bane (Ofotbanen)
    Statistiske enheter grunnkretser, WFS. The first six digits of a grunnkrets number is its delområde.

Geometry is simplified (TOLERANCE metres), small lakes and towns are dropped, and coordinates are rounded, so the
page file stays around 300 kB. The map changes seldom, so this is run by hand, not in the weekly job. It needs
shapely (pip install shapely), unlike the other scripts.

    python scripts/build_prikkart_kart.py
"""
from __future__ import annotations

import io
import json
import math
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "prikkart-kart.json"
LOOKUP = ROOT / "config" / "prikkart_delomrader.json"
KOMMUNE = "1806"
ZIP_URL = ("https://nedlasting.geonorge.no/geonorge/Basisdata/N50Kartdata/GML/"
           f"Basisdata_{KOMMUNE}_Narvik_25833_N50Kartdata_GML.zip")
N50_META = "https://kartkatalog.geonorge.no/metadata/uuid/ea192681-d039-42ec-b1bc-f3ce04c189ac"
GK_URL = "https://wfs.geonorge.no/skwms1/wfs.grunnkretser"
GK_META = "https://kartkatalog.geonorge.no/metadata/uuid/51d279f8-e2be-4f5e-9f72-1a53f7535ec1"

CELL = 250                 # metres per map unit, the size of SSB's grid cells
WATER = {"Havflate", "Innsjø", "InnsjøRegulert", "Elv"}
TOWN = {"Tettbebyggelse", "BymessigBebyggelse"}
GML = "{http://www.opengis.net/gml/3.2}"


def fetch(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "narviktall.no"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def points(el: ET.Element, swap: bool = False) -> list[tuple[float, float]]:
    v = [float(t) for t in el.text.split()]
    pts = list(zip(v[0::2], v[1::2]))
    return [(b, a) for a, b in pts] if swap else pts


def polygons(feature: ET.Element, swap: bool = False) -> list[Polygon]:
    out = []
    for tag in ("PolygonPatch", "Polygon"):
        for p in feature.iter(GML + tag):
            ext = p.find(f"{GML}exterior//{GML}posList")
            holes = [points(i, swap) for i in p.findall(f"{GML}interior//{GML}posList")]
            out.append(Polygon(points(ext, swap), holes).buffer(0))
    return out


def features(data: bytes, names: set[str]):
    for _, el in ET.iterparse(io.BytesIO(data)):
        tag = el.tag.split("}")[-1]
        if tag in names and "N50" in el.tag:
            yield tag, el
            el.clear()


def grunnkretser() -> dict[str, list[Polygon]]:
    """Polygons per delområde, from the grunnkrets WFS (EPSG:25833, northing first in some answers)."""
    q = (f"{GK_URL}?service=WFS&version=2.0.0&request=GetFeature&typeNames=app:Grunnkrets&srsName=EPSG:25833"
         "&bbox=480000,7500000,700000,7700000,EPSG:25833")
    root = ET.fromstring(fetch(q))
    out: dict[str, list[Polygon]] = {}
    for member in root:
        f = member[0] if len(member) else None
        if f is None:
            continue
        nr = next((e.text for e in f.iter() if e.tag.endswith("}grunnkretsnummer")), "") or ""
        if not nr.startswith(KOMMUNE):
            continue
        first = f.find(f".//{GML}posList")
        swap = first is not None and float(first.text.split()[0]) > 1e6
        out.setdefault(nr[:6], []).extend(polygons(f, swap))
    return out


def main() -> None:
    print("Henter N50 Kartdata …")
    z = zipfile.ZipFile(io.BytesIO(fetch(ZIP_URL)))
    name = lambda part: f"Basisdata_{KOMMUNE}_Narvik_25833_N50{part}_GML.gml"

    kommune = unary_union([p for _, el in features(z.read(name("AdministrativeOmrader")), {"Kommune"})
                           for p in polygons(el)])
    bx0, by0, bx1, by1 = kommune.bounds
    ox, oy = math.floor(bx0 / CELL) * CELL, math.floor(by0 / CELL) * CELL

    def xy(x: float, y: float) -> list[float]:
        return [round((x - ox) / CELL, 2), round((y - oy) / CELL, 2)]

    def rings(geom, tol: float, min_area: float) -> list:
        geom = geom.simplify(tol)
        out = []
        for p in getattr(geom, "geoms", [geom]):
            if p.area < min_area:
                continue
            r = [[xy(*c) for c in p.exterior.coords]]
            r += [[xy(*c) for c in i.coords] for i in p.interiors if Polygon(i).area > min_area]
            out.append(r)
        return out

    def lines(ls: list[LineString], tol: float) -> list:
        m = linemerge(unary_union(ls)).simplify(tol)
        return [[xy(*c) for c in g.coords] for g in getattr(m, "geoms", [m])]

    print("Leser arealdekke …")
    water, town = [], []
    for tag, el in features(z.read(name("Arealdekke")), WATER | TOWN):
        (water if tag in WATER else town).extend(polygons(el))
    print("Leser veier og jernbane …")
    roads, rail = [], []
    for tag, el in features(z.read(name("Samferdsel")), {"Veglenke", "Bane"}):
        kat = next((e.text for e in el.iter() if e.tag.endswith("vegkategori")), None)
        typ = next((e.text for e in el.iter() if e.tag.endswith("typeVeg")), None)
        if tag == "Bane" or (kat in ("E", "R") and typ == "enkelBilveg"):
            for pl in el.iter(GML + "posList"):
                (rail if tag == "Bane" else roads).append(LineString(points(pl)))

    print("Henter grunnkretser …")
    dels = {k: unary_union(v) for k, v in sorted(grunnkretser().items())}

    page = {
        "origin": [ox, oy],
        "cell": CELL,
        "kommune": rings(kommune, 25, 2e5),
        "water": rings(unary_union(water), 25, 1.5e4),
        "town": rings(unary_union(town), 20, 1e4),
        "roads": lines(roads, 25),
        "rail": lines(rail, 25),
        "del": {k: rings(g, 120, 2e5) for k, g in dels.items()},
        "kilder": {"n50": N50_META, "grunnkretser": GK_META},
    }
    OUT.write_text(json.dumps(page, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    def metres(geom) -> list:
        geom = geom.simplify(10)
        return [[[[round(x), round(y)] for x, y in r.coords] for r in [p.exterior, *p.interiors]]
                for p in getattr(geom, "geoms", [geom])]
    lookup = {"note": "Delområder i Narvik (grunnkretser fra Kartverket, UTM 33, forenklet 10 m). "
                      "Lages av scripts/build_prikkart_kart.py.",
              "del": {k: metres(g) for k, g in dels.items()}}
    LOOKUP.write_text(json.dumps(lookup, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(OUT, OUT.stat().st_size, "bytes;", LOOKUP, LOOKUP.stat().st_size, "bytes;", len(dels), "delområder")


if __name__ == "__main__":
    main()
