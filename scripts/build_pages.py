#!/usr/bin/env python3
"""Write one HTML page per case and per tjenesteområde, and the sitemap.

saker.html and omrade.html draw their content with JavaScript from ?sak= and ?omrade=,
so to a search engine every case looked like the same empty page. This script copies
the two templates to site/sak/<id>.html and site/utgifter/<key>.html, which GitHub Pages
serves as narviktall.no/sak/<id> and narviktall.no/utgifter/<key>, and selskap.html to
site/selskaper/<id>.html for each company the kommune owns (narviktall.no/selskaper/<id>). Each copy gets its own
title, description and canonical address, and the header (and for a case the key
numbers with their sources) written into the HTML. saker.js and omrade.js then draw the
full page as before, reading the id from data-sak / data-omrade.

<base href="/"> keeps the templates' relative links (style.css, data/..., okonomi) working
one folder down. Run after build_saker.py, fetch_data.py and fetch_selskaper.py; it also rewrites
site/sitemap.xml, so new cases and areas are listed there.

It also writes the newest numbers into the lead paragraphs, title and description of befolkning.html and
bolig.html, and the population under the title of index.html (prerender below), so the answer to «hvor mange bor i Narvik» or the price per square metre is in
the HTML a search engine reads, not only in what befolkning.js and bolig.js draw. The texts are the same as the
JavaScript writes; change them both places. Run after fetch_befolkning.py and fetch_bolig.py.
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
STATIC = ["", "okonomi", "budsjett", "lopende", "tiltak", "inntekter", "gjeld", "selskaper/", "befolkning", "bolig",
          "arbeid", "naering", "saker", "andre-tall", "om"]

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


def nb(v, d=0):
    """A number as toLocaleString('nb-NO') writes it: 21 647, 3,25, −12."""
    s = f"{abs(v):,.{d}f}".replace(",", "\u00a0").replace(".", ",")
    return ("\u2212" if v < 0 and float(s.replace("\u00a0", "").replace(",", ".")) else "") + s


def set_head(s, title, desc):
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', s, count=1)
    s = re.sub(r'<title>[^<]*</title>', f'<title>{esc(title)}</title>', s, count=1)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(title)}">', s, count=1)
    return re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', s, count=1)


def set_text(s, id_, text):
    s, n = re.subn(rf'(<p class="lead" id="{id_}">)[^<]*(</p>)', lambda m: m.group(1) + esc(text) + m.group(2), s, count=1)
    assert n == 1, f"fant ikke id={id_}"
    return s


FEE_KEYS = [("vann", "vann"), ("avlop", "avløp"), ("avfall", "avfall"), ("feiing", "feiing og tilsyn")]


def fee_lead(H):
    """The lead of «Kommunale avgifter og eiendomsskatt» on bolig.html, as drawFees() in bolig.js writes it."""
    F, T = H.get("fees", {}).get("narvik"), H.get("property_tax", {}).get("narvik", {})
    total = lambda f: sum(f[k] for k, _ in FEE_KEYS) if f and all(f.get(k) is not None for k, _ in FEE_KEYS) else None
    ys = sorted(y for y in (F or {}) if total(F[y]) is not None)
    if not ys:
        return None
    y = ys[-1]
    f, n = F[y], total(F[y])
    parts = [f"{name} {nb(f[k])} kr" for k, name in FEE_KEYS]
    lead = (f"En standard bolig på 120 m² i Narvik betaler {nb(n)} kr i året i kommunale gebyrer i {y}, uten mva: "
            + ", ".join(parts[:-1]) + " og " + parts[-1] + ".")
    land = total(H["fees"].get("landet", {}).get(y))
    if land:
        lead += f" Det er {nb(abs(n / land - 1) * 100)} % {'lavere' if n < land else 'høyere'} enn snittet for landet uten Oslo."
    rate_y = max((x for x in T if T[x].get("has_tax") is not None), default=None)
    avg_y = max((x for x in T if T[x].get("avg_housing") is not None), default=None)
    if rate_y and T[rate_y]["has_tax"]:
        t = T[rate_y]
        r = t.get("rate_housing", t.get("rate_general"))
        rate = re.sub(r",?0+$", "", nb(r, 2))
        lead += (f" Narvik har eiendomsskatt på boliger, med en sats på {rate} promille i {rate_y}"
                 + (f" og {nb(t['deduction'])} kr i bunnfradrag" if t.get("deduction") else "") + ".")
        if avg_y:
            lead += f" I snitt betalte en bolig {nb(T[avg_y]['avg_housing'])} kr i eiendomsskatt i {avg_y}."
    return lead


def prerender():
    B = json.loads((SITE / "data/befolkning.json").read_text())
    last, first, P = str(B["last"]), str(B["compare"]["first"]), B["pyramid"]
    total = lambda y: sum(P[y]["f"]) + sum(P[y]["m"])
    now, then = total(last), total(first)
    row = {r["key"]: r for r in B["compare"]["rows"]}
    f = SITE / "befolkning.html"
    s = f.read_text()
    s = set_head(s, f"Hvor mange bor i Narvik? Innbyggere {last}, alder og framskrivinger · {BRAND}",
                 f"{nb(now)} bodde i Narvik 1. januar {last}. Innbyggertallet år for år fra 2020, alder og kjønn, "
                 f"framskrivinger til {max(P)}, hvor i kommunen folk bor, innvandrere og husholdninger, med kilde for hvert tall.")
    s = set_text(s, "lead", f"{nb(now)} bodde i Narvik 1. januar {last}, {nb(abs(now - then))} {'færre' if now < then else 'flere'} "
                            f"enn i {first}. Medianalderen er {row['narvik']['median']} år, mot {row['landet']['median']} i landet uten Oslo.")
    write(f, s)

    # The big population number under the title on the front page (hero() in forside.js).
    f = SITE / "index.html"
    s = f.read_text()
    s, n = re.subn(r'<p class="hero-stat" id="hero-stat"( hidden)?><span class="hero-num num" id="hero-num">[^<]*</span> '
                   r'<span class="hero-what" id="hero-what">[^<]*</span></p>',
                   f'<p class="hero-stat" id="hero-stat"><span class="hero-num num" id="hero-num">{nb(now)}</span> '
                   f'<span class="hero-what" id="hero-what">innbyggere 1. januar {last}</span></p>', s, count=1)
    assert n == 1, "fant ikke hero-stat i index.html"
    write(f, s)

    H = json.loads((SITE / "data/bolig.json").read_text())
    y = str(H["year"])
    stock = H["stock"][y]
    homes = sum(stock.values())
    t_year = max(H["tenure"]["narvik"])
    ten = H["tenure"]["narvik"][t_year]
    PR = H["prices"]["narvik"]
    lq = max(q for q in PR if PR[q].get("00", {}).get("price") is not None)
    quarter = lambda q: f"{q[-1]}. kvartal {q[:4]}"
    price = PR[lq]["00"]["price"]
    f = SITE / "bolig.html"
    s = f.read_text()
    s = set_head(s, f"Boligpriser i Narvik, kommunale avgifter og boligbygging · {BRAND}",
                 f"Boliger i Narvik ble solgt for {nb(price)} kr per kvadratmeter i snitt i {quarter(lq)}. Boligpriser kvartal for "
                 f"kvartal, kommunale avgifter og eiendomsskatt, nye boliger, eie og leie og kommunale boliger, sammenlignet med lignende kommuner.")
    s = set_text(s, "lead", f"Narvik hadde {nb(homes)} boliger i {y} og {nb(ten['0']['n'])} husholdninger i {t_year}. "
                            f"{nb(stock['01'] / homes * 100)} % av boligene er eneboliger. {nb(ten['1']['pct'] + ten['2']['pct'], 1)} % "
                            f"av husholdningene eier boligen de bor i. Boligene ble solgt for {nb(price)} kr per kvadratmeter i snitt i {quarter(lq)}.")
    n = H["prices"].get("norge", {}).get(lq, {}).get("00", {}).get("price")
    types = [(t["name"], PR[lq].get(t["code"], {}).get("price")) for t in H["price_types"] if t["code"] != "00"]
    if n:
        s = set_text(s, "price-lead", f"Boliger i Narvik ble solgt for {nb(price)} kr per kvadratmeter i snitt i {quarter(lq)}, "
                                      f"{nb(abs(price / n - 1) * 100)} % {'lavere' if price < n else 'høyere'} enn snittet i landet. "
                                      + ", ".join(f"{name} {nb(v)} kr" for name, v in types if v is not None) + ".")
    fees = fee_lead(H)
    if fees:
        s = set_text(s, "fees-lead", fees)
    write(f, s)


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
        # «sok_tittel» in config/saker.json puts the words people search for in the title; the H1 stays «tittel».
        title = S.get("sok_tittel") or f'{S["tittel"]}: faktaark'
        write(SITE / f"{path}.html", page(tpl_sak, f'{title} · {BRAND}', S["ingress"], path,
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

    # One page per company the kommune owns, at selskaper/<id>. selskaper/index.html is the list, written by hand.
    selskaper = json.loads((SITE / "data/selskaper.json").read_text())
    tpl_sel = (SITE / "selskap.html").read_text()
    keep_sel = {"index.html"}
    forms = {"AS": "aksjeselskap", "IKS": "interkommunalt selskap", "KF": "kommunalt foretak", "SA": "samvirkeforetak",
             "GFS": "gjensidig forsikringsselskap"}
    for S in selskaper["selskaper"]:
        if not S.get("orgnr"):
            continue
        andel = S.get("eierandel")
        andel_txt = ("har andeler i" if andel is None else "eier hele" if andel == 100
                     else f"eier {str(andel).replace('.', ',')} % av")
        desc = (f"Narvik kommune {andel_txt} {S['navn']}, et {forms.get(S['form'], S['form'])}. Eierandel, bokført verdi "
                f"og selskapets regnskap med inntekter, resultat og egenkapital fra Brønnøysundregistrene.")
        body = (f'<header><nav class="crumbs" aria-label="Brødsmuler"><a href="selskaper/">Kommunalt eide selskaper</a>'
                f'<span aria-hidden="true">›</span><span aria-current="page">{esc(S["navn"])}</span></nav>'
                f'<h1>{esc(S["navn"])}</h1><p class="lead">{esc(desc)}</p></header>')
        path = f'selskaper/{S["id"]}'
        write(SITE / f"{path}.html", page(tpl_sel, f'{S["navn"]}: eierandel og regnskap · {BRAND}', desc, path,
                                          f'data-selskap="{esc(S["id"])}"', body))
        keep_sel.add(f'{S["id"]}.html')
        urls.append(path)

    # A case, area or company that is gone should not leave its page behind.
    for folder, names in (("sak", keep), ("utgifter", keep_omr), ("selskaper", keep_sel)):
        for f in (SITE / folder).glob("*.html"):
            if f.name not in names:
                f.unlink()

    prerender()

    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    write(SITE / "sitemap.xml", sitemap)
    print(f"Skrev {len(keep)} saker, {len(keep_omr)} tjenesteområder, {len(keep_sel) - 1} selskaper og sitemap.xml med {len(urls)} adresser.")


if __name__ == "__main__":
    main()
