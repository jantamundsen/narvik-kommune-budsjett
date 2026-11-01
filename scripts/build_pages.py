#!/usr/bin/env python3
"""Write one HTML page per case and per tjenesteområde, and the sitemap.

saker.html and omrade.html draw their content with JavaScript from ?sak= and ?omrade=,
so to a search engine every case looked like the same empty page. This script copies
the two templates to site/sak/<id>.html and site/utgifter/<key>.html, which GitHub Pages
serves as narviktall.no/sak/<id> and narviktall.no/utgifter/<key>. Each copy gets its own
title, description and canonical address, and the header (and for a case the key
numbers with their sources) written into the HTML. saker.js and omrade.js then draw the
full page as before, reading the id from data-sak / data-omrade.

<base href="/"> keeps the templates' relative links (style.css, data/..., okonomi) working
one folder down. Run after build_saker.py and fetch_data.py; it also rewrites
site/sitemap.xml, so new cases and areas are listed there.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
BASE = "https://narviktall.no/"
BRAND = "Åpne tall for Narvik"
# Pages with their own HTML file, in sitemap order. The generated pages follow.
STATIC = ["", "okonomi", "budsjett", "lopende", "tiltak", "inntekter", "gjeld", "befolkning", "bolig", "arbeid",
          "naering", "saker", "andre-tall", "om"]

esc = lambda s: html.escape(str(s), quote=True)


def page(template, title, desc, path, main_attrs, main_html):
    s = template
    url = BASE + path
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">', 1)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', s, count=1)
    s = re.sub(r'<title>[^<]*</title>', f'<title>{esc(title)}</title>\n<link rel="canonical" href="{url}">\n'
               f'<meta property="og:url" content="{url}">', s, count=1)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(title)}">', s, count=1)
    s = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', s, count=1)
    s, n = re.subn(r'<main ([^>]*)></main>', lambda m: f'<main {m.group(1)} {main_attrs}>{main_html}</main>', s, count=1)
    assert n == 1, "fant ikke <main> i malen"
    return "<!-- Laget av scripts/build_pages.py fra malen. Endre malen, ikke denne filen. -->\n" + s


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def source(kilder, k):
    """A source as a link, like saker.js: «Tertialrapport 2/2026, s. 9»."""
    ks = k if isinstance(k, list) else [k]
    out = []
    for x in ks:
        s = kilder[x["id"]]
        side = x.get("side")
        href = (s["pdf"] + (f"#page={side}" if side else "")) if s.get("pdf") else s["url"]
        out.append(f'<a href="{esc(href)}" target="_blank" rel="noopener">{esc(s["navn"])}{f", s. {side}" if side else ""}</a>')
    return "; ".join(out)


def main():
    saker = json.loads((SITE / "data/saker.json").read_text())
    narvik = json.loads((SITE / "data/narvik.json").read_text())
    tpl_sak = (SITE / "saker.html").read_text()
    tpl_omr = (SITE / "omrade.html").read_text()
    urls = list(STATIC)

    keep = set()
    for S in saker["saker"]:
        stats = "".join(
            f'<div class="stat"><span class="sub">{esc(n["navn"])}</span><span class="big num">{esc(n["verdi"])}</span>'
            f'<span class="sub">{esc(n["tekst"])}</span><span class="caption">Kilde: {source(saker["kilder"], n["kilde"])}</span></div>'
            for n in S["nokkeltall"])
        body = (f'<header><nav class="crumbs" aria-label="Brødsmuler"><a href="saker">Utvalgte saker</a>'
                f'<span aria-hidden="true">›</span><span aria-current="page">{esc(S["tittel"])}</span></nav>'
                f'<h1>{esc(S["tittel"])}</h1><p class="lead">{esc(S["ingress"])}</p></header>'
                f'<section aria-label="Nøkkeltall"><div class="stats3 sak-stats" style="--n:{len(S["nokkeltall"])}">{stats}</div></section>')
        path = f'sak/{S["id"]}'
        write(SITE / f"{path}.html", page(tpl_sak, f'{S["tittel"]}: faktaark · {BRAND}', S["ingress"], path,
                                          f'data-sak="{esc(S["id"])}"', body))
        keep.add(f'{S["id"]}.html')
        urls.append(path)

    keep_omr = set()
    for c in narvik["categories"]:
        name = c["name"]
        what = c.get("description", "")
        desc = (f"Hva Narvik kommune bruker på {name[0].lower() + name[1:]}"
                + (f" ({what[0].lower() + what[1:]})" if what else "")
                + ": netto driftsutgifter, hva pengene går til og hvem som betaler, sammenlignet med lignende kommuner.")
        body = f'<header><h1>{esc(name)}</h1><p class="lead">{esc(desc)}</p></header>'
        path = f'utgifter/{c["key"]}'
        write(SITE / f"{path}.html", page(tpl_omr, f"{name} i Narvik kommune · {BRAND}", desc, path,
                                          f'data-omrade="{esc(c["key"])}"', body))
        keep_omr.add(f'{c["key"]}.html')
        urls.append(path)

    # A case or area that is gone should not leave its page behind.
    for folder, names in (("sak", keep), ("utgifter", keep_omr)):
        for f in (SITE / folder).glob("*.html"):
            if f.name not in names:
                f.unlink()

    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    write(SITE / "sitemap.xml", sitemap)
    print(f"Skrev {len(keep)} saker, {len(keep_omr)} tjenesteområder og sitemap.xml med {len(urls)} adresser.")


if __name__ == "__main__":
    main()
