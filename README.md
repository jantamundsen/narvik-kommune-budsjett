# Pengene i Narvik

Hvor går pengene i Narvik kommune? En enkel nettside som viser kommunens netto driftsutgifter fordelt på tjenester, år for år, og sammenlignet med landet og Nordland.

Regnskapstallene kommer fra SSBs KOSTRA-statistikk, [tabell 12362](https://www.ssb.no/statbank/table/12362), og viser hva kommunen faktisk brukte.

Budsjettdelen viser kommunens vedtatte budsjett ved siden av regnskapet, og forslaget til neste års budsjett. Tallene kommer fra bevilgningsoversikten for drift (1B) i kommunens budsjettdokumenter på [Framsikt](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/), fordelt på Narviks egne tjenesteområder.

## Slik er det bygget

```
config/categories.json    KOSTRA-funksjoner gruppert i 15 tjenesteområder
scripts/fetch_data.py     henter tall fra SSB og skriver site/data/narvik.json
scripts/fetch_budget.py   henter budsjett og regnskap per tjenesteområde fra Framsikt og skriver site/data/budsjett.json
site/                     den statiske nettsiden (HTML, CSS og ren JavaScript)
.github/workflows/        oppdaterer data fra SSB og publiserer til GitHub Pages
```

Ingen server, database eller byggesteg. Skriptet bruker bare Pythons standardbibliotek.

## Kjøre lokalt

```sh
python scripts/fetch_data.py          # henter ferske tall fra SSB
python scripts/fetch_budget.py        # henter budsjettall fra Framsikt
python -m http.server -d site 8000    # åpne http://localhost:8000
```

Siden må åpnes via en webserver, siden den leser `data/narvik.json` med `fetch`.

## Kategoriene

SSB rapporterer rundt 80 KOSTRA-funksjoner (for eksempel 202 Grunnskole og 253 Helse- og omsorgstjenester i institusjon). `config/categories.json` samler dem i tjenesteområder folk kjenner igjen. Hver funksjon hører til nøyaktig én kategori, slik at summen alltid blir riktig.

Hvis SSB innfører en ny funksjonskode, avslutter skriptet med en advarsel som navngir koden. Legg den til i riktig kategori og kjør skriptet på nytt.

## Budsjettet

`scripts/fetch_budget.py` leser tabellen «Bevilgningsoversikt drift etter § 5-4 andre ledd» (1B) fra to publikasjoner på Framsikt. Hver serie i `site/data/budsjett.json` sier hvilken publikasjon, datafil og kolonne tallene kommer fra, og siden viser det samme under tabellene.

| Serie | Kilde | Kolonne |
|---|---|---|
| Regnskap 2023, opprinnelig budsjett 2024, vedtatt budsjett 2025 | [Økonomiplan 2025–2028, kommunestyrets vedtak](https://pub.framsikt.net/2025/narvik/bm-2025-budsjettvedtak_2025/) | Regnskap 2023, Oppr. budsjett 2024, Øk.plan 2025 |
| Regnskap 2024, forslag 2026, økonomiplan 2027–2029 | [Budsjett 2026 og økonomiplan 2026–2029, kommunedirektørens forslag](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/) ([PDF](https://www.narvik.kommune.no/_f/p1/i3c0f427e-5acf-4d5c-836a-5db986e5cdcb/narvik-kommunes-okonomiplan-2026-2029-1.pdf), s. 93) | Regnskap 2024, Øk.plan 2026–2029 |
| Vedtatt budsjett 2026 | [Tertialrapport 2/2026](https://prod02.elementscloud.no/publikum/Documents/ShowDocument/c1d7f777-8235-4817-8203-ebd49ff36bb5/783/2230), formannskapet 15.10.2026, s. 46. Skrevet inn for hånd i `config/budsjett_manuelt.json` | Oppr. bud. 2026 |

Når en ny publikasjon kommer på Framsikt (for eksempel budsjettvedtaket for 2027, som også har regnskapet for 2025), legg den til i `SOURCES` og kolonnene i `SERIES`, og kjør skriptet på nytt. Tall som bare finnes i PDF skrives inn i `config/budsjett_manuelt.json` med side, og skriptet sjekker at områdene summerer til totalen. Siden velger selv det siste året som har både budsjett og regnskap, og det nyeste budsjettåret (vedtatt hvis det finnes, ellers forslaget) mot året før. Mangler `budsjett.json`, skjules budsjettdelen.

Budsjettet er det opprinnelige, slik kommunestyret vedtok det i desember året før. Rammene justeres i løpet av året, så avviket mot regnskapet er ikke det samme som et merforbruk.

## Begreper

- **Netto driftsutgifter** (art AGD2): kostnaden for en tjeneste minus inntektene som hører til den (gebyrer, refusjoner, øremerkede tilskudd). Det er det kommunen betaler med frie inntekter.
- **Per innbygger**: folketallet hentes ikke direkte, men beregnes fra SSBs beløp og beløp per innbygger.
- **Vann, avløp og renovasjon** og **pensjonsposter** trekker fra i netto og vises for seg.

## Publisering

1. Under *Settings → Pages*, velg *GitHub Actions* som kilde.
2. Arbeidsflyten *Publiser nettsiden* kjører ved hver endring i `site/`.
3. *Oppdater data fra SSB* kjører 1. april og 20. juni, etter SSBs KOSTRA-publiseringer, og kan også startes manuelt under *Actions*.

Laget som et åpent hobbyprosjekt, ikke av Narvik kommune.
