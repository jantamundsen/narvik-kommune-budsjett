# Åpne tall for Narvik

Tall og innsikt om Narvik kommune, med kilde for hvert tall. Siden har i dag to områder: *Økonomi* (hvor pengene går, budsjett, året så langt og innsparinger) og *Befolkning*. Under *Økonomi* viser den kommunens netto driftsutgifter fordelt på tjenester, år for år, og sammenlignet med lignende kommuner.

Regnskapstallene kommer fra SSBs KOSTRA-statistikk, [tabell 12362](https://www.ssb.no/statbank/table/12362), og viser hva kommunen faktisk brukte. Trykker du på et tjenesteområde, kommer du til områdesiden (`omrade.html`). Der kan du gå ned i tre nivåer: området, en tjeneste i det, og en kostnads- eller inntektstype i tjenesten, helt ned til SSBs enkelte arter i [tabell 12367](https://www.ssb.no/statbank/table/12367). Hvert nivå har sin egen adresse, for eksempel `omrade.html?omrade=helse&tjeneste=253&art=lonn&aar=2025`, så det kan deles.

Narvik sammenlignes med seks andre: snittet i Narviks KOSTRA-gruppe (gruppe 9, kommuner med 20 000 til 29 999 innbyggere), landet uten Oslo, Nordland, og Harstad, Rana og Alta, som er i samme gruppe. Alt er netto driftsutgifter per innbygger fra samme tabell. Forsiden viser forskjellen område for område mot én av dem (`?mot=harstad`), og hver områdeside, tjenesteside og kostnadstypeside viser alle seks (`omrade.html?omrade=helse&tjeneste=hjemmetjenester#sammenligning`). På kostnadstypenivå (for eksempel lønn i hjemmetjenester) finnes ikke SSBs eget beløp per innbygger, så beløpene fra tabell 12367 deles på folketallet og merkes som beregnet. De ligger i `site/data/sammenligning.json`, som `scripts/fetch_details.py` skriver. Hvilke kommuner som er i gruppen hentes fra SSBs klassifikasjon [KLASS 112](https://www.ssb.no/klass/klassifikasjoner/112). Listen over sammenligninger står i `COMPARE` i `scripts/fetch_data.py`.

For grunnskole, barnehage og barnevern kan sammenligningen også vises per bruker eller per innbygger i aldersgruppen: per innbygger 6–15 år, per barn i kommunal barnehage, per innbygger 1–5 år, per barn med tiltak i barnevernet og så videre (`omrade.html?omrade=skole&maal=innb#sammenligning`). Det tar hensyn til at kommunene har ulikt mange barn. Tallene er SSBs egne nøkkeltall fra tabell [12235](https://www.ssb.no/statbank/table/12235), [12255](https://www.ssb.no/statbank/table/12255), [12379](https://www.ssb.no/statbank/table/12379), [13502](https://www.ssb.no/statbank/table/13502) og [12279](https://www.ssb.no/statbank/table/12279), ikke beregnet her. Grunnskole sammenlignes ikke per elev, fordi elevtallet kommer fra skolenes egen rapportering og kostnaden per elev må korrigeres for kjøp fra og salg til andre kommuner; per innbygger 6–15 år er et tryggere grunnlag. Flere av dem er brutto eller korrigert brutto, altså kostnaden før inntektene er trukket fra, og det står ved tallet. `scripts/fetch_malgruppe.py` henter dem til `site/data/malgruppe.json`, og `MEASURES` i skriptet sier hvilket nøkkeltall som hører til hvilket område og hvilken tjeneste.

For helse og omsorg kan sammenligningen vises per innbygger 67 år og over og per innbygger 80 år og over (omsorgstjenestene samlet, hjemmetjenester, sykehjem og institusjon, lokaler til institusjoner, og 67 år og over for aktivitet og service for eldre), og per innbygger 0–20 år for helsestasjon og skolehelsetjeneste (`omrade.html?omrade=helse&maal=80#sammenligning`). SSB publiserer ikke disse som nøkkeltall lenger, så de er beregnet og merket «beregnet» på siden: netto driftsutgifter fra [12362](https://www.ssb.no/statbank/table/12362) delt på innbyggerne i aldersgruppen 1. januar året etter fra [07459](https://www.ssb.no/statbank/table/07459), som er datoen KOSTRA selv bruker. 07459 har ikke KOSTRA-grupper, så landet uten Oslo er hele landet minus Oslo, og KOSTRA-gruppen er summen av medlemskommunene (med gamle kommunenumre før 2024 fra KLASS). Skriptet varsler hvis summen av alle innbyggere avviker mer enn 0,5 % fra folketallet KOSTRA bruker. `AGE_MEASURES` i skriptet sier hvilke aldersgrupper som hører til hvilken tjeneste. Når «per innbygger 80 år og over» er valgt, står det under sammenligningen hvor mange innbyggere over 80 Narvik har i dag og hvor mange SSBs framskriving venter i 2040, med lenke til befolkningspyramiden (`befolkning.html?aar=2040#pyramide`). Tallene leses fra `site/data/befolkning.json`; siden regner ikke ut hva det vil koste.

Siden *Budsjett mot regnskap* (`budsjett.html`) viser kommunens vedtatte budsjett ved siden av regnskapet, og det nyeste budsjettet mot året før. Den nås fra toppmenyen, og fra regnskapssiden for år som har både budsjett og regnskap (`budsjett.html?aar=2024`). Tallene kommer fra bevilgningsoversikten for drift (1B) i kommunens budsjettdokumenter på [Framsikt](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/), fordelt på Narviks egne tjenesteområder.

Siden *Året så langt* (`lopende.html`) følger budsjettet og forbruket i inneværende år: brukt hittil, avvik og kommunedirektørens prognose per tjenesteområde, hvordan rammene er endret siden vedtaket, og inntektene. Tallene kommer fra tertialrapportene, som bare finnes som PDF og er skrevet inn i `config/lopende_2026.json` med side. I tillegg vises skatteinngangen måned for måned fra SSBs [tabell 07022](https://www.ssb.no/statbank/table/07022), som oppdateres automatisk.

Siden *Innsparinger* (`tiltak.html`) viser kuttene som ble lagt inn i budsjettet tiltak for tiltak, hvilke kommunestyret tok ut igjen i samme vedtak, og hva tertialrapporter og årsrapporter sier skjedde med dem. Den viser også hele endringen i rammen til hvert tjenesteområde, slik Framsikt forklarer den.

*Bak tallene* forklarer tallene med det kommunens egne rapporter sier: sykefravær, utgifter til vikarbyrå og overtid, investeringer som skolegårder, og kommunens egne forklaringer på avvik. Hvert punkt er skrevet av fra en rapport og lenker til siden det står på. Punktene vises på områdesidene for regnskapsåret de gjelder, og punktene for året som pågår vises på *Året så langt*. Rapportene følger kommunens egne kommunalområder, som ikke er de samme som KOSTRA-områdene, så hvert punkt sier hvilket kommunalområde det gjelder.
Siden *Befolkning* (`befolkning.html`) viser hvor mange som bor i Narvik og hvordan det endrer seg: nøkkeltall, en befolkningspyramide med en slider fra 2020 til 2050 (`befolkning.html?aar=2040`), hvor i kommunen folk bor per delområde og grunnkrets, folketallet år for år med fødte, døde og flytting, sammenligning med de samme kommunene som økonomisidene, innvandrere og husholdninger. Til og med i år er tallene SSBs registrerte folketall 1. januar ([07459](https://www.ssb.no/statbank/table/07459), [06913](https://www.ssb.no/statbank/table/06913), [04317](https://www.ssb.no/statbank/table/04317), [04362](https://www.ssb.no/statbank/table/04362), [09817](https://www.ssb.no/statbank/table/09817), [06070](https://www.ssb.no/statbank/table/06070)); senere år er SSBs framskriving, hovedalternativet ([14746](https://www.ssb.no/statbank/table/14746)). Dagens Narvik finnes hos SSB fra 2020. Medianalder, menn per 100 kvinner og tallene for landet uten Oslo og KOSTRA-gruppen er beregnet fra tall per alder og merket «beregnet». `scripts/fetch_befolkning.py` henter alt til `site/data/befolkning.json`.

## Slik er det bygget

```
config/categories.json    KOSTRA-funksjoner gruppert i 15 tjenesteområder
scripts/fetch_data.py     henter tall fra SSB og skriver site/data/narvik.json
scripts/fetch_details.py  henter utgifts- og inntektsarter per funksjon fra SSB og skriver site/data/detaljer.json
scripts/fetch_budget.py   henter budsjett og regnskap per tjenesteområde fra Framsikt og skriver site/data/budsjett.json
scripts/fetch_malgruppe.py henter SSBs nøkkeltall per elev, per barn og per innbygger i aldersgruppen og skriver site/data/malgruppe.json
scripts/fetch_lopende.py  sjekker tertialtallene i config/lopende_2026.json, henter skatteinngang fra SSB 07022
                          og skriver site/data/lopende.json
scripts/fetch_tiltak.py   henter budsjettendringene tiltak for tiltak fra Framsikt, legger på oppfølgingen i
                          config/tiltak_oppfolging.json og skriver site/data/tiltak.json
scripts/fetch_befolkning.py henter folketall, framskriving, delområder, innvandrere og husholdninger fra SSB
                          og skriver site/data/befolkning.json
scripts/build_fakta.py    sjekker punktene i config/fakta.json (kilde, side, område) og skriver site/data/fakta.json
site/                     den statiske nettsiden: index.html (regnskap), omrade.html (ett område, en tjeneste,
                          en kostnadstype), budsjett.html (budsjett mot regnskap), lopende.html (året så langt),
                          tiltak.html (innsparinger), befolkning.html (befolkning); style.css og common.js er felles
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
python scripts/build_fakta.py         # sjekker og skriver punktene i «Bak tallene»
python scripts/fetch_tiltak.py        # innsparinger og andre budsjettendringer fra Framsikt
python scripts/fetch_befolkning.py    # befolkningstall og framskriving fra SSB
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

## Innsparinger

`scripts/fetch_tiltak.py` leser siden «Endring driftsbudsjett» i de samme Framsikt-publikasjonene. Den forklarer hvordan rammen til hvert tjenesteområde endret seg fra fjorårets vedtatte budsjett, ned til hvert navngitte tiltak med kode, beløp for de fire årene i økonomiplanen og kommunedirektørens beskrivelse. Hver linje i `site/data/tiltak.json` har adressen til JSON-filen den kom fra, og skriptet sjekker at linjene summerer til Framsikts egne totaler.

En linje regnes som innsparing når den står under Framsikts kategori «Innsparingstiltak», når den er et kutt kommunestyret selv la inn («Politisk vedtak»), eller når den er et tidligere vedtatt kutt eller omstillingsmål som videreføres (navnet sier struktur, innsparing, nedtrekk, avvikling, reduksjon eller omstilling). Linjer på Fellesinntekter og kostnader regnes ikke med, fordi strukturtiltaket ligger der som en motpost til fordelingen på områdene. Når samme tiltak står både som kutt og som penger tilbake under «Politisk vedtak» i samme publikasjon, har kommunestyret tatt kuttet ut igjen, og siden viser det.

Hva som skjedde med tiltakene etterpå, står i `config/tiltak_oppfolging.json`, skrevet inn for hånd fra tertialrapport 2 og årsrapporten med side. Kommunen rapporterer status bare for noen tiltak (tabellen «Status økonomiplantiltak» i tertialrapporten), så mye av oppfølgingen er hentet fra teksten. Tiltak uten oppføring vises som «Ingen status i rapportene». Lista `korreksjoner` merker linjer i et senere budsjett som legger penger inn igjen fordi et tidligere kutt ikke virket.

Bare budsjettet for 2025 (vedtatt) og forslaget for 2026 finnes på Framsikt. Kommunestyrets endringer i forslaget for 2026 er ikke publisert der. Når budsjettvedtaket for 2027 kommer, legg det til i `SOURCES` i skriptet, kjør det på nytt, og legg inn status fra tertialrapport 2/2026 og årsrapporten for 2026 i oppfølgingsfila.

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

Les også rapporten etter tall som forklarer avvikene (sykefravær, vikarbyrå, overtid, investeringer) og legg dem i `config/fakta.json`. Hvert punkt har:

- `tekst`: én eller to setninger med tallene slik rapporten oppgir dem, og `type` `tall`, eller `forklaring` med kommunens egne ord i `sitat`
- `kilde`: rapporten (en nøkkel i `kilder`) og sidetallet, og eventuelt tabellen i `del`
- `aar` og `periode`, for eksempel `2026` og `januar–august`
- `kommunalomrade`: kommunalområdet slik rapporten skriver det (for eksempel «Helse og omsorg», eller «Hele kommunen»), og `omrader`: områdene på denne siden det hører til (`helse`, `skole` …). Kommunen har organisert seg om flere ganger, så eldre rapporter har andre navn, som «Omsorg og mestring» og «Helse og velferd».
- eventuelt `tjeneste` eller `art` for å vise punktet bare på én tjeneste eller én kostnadstype
- eventuelt `merknad`, for eksempel når en senere rapport oppgir et annet tall for samme periode. Begge tallene vises da, med kilde, i stedet for at ett velges i stillhet.

For år som er avsluttet brukes årsrapporten (vedlegg til årsregnskapet i formannskapet i juni), fordi den gjelder hele året slik regnskapet på siden gjør. Punkter fra tertialrapporten for et avsluttet år står bare der årsrapporten ikke sier noe om temaet, for eksempel husleie for sommervikarer. Gir årsrapporten sykefravær bare for hele kommunen, beholdes tertialtallet for de kommunalområdene årsrapporten ikke nevner, med en merknad om at det gjelder januar–august. Når årsrapporten for året kommer, bytt ut tertialpunktene den dekker.

Kjør `python scripts/build_fakta.py`. Skriptet stopper med en feilmelding hvis et punkt mangler kilde eller side, eller peker på et område som ikke finnes. Punktene vises i den rekkefølgen de står i filen, og de tre første for hvert område vises uten å trykke.
