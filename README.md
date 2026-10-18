# Åpen økonomi i Narvik

Hvor går pengene i Narvik kommune? En enkel nettside som viser kommunens netto driftsutgifter fordelt på tjenester, år for år, og sammenlignet med lignende kommuner.

Regnskapstallene kommer fra SSBs KOSTRA-statistikk, [tabell 12362](https://www.ssb.no/statbank/table/12362), og viser hva kommunen faktisk brukte. Trykker du på et tjenesteområde, kommer du til områdesiden (`omrade.html`). Der kan du gå ned i tre nivåer: området, en tjeneste i det, og en kostnads- eller inntektstype i tjenesten, helt ned til SSBs enkelte arter i [tabell 12367](https://www.ssb.no/statbank/table/12367). Hvert nivå har sin egen adresse, for eksempel `omrade.html?omrade=helse&tjeneste=253&art=lonn&aar=2025`, så det kan deles.

Narvik sammenlignes med seks andre: snittet i Narviks KOSTRA-gruppe (gruppe 9, kommuner med 20 000 til 29 999 innbyggere), landet uten Oslo, Nordland, og Harstad, Rana og Alta, som er i samme gruppe. Alt er netto driftsutgifter per innbygger fra samme tabell. Forsiden viser forskjellen område for område mot én av dem (`?mot=harstad`), og hver områdeside, tjenesteside og kostnadstypeside viser alle seks (`omrade.html?omrade=helse&tjeneste=hjemmetjenester#sammenligning`). På kostnadstypenivå (for eksempel lønn i hjemmetjenester) finnes ikke SSBs eget beløp per innbygger, så beløpene fra tabell 12367 deles på folketallet og merkes som beregnet. De ligger i `site/data/sammenligning.json`, som `scripts/fetch_details.py` skriver. Hvilke kommuner som er i gruppen hentes fra SSBs klassifikasjon [KLASS 112](https://www.ssb.no/klass/klassifikasjoner/112). Listen over sammenligninger står i `COMPARE` i `scripts/fetch_data.py`.

For grunnskole, barnehage og barnevern kan sammenligningen også vises per bruker eller per innbygger i aldersgruppen: per elev, per innbygger 6–15 år, per barn i kommunal barnehage, per innbygger 1–5 år, per barn med tiltak i barnevernet og så videre (`omrade.html?omrade=skole&maal=elev#sammenligning`). Det tar hensyn til at kommunene har ulikt mange barn. Tallene er SSBs egne nøkkeltall fra tabell [12235](https://www.ssb.no/statbank/table/12235), [12255](https://www.ssb.no/statbank/table/12255), [12379](https://www.ssb.no/statbank/table/12379), [13502](https://www.ssb.no/statbank/table/13502) og [12279](https://www.ssb.no/statbank/table/12279), ikke beregnet her. Flere av dem er brutto eller korrigert brutto, altså kostnaden før inntektene er trukket fra, og det står ved tallet. `scripts/fetch_malgruppe.py` henter dem til `site/data/malgruppe.json`, og `MEASURES` i skriptet sier hvilket nøkkeltall som hører til hvilket område og hvilken tjeneste.

Siden *Budsjett mot regnskap* (`budsjett.html`) viser kommunens vedtatte budsjett ved siden av regnskapet, og det nyeste budsjettet mot året før. Den nås fra toppmenyen, og fra regnskapssiden for år som har både budsjett og regnskap (`budsjett.html?aar=2024`). Tallene kommer fra bevilgningsoversikten for drift (1B) i kommunens budsjettdokumenter på [Framsikt](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/), fordelt på Narviks egne tjenesteområder.

Siden *Året så langt* (`lopende.html`) følger budsjettet og forbruket i inneværende år: brukt hittil, avvik og kommunedirektørens prognose per tjenesteområde, hvordan rammene er endret siden vedtaket, og inntektene. Tallene kommer fra tertialrapportene, som bare finnes som PDF og er skrevet inn i `config/lopende_2026.json` med side. I tillegg vises skatteinngangen måned for måned fra SSBs [tabell 07022](https://www.ssb.no/statbank/table/07022), som oppdateres automatisk.

## Slik er det bygget

```
config/categories.json    KOSTRA-funksjoner gruppert i 15 tjenesteområder
scripts/fetch_data.py     henter tall fra SSB og skriver site/data/narvik.json
scripts/fetch_details.py  henter utgifts- og inntektsarter per funksjon fra SSB og skriver site/data/detaljer.json
scripts/fetch_budget.py   henter budsjett og regnskap per tjenesteområde fra Framsikt og skriver site/data/budsjett.json
scripts/fetch_malgruppe.py henter SSBs nøkkeltall per elev, per barn og per innbygger i aldersgruppen og skriver site/data/malgruppe.json
scripts/fetch_lopende.py  sjekker tertialtallene i config/lopende_2026.json, henter skatteinngang fra SSB 07022
                          og skriver site/data/lopende.json
site/                     den statiske nettsiden: index.html (regnskap), omrade.html (ett område, en tjeneste,
                          en kostnadstype), budsjett.html (budsjett mot regnskap), lopende.html (året så langt); style.css og common.js er felles
.github/workflows/        oppdaterer data fra SSB og publiserer til GitHub Pages
```

Ingen server, database eller byggesteg. Skriptet bruker bare Pythons standardbibliotek.

## Kjøre lokalt

```sh
python scripts/fetch_data.py          # henter ferske tall fra SSB
python scripts/fetch_details.py       # henter utgifts- og inntektsarter fra SSB
python scripts/fetch_budget.py        # henter budsjettall fra Framsikt
python scripts/fetch_malgruppe.py     # utgifter per elev, per barn og per innbygger i aldersgruppen
python scripts/fetch_lopende.py       # tertialtall og månedlig skatteinngang for året så langt
python -m http.server -d site 8000    # åpne http://localhost:8000
```

Siden må åpnes via en webserver, siden den leser `data/narvik.json` med `fetch`.

## Kategoriene

SSB rapporterer rundt 80 KOSTRA-funksjoner (for eksempel 202 Grunnskole og 253 Helse- og omsorgstjenester i institusjon). `config/categories.json` samler dem i tjenesteområder folk kjenner igjen. Hver funksjon hører til nøyaktig én kategori, slik at summen alltid blir riktig.

En kategori kan ha `services`: tjenester med vanlige navn, som hver samler én eller flere funksjoner (for eksempel Hjemmetjenester = 254, 257 og 258). Det er de som listes på områdesiden. Funksjoner som ikke står i en tjeneste, vises med SSBs navn.

Hvis SSB innfører en ny funksjonskode, avslutter skriptet med en advarsel som navngir koden. Legg den til i riktig kategori og kjør skriptet på nytt.

## Hva pengene går til

`scripts/fetch_details.py` henter SSBs [tabell 12367](https://www.ssb.no/statbank/table/12367) for Narvik: hver KOSTRA-funksjon delt på arter, både for hele kommunen (konsern, omfang A, samme omfang som resten av siden) og for kommunekassen (omfang B, uten Narvik Havn KF og Narvik Vann KF). Hvert tall i `site/data/detaljer.json` er én celle i tabellen, adressert med omfang, funksjon, art og år, og siden lenker til SSB-spørringen som gir de samme tallene.

`GROUPS` i skriptet sier hvilke arter som legges sammen. Netto (AGD2) er utgiftsgruppene minus inntektsgruppene:

| Gruppe | Arter |
|---|---|
| Lønn, pensjon og arbeidsgiveravgift | AG16 + A710 (lønn før sykelønnsrefusjon), herav A090 pensjon og A099 arbeidsgiveravgift |
| Varer og tjenester til egen drift | AGD50, herav A260 og A270 |
| Tjenester kjøpt i stedet for å lage dem selv | AGD51, herav AG2, A370 og AG3 |
| Overføringer og tilskudd ut | AG34, herav AG4, A470 og AG52 |
| Merverdiavgift, avskrivninger, fordelte utgifter | A429, A590, AGD59 |
| Brukerbetalinger, salg og leie | A600, AGD34 |
| Refusjoner | AG48, herav A710 sykelønnsrefusjon, AG9, AD770 og AGD53 |
| Mva-kompensasjon | AD729 |
| Tilskudd og overføringer inn | AGD49, herav A890, AGD54 og AGD56 |

Det SSBs underarter ikke dekker av gruppen, og forskjellen mellom artene og AGD2, vises som egne linjer merket «beregnet». I kommunekassen går artene opp i AGD2 for alle funksjoner og år. I konsernet gjør de ikke det for funksjon 338 og 339 (alle år) og 110 (2025). Skriptet skriver disse avvikene ut, og feiler hvis kommunekassen ikke går opp eller konsernets netto avviker fra `narvik.json`.

## Budsjettet

`scripts/fetch_budget.py` leser tabellen «Bevilgningsoversikt drift etter § 5-4 andre ledd» (1B) fra to publikasjoner på Framsikt. Hver serie i `site/data/budsjett.json` sier hvilken publikasjon, datafil og kolonne tallene kommer fra, og siden viser det samme under tabellene.

| Serie | Kilde | Kolonne |
|---|---|---|
| Regnskap 2023, opprinnelig budsjett 2024, vedtatt budsjett 2025 | [Økonomiplan 2025–2028, kommunestyrets vedtak](https://pub.framsikt.net/2025/narvik/bm-2025-budsjettvedtak_2025/) | Regnskap 2023, Oppr. budsjett 2024, Øk.plan 2025 |
| Regnskap 2024, forslag 2026, økonomiplan 2027–2029 | [Budsjett 2026 og økonomiplan 2026–2029, kommunedirektørens forslag](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/) ([PDF](https://www.narvik.kommune.no/_f/p1/i3c0f427e-5acf-4d5c-836a-5db986e5cdcb/narvik-kommunes-okonomiplan-2026-2029-1.pdf), s. 93) | Regnskap 2024, Øk.plan 2026–2029 |
| Vedtatt budsjett 2026 | [Tertialrapport 2/2026](https://prod02.elementscloud.no/publikum/Documents/ShowDocument/c1d7f777-8235-4817-8203-ebd49ff36bb5/783/2230), formannskapet 15.10.2026, s. 46. Skrevet inn for hånd i `config/budsjett_manuelt.json` | Oppr. bud. 2026 |

Når en ny publikasjon kommer på Framsikt (for eksempel budsjettvedtaket for 2027, som også har regnskapet for 2025), legg den til i `SOURCES` og kolonnene i `SERIES`, og kjør skriptet på nytt. Tall som bare finnes i PDF skrives inn i `config/budsjett_manuelt.json` med side, og skriptet sjekker at områdene summerer til totalen. Siden velger selv det siste året som har både budsjett og regnskap, og det nyeste budsjettåret (vedtatt hvis det finnes, ellers forslaget) mot året før. Mangler `budsjett.json`, viser budsjettsiden en feilmelding, og regnskapssiden lenker ikke til den.

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

## Når en ny tertialrapport kommer

Legg rapporten til i `reports` i `config/lopende_2026.json`, med tabellene «Totaloversikt drift – fordelt på rammeområder» og «Sentrale inntekter» skrevet av slik de står, og sidetallene. Kjør `python scripts/fetch_lopende.py`. Skriptet sjekker at hvert avvik er budsjett minus regnskap og at radene summerer til totalen, og siden viser den nyeste rapporten. For et nytt år lages en ny fil, og `CONFIG` i skriptet pekes til den.
