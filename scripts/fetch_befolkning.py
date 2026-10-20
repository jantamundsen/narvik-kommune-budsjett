#!/usr/bin/env python3
"""Fetch Narvik's population figures from SSB and write site/data/befolkning.json for befolkning.html.

Everything is SSB's own numbers, fetched per table, except what is marked «beregnet» on the page:
median age, men per 100 women aged 20–39 and the comparison regions that SSB does not publish
(Landet uten Oslo is Hele landet minus Oslo, and the KOSTRA group is the sum of its member kommuner from
narvik.json, with their numbers before the 2024 renumbering taken from KLASS), and the shares of children and
elderly per delområde, which are sums over the grunnkretser in it.

Tables:
    07459  population 1 January by sex and age (registered)
    14746  projected population by sex and age, main alternative (MMMM), from the newest projection
    06913  population change per year: born, died, moved in, moved out
    04317  population per grunnkrets; the first six digits of a grunnkrets is its delområde (names from KLASS 1)
    04362  age and sex per grunnkrets, in SSB's age groups
    09817  immigrants and Norwegian-born to immigrant parents, by country background
    06070  private households by type

Narvik got its current borders (code 1806) in 2020, so SSB has no figures for it before that.
Only the standard library is used, so it runs anywhere Python 3.9+ runs.

    python scripts/fetch_befolkning.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

from fetch_data import KLASS, KLASS_KOMMUNER, cells, fetch, labels

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "befolkning.json"
ACCOUNTS = ROOT / "site" / "data" / "narvik.json"
REGION = "1806"
FIRST = 2020
LAST_PROJECTED = 2050
NORWAY, OSLO, NORDLAND = "0", "0301", "18"
KLASS_GRUNNKRETS = "1"  # Delområder og grunnkretser

# Five-year groups for the pyramid, the last one open.
PYRAMID = [(a, a + 4) for a in range(0, 90, 5)] + [(90, None)]
# Household types in 06070, merged into the rows the page shows.
HOUSEHOLDS = [
    ("alene", "Bor alene", ["001"]),
    ("par", "Par uten hjemmeboende barn", ["002"]),
    ("parbarn", "Par med barn under 18", ["003", "004"]),
    ("enslig", "Mor eller far med barn under 18", ["005", "006"]),
    ("voksne", "Familie med voksne barn", ["007"]),
    ("fler", "Flere familier sammen", ["008", "009", "010"]),
]


def api(table: str) -> str:
    return f"https://data.ssb.no/api/pxwebapi/v2/tables/{table}/data"


def url(table: str, **codes: str) -> str:
    params = {"lang": "no", **{f"valueCodes[{k}]": v for k, v in codes.items()}}
    return api(table) + "?" + urllib.parse.urlencode(params, safe="[]*,()")


def source(table: str, query: str) -> dict:
    return {"table": table, "url": f"https://www.ssb.no/statbank/table/{table}", "query": query}


def get(query: str) -> dict:
    print(f"Henter {query}", file=sys.stderr)
    return fetch(query)


def age(code: str) -> int:
    return 105 if code == "105+" else int(code)


def by_age(people: dict, lo: int, hi: int | None) -> int:
    return sum(n for a, n in people.items() if a >= lo and (hi is None or a <= hi))


def median_age(people: dict) -> int:
    half, run = sum(people.values()) / 2, 0
    for a in sorted(people):
        run += people[a]
        if run >= half:
            return a
    return 0


def regions() -> tuple[list[dict], dict, dict]:
    """The comparison regions from narvik.json, which 07459 regions they are made of ((plus, minus) per key),
    and for the KOSTRA group the codes of each member kommune (its number now and before)."""
    acc = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    changes = fetch(f"{KLASS}/classifications/{KLASS_KOMMUNER}/changes?from={FIRST}-01-01&to={dt.date.today().isoformat()}")
    before = {}
    for ch in changes["codeChanges"]:
        if ch["oldCode"] != ch["newCode"]:
            before.setdefault(ch["newCode"], []).append(ch["oldCode"])
    members = [m["code"] for m in acc["kostra_group"]["members"]]
    rows = [{"key": "narvik", "name": "Narvik", "kind": "kommune"}]
    parts, groups = {"narvik": ([REGION], [])}, {}
    for r in acc["compare"]:
        rows.append({"key": r["key"], "name": r["name"], "kind": r["kind"]})
        if r["key"] == "landet":
            parts[r["key"]] = ([NORWAY], [OSLO])
        elif r["key"] == "nordland":
            parts[r["key"]] = ([NORDLAND], [])
        elif r["kind"] == "gruppe":
            units = [[m, *before.get(m, [])] for m in members]
            groups[r["key"]] = units
            parts[r["key"]] = ([c for u in units for c in u], [])
        else:
            parts[r["key"]] = ([r["code"], *r.get("earlier", [])], [])
    order = {"narvik": 0, "harstad": 1, "rana": 2, "alta": 3, "gruppe": 4, "nordland": 5, "landet": 6}
    rows.sort(key=lambda r: order.get(r["key"], 9))
    return rows, parts, groups


def population(sources: dict) -> tuple[dict, dict, dict]:
    """Narvik by year, sex and age (registered and projected), and the comparison table."""
    rows, parts, groups = regions()
    codes = list(dict.fromkeys(c for plus, minus in parts.values() for c in plus + minus))
    q = url("07459", Region=",".join(codes), Kjonn="1,2", Alder="*", ContentsCode="Personer1", Tid=f"from({FIRST})")
    people = {}  # (region, year, sex, age) -> persons
    for c, v in cells(get(q)):
        if v:
            k = (c["Region"], c["Tid"], c["Kjonn"], age(c["Alder"]))
            people[k] = people.get(k, 0) + v
    years = sorted({k[1] for k in people})
    last = years[-1]
    present = {(k[0], k[1]) for k in people}
    sources["07459"] = source("07459", url("07459", Region=REGION, Kjonn="1,2", Alder="*", ContentsCode="Personer1", Tid=f"from({FIRST})"))

    def ages(key: str, y: str, sex: str | None = None) -> dict:
        plus, minus = parts[key]
        out = {}
        for (r, t, s, a), n in people.items():
            if t == y and (sex is None or s == sex) and r in plus + minus:
                out[a] = out.get(a, 0) + (n if r in plus else -n)
        return out

    q = url("14746", Region=REGION, Kjonn="1,2", Alder="*", ContentsCode="Personer", Tid=f"from({int(last) + 1})")
    proj_ds = get(q)
    proj = {}
    for c, v in cells(proj_ds):
        if v and int(c["Tid"]) <= LAST_PROJECTED:
            k = (c["Tid"], c["Kjonn"], age(c["Alder"]))
            proj[k] = proj.get(k, 0) + v
    sources["14746"] = {**source("14746", q), "alternative": labels(proj_ds, "ContentsCode").get("Personer", "Hovedalternativet (MMMM)")}

    pyramid = {}
    for y in years + sorted({k[0] for k in proj}):
        projected = y > last
        row = {"projected": projected}
        for sex, key in (("2", "f"), ("1", "m")):
            p = {a: n for (t, s, a), n in proj.items() if t == y and s == sex} if projected else ages("narvik", y, sex)
            row[key] = [by_age(p, lo, hi) for lo, hi in PYRAMID]
        pyramid[y] = row

    compare = []
    for r in rows:
        now, then = ages(r["key"], last), ages(r["key"], str(FIRST))
        total, first = sum(now.values()), sum(then.values())
        men = by_age(ages(r["key"], last, "1"), 20, 39)
        women = by_age(ages(r["key"], last, "2"), 20, 39)
        # The change needs every kommune in the region in 07459 for the first year too, under its old number or its new one.
        units = groups.get(r["key"], [parts[r["key"]][0]])
        complete = all(any((c, str(FIRST)) in present for c in unit) for unit in units)
        compare.append({
            **r, "population": total,
            "change": round((total - first) / first * 100, 1) if first and complete else None,
            "median": median_age(now),
            "over80": round(by_age(now, 80, None) / total * 100, 1),
            "under16": round(by_age(now, 0, 15) / total * 100, 1),
            "men_per_100_women": round(men / women * 100) if women else None,
        })
    return pyramid, {"year": last, "rows": compare, "first": str(FIRST)}, {"years": years, "last": last}


def change(sources: dict) -> dict:
    q = url("06913", Region=REGION, ContentsCode="*", Tid=f"from({FIRST})")
    ds = get(q)
    sources["06913"] = source("06913", q)
    keys = {"Folkemengde": "population", "Levende": "born", "Dode": "died", "Innflyttinger": "moved_in",
            "Utflyttinger": "moved_out", "Folketilvekst": "growth"}
    out = {}
    for c, v in cells(ds):
        k = keys.get(c["ContentsCode"])
        if k and v is not None:
            out.setdefault(c["Tid"], {})[k] = v
    return out


def areas(sources: dict) -> dict:
    names = {c["code"]: c["name"] for c in fetch(f"{KLASS}/classifications/{KLASS_GRUNNKRETS}/codesAt?date={dt.date.today().isoformat()}")["codes"]
             if c["code"].startswith(REGION)}
    q = url("04317", Grunnkretser=f"{REGION}*", ContentsCode="*", Tid=f"from({FIRST})")
    ds = get(q)
    sources["04317"] = source("04317", q)
    pop = {}
    for c, v in cells(ds):
        if v is not None:
            pop.setdefault(c["Grunnkretser"], {})[c["Tid"]] = v
    years = sorted({y for p in pop.values() for y in p})
    first, last = years[0], years[-1]
    q = url("04362", Region=f"{REGION}*", Kjonn="1,2", Alder="*", ContentsCode="*", Tid=last)
    ds = get(q)
    sources["04362"] = source("04362", q)
    groups = {}  # grunnkrets -> {age group: persons}
    for c, v in cells(ds):
        if v:
            g = groups.setdefault(c["Region"], {})
            g[c["Alder"]] = g.get(c["Alder"], 0) + v
    young, old = ["00-05", "06-15"], ["67-69", "70-79", "080+"]

    out = {}
    for gk, p in pop.items():
        d = gk[:6]
        area = out.setdefault(d, {"code": d, "name": names.get(d + "00", "Uoppgitt delområde"), "pop": {}, "kretser": [], "_ages": {}})
        for y, n in p.items():
            area["pop"][y] = area["pop"].get(y, 0) + n
        area["kretser"].append({"code": gk, "name": names.get(gk, "Uoppgitt grunnkrets"), "pop": {first: p.get(first), last: p.get(last)}})
        for a, n in groups.get(gk, {}).items():
            area["_ages"][a] = area["_ages"].get(a, 0) + n
    rows, unknown = [], 0
    for a in out.values():
        ages = a.pop("_ages")
        total = sum(ages.values())
        a["under16"] = round(sum(ages.get(k, 0) for k in young) / total * 100, 1) if total else None
        a["over67"] = round(sum(ages.get(k, 0) for k in old) / total * 100, 1) if total else None
        a["kretser"].sort(key=lambda k: -(k["pop"].get(last) or 0))
        if a["code"].endswith("99"):
            unknown += a["pop"].get(last, 0)
        else:
            rows.append(a)
    rows.sort(key=lambda a: -a["pop"].get(last, 0))
    all_ages = {}
    for g in groups.values():
        for k, n in g.items():
            all_ages[k] = all_ages.get(k, 0) + n
    total = sum(all_ages.values())
    return {"first": first, "last": last, "rows": rows, "unknown": unknown,
            "total": {"pop": {y: sum(p.get(y, 0) for p in pop.values()) for y in (first, last)},
                      "under16": round(sum(all_ages.get(k, 0) for k in young) / total * 100, 1),
                      "over67": round(sum(all_ages.get(k, 0) for k in old) / total * 100, 1)}}


def immigrants(sources: dict) -> dict:
    q = url("09817", Region=f"{REGION},{NORWAY}", InnvandrKat="B-C,B,C", Landbakgrunn="999", ContentsCode="*", Tid=f"from({FIRST})")
    sources["09817"] = source("09817", q)
    raw = {}
    for c, v in cells(get(q)):
        raw[(c["Region"], c["InnvandrKat"], c["ContentsCode"], c["Tid"])] = v
    years = sorted({k[3] for k in raw})
    last = years[-1]
    series = {y: {"count": raw.get((REGION, "B-C", "Personer1", y)), "share": raw.get((REGION, "B-C", "AndelBefolkning", y)),
                  "landet": raw.get((NORWAY, "B-C", "AndelBefolkning", y))} for y in years}
    q = url("09817", Region=REGION, InnvandrKat="B-C", Landbakgrunn="*", ContentsCode="Personer1", Tid=f"{years[0]},{last}")
    ds = get(q)
    names = labels(ds, "Landbakgrunn")
    by = {}
    for c, v in cells(ds):
        if c["Landbakgrunn"].isdigit() and c["Landbakgrunn"] != "999":
            by.setdefault(c["Landbakgrunn"], {})[c["Tid"]] = v or 0
    top = sorted(by.items(), key=lambda kv: -kv[1].get(last, 0))[:8]
    return {"first": years[0], "last": last, "series": series,
            "immigrants": raw.get((REGION, "B", "Personer1", last)), "born_here": raw.get((REGION, "C", "Personer1", last)),
            "countries": [{"name": names.get(k, k), "now": v.get(last, 0), "then": v.get(years[0], 0)} for k, v in top],
            "countries_query": q}


def households(sources: dict) -> dict:
    q = url("06070", Region=f"{REGION},{NORWAY}", HushType="*", ContentsCode="*", Tid="top(1)")
    ds = get(q)
    sources["06070"] = source("06070", q)
    raw, year = {}, None
    for c, v in cells(ds):
        raw[(c["Region"], c["HushType"])] = v or 0
        year = c["Tid"]
    totals = {r: sum(v for (rr, _), v in raw.items() if rr == r) for r in (REGION, NORWAY)}
    rows = []
    for key, name, types in HOUSEHOLDS:
        n = sum(raw.get((REGION, t), 0) for t in types)
        rows.append({"key": key, "name": name, "count": n, "share": round(n / totals[REGION] * 100, 1),
                     "landet": round(sum(raw.get((NORWAY, t), 0) for t in types) / totals[NORWAY] * 100, 1)})
    return {"year": year, "total": totals[REGION], "rows": rows}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    sources = {}
    pyramid, compare, meta = population(sources)
    data = {
        "generated": dt.date.today().isoformat(),
        "region": REGION,
        "last": meta["last"],
        "groups": [f"{lo}–{hi}" if hi is not None else f"{lo}+" for lo, hi in PYRAMID],
        "pyramid": pyramid,
        "change": change(sources),
        "compare": compare,
        "areas": areas(sources),
        "immigrants": immigrants(sources),
        "households": households(sources),
        "sources": sources,
    }
    last = data["pyramid"][meta["last"]]
    print(f"Skrev {args.out.relative_to(ROOT)}: {sum(last['f']) + sum(last['m'])} innbyggere 1.1.{meta['last']}, "
          f"pyramide {min(pyramid)}–{max(pyramid)}, {len(data['areas']['rows'])} delområder", file=sys.stderr)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
