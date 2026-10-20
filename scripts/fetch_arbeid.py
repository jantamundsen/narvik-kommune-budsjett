#!/usr/bin/env python3
"""Fetch labour market figures for Narvik from NAV and SSB and write site/data/arbeid.json for arbeid.html.

NAV, every month, from the Excel tables on nav.no (there is no API). Each year's December file has the whole
year, in the archive page for that year, and the newest file is on the statistics page itself:
    HL060    Helt ledige. Fylke og kommune. Tidsserie måned (number and per cent of the labour force), from 2020
    STIL030  Tilgang ledige stillinger. Fylke. Tidsserie måned (new vacancies), per kommune from 2021
The links change every month, so they are found on the pages. If nav.no cannot be read, the NAV figures already
in arbeid.json are kept and a warning is printed, so the SSB figures still update.

SSB, once a year (4th quarter, register-based):
    06445  employed as a share of the population, by sex and age
    13563  the population by labour force status (employed, registered unemployed, on measures, in education,
           AAP or disability benefit, pension, other), by age
    13472  employed by sector and by industry, by place of residence and place of work
    11616  commuting in and out
    03321  commuting flows between kommuner

The comparison is Harstad, Rana and Alta, Nordland and the whole country, as on bolig.html. Harstad and Alta
have old numbers before 2024 (5402, 5403); for each year the number that has a value is used. Narvik got its
current borders (code 1806) in 2020, so there are no figures for it before that. None of these tables has the
KOSTRA group or the country without Oslo.
Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_arbeid.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fetch_data import cells, fetch, labels

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "arbeid.json"
REGION = "1806"
FIRST = 2020

REGIONS = [
    {"key": "narvik", "name": "Narvik", "kind": "kommune", "codes": ["1806"]},
    {"key": "harstad", "name": "Harstad", "kind": "kommune", "codes": ["5503", "5402"]},
    {"key": "rana", "name": "Rana", "kind": "kommune", "codes": ["1833"]},
    {"key": "alta", "name": "Alta", "kind": "kommune", "codes": ["5601", "5403"]},
    {"key": "nordland", "name": "Nordland", "kind": "fylke", "codes": ["18"]},
    {"key": "norge", "name": "Hele landet", "kind": "landet", "codes": ["0"]},
]
CODES = {r["key"]: r["codes"] for r in REGIONS}
ALL_CODES = ",".join(c for r in REGIONS for c in r["codes"])

NAV = "https://www.nav.no"
NAV_STAT = NAV + "/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk"
NAV_PAGES = {
    "HL060": (NAV_STAT + "/helt-ledige", NAV_STAT + "/relatert-informasjon/arkiv-helt-ledige.{y}"),
    "STIL030": (NAV_STAT + "/ledige-stillinger", NAV_STAT + "/relatert-informasjon/arkiv-ledige-stillinger.{y}"),
}
MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]


def url(table: str, **codes: str) -> str:
    params = {"lang": "no", **{f"valueCodes[{k}]": v for k, v in codes.items()}}
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data?" + urllib.parse.urlencode(params, safe="[]*,()-")


def source(table: str, query: str) -> dict:
    return {"table": table, "url": f"https://www.ssb.no/statbank/table/{table}", "query": query}


def get(query: str) -> dict:
    print(f"Henter {query}", file=sys.stderr)
    return fetch(query)


def region_of(code: str) -> str | None:
    return next((k for k, cs in CODES.items() if code in cs), None)


# --- NAV ---------------------------------------------------------------------------------------------------

def download(u: str) -> bytes:
    req = urllib.request.Request(u, headers={"User-Agent": "narvik-kommune-budsjett"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def xlsx_rows(data: bytes) -> dict[str, list[list]]:
    """{sheet name: rows}, each row a list of cell values (str, float or None), read with the standard library."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    m = "{%s}" % ns["m"]
    z = zipfile.ZipFile(io.BytesIO(data))
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            strings.append("".join(t.text or "" for t in si.iter(m + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", ns):
        target = rels[s.get("{%s}id" % ns["r"])].lstrip("/")
        rows = []
        for row in ET.fromstring(z.read(target if target.startswith("xl/") else "xl/" + target)).iter(m + "row"):
            cellmap = {}
            for c in row.findall("m:c", ns):
                col = 0
                for ch in re.match(r"[A-Z]+", c.get("r")).group():
                    col = col * 26 + ord(ch) - 64
                v, t = c.find("m:v", ns), c.get("t")
                if t == "s" and v is not None:
                    val = strings[int(v.text)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(m + "t"))
                elif v is not None:
                    try:
                        val = float(v.text)
                    except ValueError:
                        val = v.text
                else:
                    continue
                cellmap[col - 1] = val
            rows.append([cellmap.get(i) for i in range(max(cellmap) + 1)] if cellmap else [])
        out[s.get("name")] = rows
    return out


def nav_link(page: str, code: str) -> str | None:
    """The monthly Excel file for a table on a nav.no page (named like 202609_HL060 ... .xlsx)."""
    html = download(page).decode("utf-8", "replace")
    links = re.findall(r'href="(/_/attachment/download/[^"]*?/(\d{6})_%s[^"]*\.xlsx)"' % code, html)
    return NAV + max(links, key=lambda x: x[1])[0] if links else None


def nav_table(data: bytes, year: int, kind: str) -> dict:
    """{region key: {"2026-09": value}} from one HL060 or STIL030 file. kind is "n" (number) or "pct"."""
    out: dict = {}
    for name, rows in xlsx_rows(data).items():
        low = name.lower()
        if kind == "pct" and "prosent" not in low or kind == "n" and "antall" not in low:
            continue
        municipal = "kommune" in low
        header = None
        for r in rows:
            months = {i: MONTHS.index(c.strip().lower()) + 1 for i, c in enumerate(r)
                      if isinstance(c, str) and c.strip().lower() in MONTHS}
            if len(months) >= 3:
                header = months
                continue
            if header is None:
                continue
            texts = [c.strip() for c in r[:3] if isinstance(c, str)]
            key = None
            if municipal:
                m = next((re.match(r"(\d{4}) ", t) for t in texts if re.match(r"\d{4} ", t)), None)
                key = region_of(m.group(1)) if m else None
                if key in ("nordland", "norge"):
                    key = None
            elif "18" in texts:
                key = "nordland"
            elif texts and texts[0] == "I alt":
                key = "norge"
            if not key:
                continue
            for i, mo in header.items():
                if i < len(r) and isinstance(r[i], float):
                    out.setdefault(key, {}).setdefault(f"{year}-{mo:02d}", r[i])
    return out


def fetch_nav() -> dict:
    """Every month from FIRST for HL060 (number and per cent) and STIL030 (number), with the files used."""
    this_year = dt.date.today().year
    out = {"ledige": {}, "stillinger": {}, "files": {}}
    for code, (current, archive) in NAV_PAGES.items():
        for y in range(FIRST, this_year + 1):
            pages = [archive.format(y=y)] if y < this_year else []
            pages.append(current)  # in January the newest file can still be last year's December
            for page in pages:
                try:
                    link = nav_link(page, code)
                except Exception as e:  # an archive page that does not exist yet
                    print(f"Fant ikke {page}: {e}", file=sys.stderr)
                    continue
                if not link:
                    continue
                file_year = int(re.search(r"/(\d{4})\d\d_", link).group(1))
                if file_year != y:
                    continue
                print(f"Henter {urllib.parse.unquote(link.rsplit('/', 1)[-1])}", file=sys.stderr)
                data = download(link)
                if code == "HL060":
                    n, p = nav_table(data, y, "n"), nav_table(data, y, "pct")
                    for k, ms in n.items():
                        for mo, v in ms.items():
                            out["ledige"].setdefault(k, {})[mo] = {"n": v, "pct": p.get(k, {}).get(mo)}
                else:
                    for k, ms in nav_table(data, y, "n").items():
                        out["stillinger"].setdefault(k, {}).update(ms)
                out["files"].setdefault(code, {})[str(y)] = {"page": page, "file": link}
                break
    for part in ("ledige", "stillinger"):
        out[part] = {k: dict(sorted(v.items())) for k, v in out[part].items()}
    if not out["ledige"].get("narvik") or not out["stillinger"].get("narvik"):
        raise RuntimeError("fant ikke Narvik i NAVs tabeller")
    return out


# --- SSB ---------------------------------------------------------------------------------------------------

def by_region(ds: dict, region_dim: str, keys: list[str], fn=None) -> dict:
    """{region key: {year: {key codes joined by |: value}}}, the first region code with a value other than 0 winning.
    fn(cell) can return False to skip a cell."""
    out: dict = {}
    for c, v in cells(ds):
        if v is None or (fn and not fn(c)):
            continue
        k = region_of(c[region_dim])
        if k:
            slot, key = out.setdefault(k, {}).setdefault(c["Tid"], {}), "|".join(c[d] for d in keys)
            # SSB has 0 rather than no value for a kommune number in the years it did not exist.
            if not slot.get(key):
                slot[key] = v
    return out


def fetch_ssb() -> tuple[dict, dict]:
    sources, data = {}, {}

    q = url("06445", Region=ALL_CODES, Kjonn="*", Alder="*", ContentsCode="Sysselsatte", Tid=f"from({FIRST})")
    sources["06445"] = source("06445", q)
    ds = get(q)
    data["ages"] = [{"code": c, "name": n} for c, n in labels(ds, "Alder").items()]
    data["employment"] = by_region(ds, "Region", ["Alder", "Kjonn"])

    q = url("13563", Region=ALL_CODES, HovArbStyrkStatus="*", Alder="15-74,15-29,20-66", InnvandrKat="A-G",
            ContentsCode="Bosatte", Tid=f"from({FIRST})")
    sources["13563"] = source("13563", q)
    ds = get(q)
    data["status_labels"] = labels(ds, "HovArbStyrkStatus")
    data["status"] = by_region(ds, "Region", ["Alder", "HovArbStyrkStatus"], lambda c: c["HovArbStyrkStatus"] not in ("TOT2", "TOT3"))

    q = url("13472", Region=ALL_CODES, NACE2007="*", Sektor="*", ContentsCode="*", Tid=f"from({FIRST})")
    sources["13472"] = source("13472", q)
    ds = get(q)
    data["sector_labels"] = labels(ds, "Sektor")
    data["industry_labels"] = labels(ds, "NACE2007")
    data["sector"] = by_region(ds, "Region", ["ContentsCode", "Sektor"], lambda c: c["NACE2007"] == "00-99")
    data["industry"] = by_region(ds, "Region", ["ContentsCode", "NACE2007"], lambda c: c["Sektor"] == "ALLE")

    q = url("11616", Region=",".join(c for r in REGIONS[:5] for c in r["codes"]), Kjonn="*", Alder="15-74",
            ContentsCode="*", Tid=f"from({FIRST})")
    sources["11616"] = source("11616", q)
    commuting: dict = {}
    for c, v in cells(get(q)):
        k = region_of(c["Region"])
        if v is None or not k:
            continue
        slot = commuting.setdefault(k, {}).setdefault(c["Tid"], {}).setdefault(c["Region"], {})
        slot[c["ContentsCode"]] = slot.get(c["ContentsCode"], 0) + v
    # Keep one code per region and year: the one with figures (Harstad and Alta changed number in 2024).
    data["commuting"] = {k: {y: max(by.values(), key=lambda d: sum(d.values())) for y, by in ys.items()}
                         for k, ys in commuting.items()}

    # Flows to and from Narvik in the newest year, by kommune.
    year = max(data["commuting"]["narvik"])
    flows = {}
    for direction, here, there in (("ut", "Bokommuen", "ArbstedKomm"), ("inn", "ArbstedKomm", "Bokommuen")):
        q = url("03321", **{here: REGION, there: "*"}, ContentsCode="Sysselsatte", Tid=year)
        sources["03321"] = source("03321", url("03321", Bokommuen=REGION, ArbstedKomm="*", ContentsCode="Sysselsatte", Tid=year))
        ds = get(q)
        names = labels(ds, there)
        rows = [(c[there], v) for c, v in cells(ds) if v and c[there] != REGION]
        # Our own name for the comparison kommuner, SSB's full name (which can be in two languages) for the rest.
        name = lambda k: next((r["name"] for r in REGIONS if k in r["codes"]), re.sub(r" \(.*", "", names[k]))
        flows[direction] = [{"code": k, "name": name(k), "n": v}
                            for k, v in sorted(rows, key=lambda x: -x[1])]
    data["flows"] = {"year": year, **flows}
    return data, sources


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    ssb, sources = fetch_ssb()
    try:
        nav = fetch_nav()
    except Exception as e:
        if not args.out.exists():
            raise
        print(f"Advarsel: kunne ikke hente NAVs tall ({e}). Beholder tallene fra forrige gang.", file=sys.stderr)
        nav = json.loads(args.out.read_text(encoding="utf-8"))["nav"]

    data = {
        "generated": dt.date.today().isoformat(),
        "region": REGION,
        "regions": [{k: r[k] for k in ("key", "name", "kind")} for r in REGIONS],
        "nav": nav,
        **ssb,
        "sources": sources,
    }
    last = max(nav["ledige"]["narvik"])
    print(f"Skrev {args.out.relative_to(ROOT)}: NAV til {last}, SSB til {max(ssb['employment']['narvik'])}", file=sys.stderr)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
