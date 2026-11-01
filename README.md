# Åpne tall for Narvik

Tall og innsikt om Narvik kommune, med kilde for hvert tall. Forsiden (`index.html`, `forside.js`) samler ett nøkkeltall fra hvert område, alle faktaarkene i *Utvalgte saker* og et utvalg av tallene som skiller seg ut på sidene (listen `PICKS` i `forside.js`), og lenker til alle områdene: *Økonomi*, *Befolkning*, *Bolig*, *Arbeid* og *Næringsliv*. Alt leses fra de samme datafilene som områdesidene, så forsiden oppdateres når de gjør det. Et tall i utvalget vises bare så lenge det fortsatt skiller seg ut.

Økonomisiden (`okonomi.html`) viser kommunens netto driftsutgifter fordelt på tjenester, år for år, og sammenlignet med lignende kommuner.

Regnskapstallene kommer fra SSBs KOSTRA-statistikk, [tabell 12362](https://www.ssb.no/statbank/table/12362), og viser hva kommunen faktisk brukte. Trykker du på et tjenesteområde, kommer du til områdesiden (`omrade.html`). Der kan du gå ned i tre nivåer: området, en tjeneste i det, og en kostnads- eller inntektstype i tjenesten, helt ned til SSBs enkelte arter i [tabell 12367](https://www.ssb.no/statbank/table/12367). Hvert nivå har sin egen adresse, for eksempel `omrade.html?omrade=helse&tjeneste=253&art=lonn&aar=2025`, så det kan deles.

Narvik sammenlignes med seks andre: snittet i Narviks KOSTRA-gruppe (gruppe 9, kommuner med 20 000 til 29 999 innbyggere), landet uten Oslo, Nordland, og Harstad, Rana og Alta, som er i samme gruppe. Alt er netto driftsutgifter per innbygger fra samme tabell. Økonomisiden viser forskjellen område for område mot én av dem (`okonomi?mot=harstad`), og hver områdeside, tjenesteside og kostnadstypeside viser alle seks (`omrade.html?omrade=helse&tjeneste=hjemmetjenester#sammenligning`). På kostnadstypenivå (for eksempel lønn i hjemmetjenester) finnes ikke SSBs eget beløp per innbygger, så beløpene fra tabell 12367 deles på folketallet og merkes som beregnet. De ligger i `site/data/sammenligning.json`, som `scripts/fetch_details.py` skriver. Hvilke kommuner som er i gruppen hentes fra SSBs klassifikasjon [KLASS 112](https://www.ssb.no/klass/klassifikasjoner/112). Listen over sammenligninger står i `COMPARE` i `scripts/fetch_data.py`.

For grunnskole, barnehage og barnevern kan sammenligningen også vises per bruker eller per innbygger i aldersgruppen: per innbygger 6–15 år, per barn i kommunal barnehage, per innbygger 1–5 år, per barn med tiltak i barnevernet og så videre (`omrade.html?omrade=skole&maal=innb#sammenligning`). Det tar hensyn til at kommunene har ulikt mange barn. Tallene er SSBs egne nøkkeltall fra tabell [12235](https://www.ssb.no/statbank/table/12235), [12255](https://www.ssb.no/statbank/table/12255), [12379](https://www.ssb.no/statbank/table/12379), [13502](https://www.ssb.no/statbank/table/13502) og [12279](https://www.ssb.no/statbank/table/12279), ikke beregnet her. Grunnskole sammenlignes ikke per elev, fordi elevtallet kommer fra skolenes egen rapportering og kostnaden per elev må korrigeres for kjøp fra og salg til andre kommuner; per innbygger 6–15 år er et tryggere grunnlag. Flere av dem er brutto eller korrigert brutto, altså kostnaden før inntektene er trukket fra, og det står ved tallet. `scripts/fetch_malgruppe.py` henter dem til `site/data/malgruppe.json`, og `MEASURES` i skriptet sier hvilket nøkkeltall som hører til hvilket område og hvilken tjeneste.

For helse og omsorg kan sammenligningen vises per innbygger 67 år og over og per innbygger 80 år og over (omsorgstjenestene samlet, hjemmetjenester, sykehjem og institusjon, lokaler til institusjoner, og 67 år og over for aktivitet og service for eldre), og per innbygger 0–20 år for helsestasjon og skolehelsetjeneste (`omrade.html?omrade=helse&maal=80#sammenligning`). SSB publiserer ikke disse som nøkkeltall lenger, så de er beregnet og merket «beregnet» på siden: netto driftsutgifter fra [12362](https://www.ssb.no/statbank/table/12362) delt på innbyggerne i aldersgruppen 1. januar året etter fra [07459](https://www.ssb.no/statbank/table/07459), som er datoen KOSTRA selv bruker. 07459 har ikke KOSTRA-grupper, så landet uten Oslo er hele landet minus Oslo, og KOSTRA-gruppen er summen av medlemskommunene (med gamle kommunenumre før 2024 fra KLASS). Skriptet varsler hvis summen av alle innbyggere avviker mer enn 0,5 % fra folketallet KOSTRA bruker. `AGE_MEASURES` i skriptet sier hvilke aldersgrupper som hører til hvilken tjeneste. Når «per innbygger 67 år og over» eller «80 år og over» er valgt, står det under sammenligningen hvor mange i aldersgruppen Narvik har i dag og hvor mange SSBs framskriving venter i 2040, med lenke til befolkningspyramiden (`befolkning.html?aar=2040#pyramide`). Tallene leses fra `older` i `site/data/befolkning.json`; siden regner ikke ut hva det vil koste.

Siden *Budsjett mot regnskap* (`budsjett.html`) viser kommunens vedtatte budsjett ved siden av regnskapet, og det nyeste budsjettet mot året før. Den nås fra toppmenyen, og fra regnskapssiden for år som har både budsjett og regnskap (`budsjett.html?aar=2024`). Tallene kommer fra bevilgningsoversikten for drift (1B) i kommunens budsjettdokumenter på [Framsikt](https://pub.framsikt.net/2026/narvik/bm-2026-rapport_plan/), fordelt på Narviks egne tjenesteområder.

Siden *Inntekter* (`inntekter.html`) viser hvor driftsinntektene kommer fra (skatt, rammetilskudd, gebyrer, refusjoner, statlige tilskudd, eiendomsskatt og momskompensasjon), netto driftsresultat og disposisjonsfond, og Narvik mot de samme kommunene som ellers på siden. Siden *Gjeld og investeringer* (`gjeld.html`) viser netto lånegjeld, en forklaring på hvorfor gjelden oppgis med ulike tall (fra lånene i årsregnskapet, `config/gjeld_balanse.json`, til netto lånegjeld for kommunekassen og kommunen med foretak fra SSBs [13566](https://www.ssb.no/statbank/table/13566) og for konsernet), renter og avdrag, de største investeringsprosjektene hvert år og den samme sammenligningen. Tallene er KOSTRA for kommunekonsernet fra SSBs tabeller [12364](https://www.ssb.no/statbank/table/12364), [12137](https://www.ssb.no/statbank/table/12137) og [12143](https://www.ssb.no/statbank/table/12143), som `scripts/fetch_finans.py` henter til `site/data/finans.json`. SSB har renter netto (art AGD97) bare fra 2024; for årene før beregnes den som AGD24 pluss utbytte (AD905) og merkes «beregnet». Investeringsprosjektene er skrevet inn for hånd i `config/investeringer.json` fra bevilgningsoversikten for investeringer (§ 5-5 andre ledd) i hver årsrapport, med side, og punktene om lån og renter står i `config/fakta.json` med temaet «Lån og renter». Legg inn et nytt år når årsrapporten kommer.

Siden *Bolig* (`bolig.html`) viser boligene i Narvik etter bygningstype og byggeår, nye boliger, kvadratmeterpris, hvor mange som eier og leier, hvor mange som bor trangt, og kommunalt disponerte boliger, sammenlignet med de samme kommunene som ellers på siden. Tallene er SSBs tabeller [06265](https://www.ssb.no/statbank/table/06265), [06266](https://www.ssb.no/statbank/table/06266), [12941](https://www.ssb.no/statbank/table/12941), [05940](https://www.ssb.no/statbank/table/05940), [14310](https://www.ssb.no/statbank/table/14310), [14891](https://www.ssb.no/statbank/table/14891), [14903](https://www.ssb.no/statbank/table/14903), [12008](https://www.ssb.no/statbank/table/12008) og [12012](https://www.ssb.no/statbank/table/12012), som `scripts/fetch_bolig.py` henter til `site/data/bolig.json`. Fullførte boliger per 1000 innbyggere og andelen boliger kommunen eier selv regnes ut på siden og merkes «beregnet».

Siden *Arbeid* (`arbeid.html`) viser helt ledige og nye ledige stillinger måned for måned fra Nav, og fra SSB hvor mange som har arbeid, hvem som står utenfor arbeid, hvor folk jobber etter sektor og næring, og pendling, sammenlignet med de samme kommunene som ellers på siden. Navs tall er Excel-filene HL060 (helt ledige per kommune, fra 2020) og STIL030 (nye ledige stillinger per kommune, fra 2021) på [nav.no](https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk). Lenkene endres hver måned, så `scripts/fetch_arbeid.py` finner dem på sidene og i Navs arkiv for hvert år. Kan ikke nav.no leses, beholdes forrige måneds tall. SSB-tallene er tabellene [06445](https://www.ssb.no/statbank/table/06445), [13563](https://www.ssb.no/statbank/table/13563), [13472](https://www.ssb.no/statbank/table/13472), [11616](https://www.ssb.no/statbank/table/11616) og [03321](https://www.ssb.no/statbank/table/03321). Alt skrives til `site/data/arbeid.json`. Andeler og snitt som regnes ut på siden, merkes «beregnet».

Siden *Næringsliv* (`naering.html`) viser bedrifter etter næring og antall ansatte, nye foretak og konkurser kvartal for kvartal, hvor mange nye foretak som fortsatt er i drift etter ett til tre år, og overnattinger, fra SSB-tabellene [10309](https://www.ssb.no/statbank/table/10309), [08076](https://www.ssb.no/statbank/table/08076), [07165](https://www.ssb.no/statbank/table/07165), [13701](https://www.ssb.no/statbank/table/13701) og [12894](https://www.ssb.no/statbank/table/12894), med folketall fra [07459](https://www.ssb.no/statbank/table/07459). De største arbeidsplassene (underenheter med minst 50 ansatte) hentes fra [Enhetsregisteret](https://data.brreg.no/enhetsregisteret/api/docs/index.html) hos Brønnøysundregistrene; enkeltpersonforetak er ikke med. Kan ikke Enhetsregisteret leses, beholdes forrige liste. `scripts/fetch_naering.py` skriver alt til `site/data/naering.json`.

Siden *Året så langt* (`lopende.html`) følger budsjettet og forbruket i inneværende år: brukt hittil, avvik og kommunedirektørens prognose per tjenesteområde, hvordan prognosen for året har endret seg fra tertialrapport til tertialrapport, årets vedtatte budsjett mot fjorårets regnskap per tjenesteområde (fra årsrapporten), hvordan rammene er endret siden vedtaket, og inntektene. Tallene kommer fra tertialrapportene og årsrapporten, som bare finnes som PDF og er skrevet inn i `config/lopende_2026.json` med side. I tillegg vises skatteinngangen måned for måned fra SSBs [tabell 07022](https://www.ssb.no/statbank/table/07022), som oppdateres automatisk.

Siden *Innsparinger* (`tiltak.html`) viser kuttene som ble lagt inn i budsjettet tiltak for tiltak, hvilke kommunestyret tok ut igjen i samme vedtak, og hva tertialrapporter og årsrapporter sier skjedde med dem. Den viser også hele endringen i rammen til hvert tjenesteområde, slik Framsikt forklarer den.

*Bak tallene* forklarer tallene med det kommunens egne rapporter sier: sykefravær, utgifter til vikarbyrå og overtid, investeringer som skolegårder, og kommunens egne forklaringer på avvik. Hvert punkt er skrevet av fra en rapport og lenker til siden det står på. Punktene vises på områdesidene for regnskapsåret de gjelder, og punktene for året som pågår vises på *Året så langt*. Rapportene følger kommunens egne kommunalområder, som ikke er de samme som KOSTRA-områdene, så hvert punkt sier hvilket kommunalområde det gjelder.
Siden *Utvalgte saker* (`saker.html`) har ett faktaark per sak som mange i Narvik snakker om (`sak/helse-og-omsorg`): nøkkeltall, hvem som er involvert og hvilken rolle de har, kommunens rolle og penger, en tidslinje med vedtak og datoer (nyeste først, de eldste bak «Vis hele tidslinjen»), og lenker videre på siden. Hvert tall og hver linje har kilde med side, fra kommunens egne dokumenter, NVE, Statnett og andre offentlige kilder. Arkene regner ikke ut prognoser; kommunens egne prognoser kan vises og merkes som det. Sakene skrives inn for hånd i `config/saker.json`, og datoen «kontrollert» sier når saken sist ble sjekket mot kildene. Punktene fra *Bak tallene* som gjelder saken, hentes fra `config/fakta.json`, så de ikke skrives inn to ganger. `scripts/build_saker.py` sjekker kildene og datoene og skriver `site/data/saker.json`.
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
scripts/fetch_finans.py   henter inntekter, resultat, fond, gjeld og investeringer fra SSB, legger på prosjektene i
                          config/investeringer.json og skriver site/data/finans.json
scripts/fetch_bolig.py    henter boligtall fra SSB og skriver site/data/bolig.json
scripts/fetch_arbeid.py   henter ledighet og ledige stillinger fra Nav og arbeidsmarkedstall fra SSB, og skriver
                          site/data/arbeid.json
scripts/fetch_naering.py  henter bedrifter, nye foretak, konkurser og overnattinger fra SSB og de største
                          arbeidsplassene fra Enhetsregisteret, og skriver site/data/naering.json
scripts/build_fakta.py    sjekker punktene i config/fakta.json (kilde, side, område) og skriver site/data/fakta.json
scripts/build_saker.py    sjekker sakene i config/saker.json (kilde, side, dato) og skriver site/data/saker.json
scripts/build_pages.py    lager én side per sak (site/sak/<id>.html) og per tjenesteområde (site/utgifter/<key>.html)
                          fra saker.html og omrade.html, med egen tittel og adresse for søkemotorer, og skriver
                          site/sitemap.xml; kjør den på nytt etter endringer i de to malene eller i ?v=-datoen
site/                     den statiske nettsiden: index.html (forsiden), okonomi.html (regnskap), omrade.html (ett område, en tjeneste,
                          en kostnadstype), inntekter.html (inntekter), gjeld.html (gjeld og
                          investeringer), budsjett.html (budsjett mot regnskap), lopende.html (året så langt),
                          tiltak.html (innsparinger), befolkning.html (befolkning), om.html (om siden og hvordan
                          man melder fra om feil på e-post); style.css og common.js er felles. og.png er bildet som vises
                          når en lenke deles (Open Graph); lag det på nytt hvis tittelen endres. style.css og
                          .js-filene lastes med ?v=<dato> i HTML-en; bytt datoen når de endres, ellers kan
                          nettlesere bruke den gamle versjonen fra mellomlageret
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
python scripts/fetch_finans.py        # inntekter, gjeld og investeringer fra SSB
python scripts/fetch_bolig.py         # boligtall fra SSB
python scripts/fetch_arbeid.py        # ledighet og stillinger fra Nav, arbeidsmarked fra SSB
python scripts/fetch_naering.py       # bedrifter og foretak fra SSB, store arbeidsplasser fra Brreg
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

Legg rapporten til i `reports` i `config/lopende_2026.json`, med tabellene «Totaloversikt drift – fordelt på rammeområder» og «Sentrale inntekter» skrevet av slik de står, og sidetallene. Legg også rapportens prognose for hele kommunen og for Helse og omsorg til i `prognoser`. Kjør `python scripts/fetch_lopende.py`. Skriptet sjekker at hvert avvik er budsjett minus regnskap, at radene summerer til totalen og at den siste prognosen stemmer med den siste rapporten, og siden viser den nyeste rapporten. Når årsrapporten kommer, oppdateres `fjoraar` med regnskapet per tjenesteområde fra tabellen «Totaloversikt økonomi». For et nytt år lages en ny fil, og `CONFIG` i skriptet pekes til den.

Les også rapporten etter tall som forklarer avvikene (sykefravær, vikarbyrå, overtid, investeringer) og legg dem i `config/fakta.json`. Hvert punkt har:

- `tekst`: én eller to setninger med tallene slik rapporten oppgir dem, og `type` `tall`, eller `forklaring` med kommunens egne ord i `sitat`
- `kilde`: rapporten (en nøkkel i `kilder`) og sidetallet, og eventuelt tabellen i `del`
- `aar` og `periode`, for eksempel `2026` og `januar–august`
- `kommunalomrade`: kommunalområdet slik rapporten skriver det (for eksempel «Helse og omsorg», eller «Hele kommunen»), og `omrader`: områdene på denne siden det hører til (`helse`, `skole` …). Kommunen har organisert seg om flere ganger, så eldre rapporter har andre navn, som «Omsorg og mestring» og «Helse og velferd».
- eventuelt `tjeneste` eller `art` for å vise punktet bare på én tjeneste eller én kostnadstype
- eventuelt `merknad`, for eksempel når en senere rapport oppgir et annet tall for samme periode. Begge tallene vises da, med kilde, i stedet for at ett velges i stillhet.

For år som er avsluttet brukes årsrapporten (vedlegg til årsregnskapet i formannskapet i juni), fordi den gjelder hele året slik regnskapet på siden gjør. Punkter fra tertialrapporten for et avsluttet år står bare der årsrapporten ikke sier noe om temaet, for eksempel husleie for sommervikarer. Gir årsrapporten sykefravær bare for hele kommunen, beholdes tertialtallet for de kommunalområdene årsrapporten ikke nevner, med en merknad om at det gjelder januar–august. Når årsrapporten for året kommer, bytt ut tertialpunktene den dekker.

Kjør `python scripts/build_fakta.py`. Skriptet stopper med en feilmelding hvis et punkt mangler kilde eller side, eller peker på et område som ikke finnes. Punktene vises i den rekkefølgen de står i filen, og de tre første for hvert område vises uten å trykke.

## Lisens

Koden er lisensiert under [PolyForm Noncommercial 1.0.0](LICENSE): den kan leses, brukes og endres til ikke-kommersielle formål. Tekstene, faktaarkene og sammenstillingene på siden er lisensiert under CC BY 4.0, se [LICENSE-innhold.md](LICENSE-innhold.md) for hva det dekker. Tallene selv følger vilkårene til kilden: SSB under CC BY 4.0, Nav og Brønnøysundregistrene under NLOD 2.0, og kommunens dokumenter er offentlige. Oppgi den opprinnelige kilden når du bruker et tall.
