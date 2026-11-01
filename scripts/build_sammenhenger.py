#!/usr/bin/env python3
"""Write site/data/sammenhenger.json: numbers on one page that can affect numbers on another.

Each link names two areas of the site, says in one neutral sentence how the one can affect the other,
and shows a few numbers for each side: Narvik next to Harstad, Rana, Alta and an average. A number is
marked when Narvik differs clearly from the average it is compared with, so the reader sees where Narvik
stands out. The sentences say what can affect what, never why Narvik's numbers are as they are.

Nothing is fetched. Every number is read from the data files the other scripts write, so it is the same
number, with the same source, as on the page it comes from. Run it after them:

    python scripts/build_sammenhenger.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
OUT = DATA / "sammenhenger.json"

# Narvik is marked as standing out when it is this far from the average it is compared with: as a share of
# that average for levels, in percentage points for changes.
LEVEL = 0.15
POINTS = 2.0

REGIONS = {"narvik": "Narvik", "harstad": "Harstad", "rana": "Rana", "alta": "Alta",
           "gruppe": "KOSTRA-gruppe 9", "landet": "Landet uten Oslo", "nordland": "Nordland", "norge": "Hele landet"}

MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]

# The pages a link can stand on: key → (name, address).
PAGES = {
    "utgifter": ("Utgifter", "okonomi"),
    "inntekter": ("Inntekter", "inntekter"),
    "gjeld": ("Gjeld og investeringer", "gjeld"),
    "budsjett": ("Budsjett", "budsjett"),
    "tiltak": ("Innsparinger", "tiltak"),
    "lopende": ("Året så langt", "lopende"),
    "befolkning": ("Befolkning", "befolkning"),
    "bolig": ("Bolig", "bolig"),
    "omrade:helse": ("Helse og omsorg", "utgifter/helse"),
    "omrade:skole": ("Grunnskole", "utgifter/skole"),
    "omrade:bolig": ("Kommunale boliger", "utgifter/bolig"),
    "omrade:sosial": ("Sosialtjenester og NAV", "utgifter/sosial"),
    "arbeid": ("Arbeid", "arbeid"),
}


def load(name: str) -> dict:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def measure(name, year, values, *, unit, against, kind="level", decimals=0, source, computed=False):
    """One number for Narvik and the comparison, and how far Narvik is from the average in against."""
    values = {k: v for k, v in values.items() if v is not None}
    me, ref = values.get("narvik"), values.get(against)
    diff = None
    if me is not None and ref is not None:
        if kind == "change":
            diff = {"points": round(me - ref, 1), "out": abs(me - ref) >= POINTS}
        elif ref > 0 and me >= 0:
            rel = me / ref - 1
            diff = {"share": round(rel * 100), "out": abs(rel) >= LEVEL}
            if unit == "%":
                diff["points"] = round(me - ref, 1)
    return {"navn": name, "aar": year, "enhet": unit, "desimaler": decimals, "verdier": values,
            "mot": against, "avvik": diff, "beregnet": computed, "kilde": source}


def nb(n: int) -> str:
    return f"{n:,}".replace(",", "\u00a0")


def ssb(table: str, what: str = "") -> dict:
    return {"tekst": f"SSB, tabell {table}{', ' + what if what else ''}", "url": f"https://www.ssb.no/statbank/table/{table}"}


def main() -> int:
    try:
        N, B, F, H, M, A = (load(n) for n in ("narvik", "befolkning", "finans", "bolig", "malgruppe", "arbeid"))
    except FileNotFoundError as e:
        print(f"Mangler datafil: {e.filename}. Kjør de andre skriptene først.", file=sys.stderr)
        return 1

    y = N["years"][-1]
    fy = F["years"][-1]
    cats = {c["key"]: c for c in N["categories"]}
    kostra = ["narvik", "harstad", "rana", "alta", "gruppe", "landet"]

    def area_pc(key, year=None):
        return {k: cats[key]["per_capita"].get(k, {}).get(year or y) for k in kostra}

    def target(area, service, key):
        m = next(m for m in M["measures"] if (m["area"], m["service"], m["key"]) == (area, service, key))
        return {k: (round(v[y]) if v.get(y) is not None else None) for k, v in m["values"].items() if k in kostra}

    cmp = {r["key"]: r for r in B["compare"]["rows"]}
    by = B["compare"]["year"]

    def pop(field):
        return {k: cmp[k][field] for k in kostra if k in cmp}

    def fin(table, art, year=None):
        part = F["per_capita"] if table == "12137" else F["share"]
        return {k: part.get(k, {}).get(art, {}).get(year or fy) for k in kostra}

    older = B["older"]
    projected = max(k for k in older if int(k) <= 2040)

    links = [
        {
            "id": "eldre-helse",
            "fra": "befolkning", "til": ["omrade:helse", "utgifter", "budsjett", "tiltak"],
            "tittel": "Antall eldre og utgiftene til helse og omsorg",
            "tekst": "Sykehjem og hjemmetjenester brukes mest av de eldste, så hvor mange eldre det er, kan påvirke hva helse og omsorg koster.",
            "maal": [
                measure("Andel av innbyggerne som er 80 år eller eldre", by, pop("over80"), unit="%", decimals=1, against="gruppe", source=ssb("07459")),
                measure("Kommunens netto utgifter til helse og omsorg per innbygger", y, area_pc("helse"), unit="kr", against="gruppe", source=ssb("12362")),
                measure("Kommunens netto utgifter til helse og omsorg per innbygger 80 år og over", y, target("helse", None, "80"), unit="kr", against="gruppe",
                        source=ssb("12362", "delt på innbyggere 80+ fra tabell 07459"), computed=True),
            ],
            "merknad": f"SSB anslår at Narvik har {nb(older[projected]['80'])} innbyggere 80 år og over i {projected}, mot {nb(older[B['last']]['80'])} i {B['last']} (tabell 14746, hovedalternativet).",
        },
        {
            "id": "barn-skole",
            "fra": "befolkning", "til": ["omrade:skole", "utgifter"],
            "tittel": "Antall barn og utgiftene til grunnskole",
            "tekst": "Grunnskolen er for barn fra 6 til 15 år, så hvor mange barn det er, kan påvirke hva skolen koster per innbygger.",
            "maal": [
                measure("Andel av innbyggerne som er under 16 år", by, pop("under16"), unit="%", decimals=1, against="gruppe", source=ssb("07459")),
                measure("Kommunens netto utgifter til grunnskole per innbygger", y, area_pc("skole"), unit="kr", against="gruppe", source=ssb("12362")),
                measure("Kommunens netto utgifter til grunnskole per innbygger 6–15 år", y, target("skole", None, "innb"), unit="kr", against="gruppe", source=ssb("12255")),
            ],
        },
        {
            "id": "folketall-inntekter",
            "fra": "befolkning", "til": ["inntekter", "budsjett"],
            "tittel": "Folketallet og inntektene",
            "tekst": "Skatt og rammetilskudd følger i stor grad antall innbyggere, så endringer i folketallet kan påvirke hvor mye kommunen får inn.",
            "maal": [
                measure(f"Endring i antall innbyggere fra {B['compare']['first']} til {by}", by, pop("change"), unit="%", decimals=1, kind="change", against="gruppe", source=ssb("07459")),
                measure("Kommunens frie inntekter (skatt og rammetilskudd) per innbygger", fy, fin("12137", "AG11"), unit="kr", against="gruppe", source=ssb("12137")),
                measure("Rammetilskudd fra staten per innbygger", fy, fin("12137", "A800"), unit="kr", against="gruppe", source=ssb("12137")),
            ],
        },
        {
            "id": "gjeld-drift",
            "fra": "gjeld", "til": ["utgifter", "budsjett", "lopende", "tiltak"],
            "tittel": "Gjelden og pengene til tjenester",
            "tekst": "Renter og avdrag betales fra driften, så gjelden kan påvirke hvor mye som er igjen til tjenester.",
            "maal": [
                measure("Kommunens netto lånegjeld per innbygger", fy, fin("12137", "KG31"), unit="kr", against="gruppe", source=ssb("12137")),
                measure("Renter og avdrag minus utbytte og andre finansinntekter (netto finansutgifter), andel av kommunens driftsinntekter", fy, fin("12143", "AGD86"), unit="%", decimals=1, against="gruppe", source=ssb("12143")),
                measure("Gjeld der renteendringer slår inn, andel av kommunens driftsinntekter", fy, fin("12143", "KG39"), unit="%", decimals=1, against="gruppe", source=ssb("12143")),
            ],
        },
        {
            "id": "fond-aaret",
            "fra": "inntekter", "til": ["lopende", "budsjett"],
            "tittel": "Disposisjonsfondet og året så langt",
            "tekst": "Disposisjonsfondet er sparepenger kommunen kan bruke når utgiftene blir høyere eller inntektene lavere enn budsjettert, så størrelsen kan påvirke hvor stort underskudd kommunen kan dekke selv.",
            "maal": [
                measure("Kommunens disposisjonsfond (sparepenger), andel av driftsinntektene", fy, fin("12143", "56"), unit="%", decimals=1, against="gruppe", source=ssb("12143")),
                measure("Kommunens netto driftsresultat (overskudd), andel av driftsinntektene", fy, fin("12143", "AGD23"), unit="%", decimals=1, kind="change", against="gruppe", source=ssb("12143")),
            ],
        },
    ]

    # Housing: SSB's own comparison regions differ by table, so each number names its own average.
    hreg = {r["key"]: r for r in H["regions"]}
    hy = sorted(H["built"]["narvik"])
    span = hy[-5:]

    def built(k):
        p = hreg.get(k, {}).get("population", {}).get(hy[-1])
        if k not in H["built"] or not p:
            return None
        return round(sum(H["built"][k].get(t, {}).get("Fullforte") or 0 for t in span) / p * 1000, 1)

    hk = ["narvik", "harstad", "rana", "alta", "nordland"]
    mun_y = max(H["municipal"]["narvik"])
    mun = {k: H["municipal"][k].get(mun_y) for k in kostra if k in H["municipal"]}
    blokk = {k: H["shares"][k].get("04") for k in hk if k in H["shares"]}
    hh = {r["key"]: r for r in B["households"]["rows"]}
    links += [
        {
            "id": "boliger-folketall",
            "fra": "bolig", "til": ["befolkning"],
            "tittel": "Nye boliger og folketallet",
            "tekst": "Nye boliger gir plass til flere husholdninger, så hvor mye som bygges, kan påvirke hvor mange som kan flytte til eller bli boende.",
            "maal": [
                measure(f"Nye boliger fullført {span[0]}–{span[-1]}, per 1000 innbyggere", span[-1], {k: built(k) for k in hk}, unit="", decimals=1,
                        against="nordland", source=ssb("05940", "delt på folketallet"), computed=True),
                measure(f"Endring i antall innbyggere fra {B['compare']['first']} til {by}", by, pop("change"), unit="%", decimals=1, kind="change", against="gruppe", source=ssb("07459")),
            ],
        },
        {
            "id": "husholdninger-boliger",
            "fra": "befolkning", "til": ["bolig"],
            "tittel": "Husholdningene og boligene",
            "tekst": "Hvem folk bor sammen med, kan påvirke hvilke boliger det er behov for, for eksempel små leiligheter for dem som bor alene.",
            "maal": [
                measure("Andel av husholdningene der én person bor alene", B["households"]["year"],
                        {"narvik": hh["alene"]["share"], "landet": hh["alene"]["landet"]}, unit="%", decimals=1, against="landet", source=ssb("06070")),
                measure("Andel av alle boliger som ligger i boligblokk", H["year"], blokk, unit="%", against="nordland", source=ssb("12941")),
            ],
        },
        {
            "id": "kommunale-boliger",
            "fra": "bolig", "til": ["omrade:bolig", "utgifter"],
            "tittel": "Kommunale boliger og hva de koster",
            "tekst": "Hvor mange boliger kommunen disponerer, og om den eier dem eller leier dem inn, kan påvirke hva boligtjenesten koster.",
            "maal": [
                measure("Kommunale boliger, eid eller leid inn av kommunen, per 1000 innbyggere", mun_y, {k: v.get("per_1000") for k, v in mun.items()}, unit="", against="gruppe", source=ssb("12008")),
                measure("Andel av de kommunale boligene som kommunen leier inn fra andre", mun_y, {k: round(v["rented_in"] / v["total"] * 100) for k, v in mun.items() if v.get("total")},
                        unit="%", against="gruppe", source=ssb("12008", "regnet ut her"), computed=True),
                measure("Kommunens netto utgifter til kommunale boliger per innbygger", y, area_pc("bolig"), unit="kr", against="gruppe", source=ssb("12362")),
            ],
        },
    ]

    # Work: SSB's register figures and Nav's monthly unemployment, compared with the whole country.
    ak = ["narvik", "harstad", "rana", "alta", "nordland", "norge"]
    ey = max(A["employment"]["narvik"])
    sy = max(A["status"]["narvik"])
    month = max(A["nav"]["ledige"]["narvik"])

    def status_share(code):
        out = {}
        for k in ak:
            st = A["status"].get(k, {}).get(sy, {})
            if st.get("20-66|TOT"):
                out[k] = round(st[f"20-66|{code}"] / st["20-66|TOT"] * 100, 1)
        return out

    links += [
        {
            "id": "arbeid-skatt",
            "fra": "arbeid", "til": ["inntekter", "budsjett"],
            "tittel": "Sysselsettingen og skatteinntektene",
            "tekst": "Kommunen får skatt fra inntekten til dem som bor der, så hvor mange som er i arbeid, kan påvirke skatteinntektene.",
            "maal": [
                measure("Andel av innbyggerne 15–74 år som er i arbeid", ey, {k: A["employment"].get(k, {}).get(ey, {}).get("15-74|0") for k in ak},
                        unit="%", decimals=1, against="norge", source=ssb("06445")),
                measure("Skatt på inntekt og formue kommunen får inn, per innbygger", fy, fin("12137", "AG12"), unit="kr", against="gruppe", source=ssb("12137")),
            ],
        },
    ]

    # «Skiller seg ut»: each page lists its own numbers where Narvik differs clearly from the average. A number
    # belongs to the page it is shown on; the links above borrow them. Utgifter also gets every service area. The area pages
    # already compare their own numbers, so they get no list.
    home = {
        "Andel av innbyggerne som er": ["befolkning"], "Endring i antall innbyggere": ["befolkning"], "Andel av husholdningene": ["befolkning"],
        "Kommunens frie inntekter": ["inntekter"], "Rammetilskudd": ["inntekter"], "Kommunens disposisjonsfond": ["inntekter"],
        "Kommunens netto driftsresultat": ["inntekter"], "Kommunens driftsinntekter": ["inntekter"], "Eiendomsskatt": ["inntekter"], "Skatt på inntekt": ["inntekter"],
        "Kommunens netto lånegjeld": ["gjeld"], "Renter og avdrag": ["gjeld"], "Gjeld der renteendringer": ["gjeld"],
        "Nye boliger": ["bolig"], "Andel av alle boliger": ["bolig"], "Kommunale boliger,": ["bolig"], "Andel av de kommunale boligene": ["bolig"],
        "Andel av innbyggerne 15–74": ["arbeid"], "Helt ledige": ["arbeid"], "Andel av innbyggerne 20–66": ["arbeid"],
    }
    # Utgifter, Inntekter and Gjeld have a year selector, and SSB has their numbers for every year, so their
    # list is made for each year and follows the year the reader picks.
    FIN = [
        ("inntekter", "12137", "AG11", "Kommunens frie inntekter (skatt og rammetilskudd) per innbygger", "level"),
        ("inntekter", "12137", "A800", "Rammetilskudd fra staten per innbygger", "level"),
        ("inntekter", "12137", "AG12", "Skatt på inntekt og formue kommunen får inn, per innbygger", "level"),
        ("inntekter", "12137", "AGD13", "Kommunens driftsinntekter per innbygger", "level"),
        ("inntekter", "12137", "AG10", "Eiendomsskatt kommunen får inn, per innbygger", "level"),
        ("inntekter", "12143", "56", "Kommunens disposisjonsfond (sparepenger), andel av driftsinntektene", "level"),
        ("inntekter", "12143", "AGD23", "Kommunens netto driftsresultat (overskudd), andel av driftsinntektene", "change"),
        ("gjeld", "12137", "KG31", "Kommunens netto lånegjeld per innbygger", "level"),
        ("gjeld", "12143", "AGD86", "Renter og avdrag minus utbytte og andre finansinntekter (netto finansutgifter), andel av kommunens driftsinntekter", "level"),
        ("gjeld", "12143", "KG39", "Gjeld der renteendringer slår inn, andel av kommunens driftsinntekter", "level"),
        ("gjeld", "12137", "40", "Kommunens pensjonsforpliktelser til ansatte, per innbygger", "level"),
    ]

    def yearly(year):
        out = []
        if year in N["years"]:
            for key, c in cats.items():
                if key in ("pensjon", "annet"):
                    continue
                out.append(measure(f"Kommunens netto utgifter til {c['name'][0].lower() + c['name'][1:]} per innbygger", year, area_pc(key, year),
                                   unit="kr", against="gruppe", source=ssb("12362")))
                out[-1]["sider"] = ["utgifter"]
        if year in F["years"]:
            for side, table, art, label, kind in FIN:
                pct = table == "12143"
                out.append(measure(label, year, fin(table, art, year), unit="%" if pct else "kr", decimals=1 if pct else 0, kind=kind,
                                   against="gruppe", source=ssb(table)))
                out[-1]["sider"] = [side]
        return out

    def collect(pool):
        found: dict = {}
        for m in pool:
            sides = m.get("sider") or next((v for k, v in home.items() if m["navn"].startswith(k)), [])
            if not (m["avvik"] or {}).get("out"):
                continue
            for side in sides:
                if all(x["navn"] != m["navn"] for x in found.setdefault(side, [])):
                    found[side].append({k: v for k, v in m.items() if k != "sider"})
        size = lambda m: abs(m["avvik"].get("share") if m["avvik"].get("share") is not None else m["avvik"]["points"] * 10)
        for side in found:
            found[side].sort(key=size, reverse=True)
        return found

    extra = [
        measure("Helt ledige registrert hos Nav, andel av arbeidsstyrken", f"{MONTHS[int(month[5:]) - 1]} {month[:4]}",
                {k: A["nav"]["ledige"].get(k, {}).get(month, {}).get("pct") for k in ak}, unit="%", decimals=1, against="norge",
                source={"tekst": "Nav, tabell HL060 helt ledige", "url": "https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige"}),
        measure("Andel av innbyggerne 20–66 år som får arbeidsavklaringspenger eller uføretrygd", sy, status_share("U.04-U.05"), unit="%",
                decimals=1, against="norge", source=ssb("13563", "regnet ut her"), computed=True),
    ]
    for m in extra:
        m["sider"] = ["arbeid"]
    yearly_sides = {"utgifter", "inntekter", "gjeld"}
    link_measures = [m for link in links for m in link["maal"]
                     if not set(next((v for k, v in home.items() if m["navn"].startswith(k)), [])) & yearly_sides]
    standout = collect(link_measures + yearly(y) + ([] if fy == y else yearly(fy)) + extra)
    by_year = {side: {} for side in yearly_sides}
    for year in sorted(set(N["years"]) | set(F["years"])):
        for side, items in collect(yearly(year)).items():
            by_year[side][year] = items
    for link in links:
        for m in link["maal"]:
            m.pop("sider", None)

    for link in links:
        link["skiller_seg_ut"] = any((m["avvik"] or {}).get("out") for m in link["maal"])
        for side in [link["fra"], *link["til"]]:
            if side not in PAGES:
                print(f"Ukjent side «{side}» i {link['id']}", file=sys.stderr)
                return 1

    out = {
        "generated": N["generated"],
        "regioner": REGIONS,
        "sider": {k: {"navn": n, "href": h} for k, (n, h) in PAGES.items()},
        "grense": {"niva_prosent": round(LEVEL * 100), "endring_poeng": POINTS},
        "lenker": links,
        "skiller_seg_ut": standout,
        "skiller_seg_ut_aar": by_year,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Skrev {OUT.relative_to(ROOT)}: {len(links)} sammenhenger, {sum(l['skiller_seg_ut'] for l in links)} der Narvik skiller seg ut.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
