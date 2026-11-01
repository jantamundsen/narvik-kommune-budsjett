# Plan for å holde «Andre tall» oppdatert

«Andre tall» (narviktall.no/andre-tall) er en tidslinje med tall om Narvik kommune som ikke vises andre steder på siden. Hvert kort har en dato for når kilden publiserte tallet (eller når det ble hentet fra en database uten publiseringsdato), perioden tallet gjelder, og kilden med side eller tabell.

Kortene står i `config/andre_tall.json`. `scripts/build_andre_tall.py` sjekker dem og skriver `site/data/andre_tall.json`. Skriptet kjøres i den ukentlige datajobben, men henter ingenting selv. Nye tall legges inn for hånd (eller av Claude i en PR).

## Regler for et kort

- Tallet vises ikke andre steder på narviktall.no. Hvis et tall senere får plass på en annen side, fjernes kortet her.
- Kilden er dokumentet eller tabellen, aldri en avis. Aviser kan brukes som tips for å finne dokumentet.
- Dokumenter har side. Tabeller har tabellnummer. SSB-kort lenker til tabellen.
- `publisert` er datoen kilden la ut tallet. Bruk `hentet` bare når kilden ikke har en publiseringsdato (NVE, Vegvesen, Avinor, Miljødirektoratet). Kort med `hentet` står ikke på tidslinjen, men i listen «Fra databaser som oppdateres løpende» under den.
- `gjelder` er perioden tallet handler om (2025, Snitt 2023–2025, Skoleåret 2025–26, Oktober 2026).
- Endring fra året før står i prosent. Skriv `endring.forrige` med fjorårets tall, så regner skriptet ut prosenten. Bruk `endring.pst` bare når kilden selv oppgir prosenten.
- Ingen navn eller personopplysninger, og ingen egne opptellinger fra postlisten.

## Når et tall får en ny årgang

1. Legg inn et nytt kort med ny id, for eksempel `vei-2026` ved siden av `vei-2025`. Kort med samme id uten årstall er én serie (eller sett `serie` når id-ene ikke følger mønsteret).
2. Sett `publisert` (eller `hentet`), `gjelder` og `endring.forrige` fra det gamle kortet.
3. Kjør `python scripts/build_andre_tall.py`. Det gamle kortet blir stående med «Nyere tall finnes» og lenke til det nye.
4. Tekst i kortet som nevner andre tall (for eksempel «I 2023 var det 1 924 ansatte») skrives om for den nye årgangen.

Gamle kort blir stående, så lenker til dem virker. Når en serie har tre årganger, kan den eldste fjernes.

## Kalender

| Når | Kilde | Kort |
|---|---|---|
| Januar–februar | Avinor (passasjerer), Statens vegvesen (ÅDT året før), SSB 03174 (hytter) | evenes, trafikk-sentrum, trafikk-bjornfjell, hytter |
| 15. mars | SSB, foreløpige KOSTRA-tall og 14725, 14523 | elbil, kulturskole (KOSTRA-kortene venter til juni) |
| Mai | Udir, Elevundersøkelsen; luftkvalitet til kommunestyret | mobbing, svevestov |
| Begynnelsen av juni | Årsrapporten (formannskapet) | ansatte, laerlinger, bruer, byggesoknader, dispensasjon, heltid, fartshumper |
| Midten av juni | SSB, endelige KOSTRA-tall; SSB 08487 | vei, vannledning, fornyet, vannmaler, lekkasje, vannverk, utrykninger, piper, kirke, eiendomsskatt, gebyrer, avfall, fastlege, bekymring, bibliotek, kino, formalsbygg, lovbrudd |
| Kommunestyret i juni | Årsmeldinger fra Narvik Havn KF, Narvik Vann KF, Ofoten brann og redning IKS, næringsfondet | cruise, jernmalm, vannproduksjon, vannlekkasjer, brann-region, naeringsfond |
| Høst og vinter | Folkehelsestatistikken (FHI/Helsedirektoratet) | overvekt, lavinntekt, levealder |
| Når de kommer | Revisjonsbrev (kontrollutvalget), tilsynsrapporter fra Statsforvalteren, Miljødirektoratets klimagasstall, NVE | revisjonsbrev, tilsyn-hjemmetjeneste, klima, kraftverk |
| Etter valg (2027, 2029) | SSB 09475 / valgstatistikk | valg |

## Fase 1: Manuelt, med den ukentlige sjekken (denne PR-en)

- Kortene legges inn for hånd i `config/andre_tall.json`.
- Den ukentlige dokumentsjekken på fredager får «Andre tall» som eget punkt: nye årsmeldinger, revisjonsbrev og tilsynsrapporter i møtene til kommunestyret, formannskapet og kontrollutvalget, og nye tilsyn i Statsforvalterens tilsynskalender. Funn blir en PR, slik som for de andre sidene.

## Fase 2: Varsel når en kilde har nyere tall

Et lite skript (`scripts/sjekk_andre_tall.py`) i den ukentlige datajobben som spør kildene om siste periode, uten å skrive kort:

- SSB: feltet `updated` på `/tables/{id}` og siste år i tabellen.
- FHI: siste periode i tabellene 387, 403, 508 og 351.
- Udir: siste `TidID` i Statistikkbanken tabell 150.
- Vegvesen, Avinor og Miljødirektoratet: om det finnes et nyere år enn kortet.

Skriptet skriver en liste over kort som har nyere tall til `site/data/andre_tall_status.json` (vises ikke på siden), og den ukentlige sjekken lager en PR med nye kort ut fra listen. Tekstene på kortene skrives fortsatt for hånd, fordi de nevner flere tall fra samme kilde.

## Fase 3: Automatiske SSB-kort (valgfritt)

For de rene SSB-kortene kan skriptet fylle inn tallet og fjorårets tall selv, med en fast tekstmal per kort. Det sparer arbeid i juni, men gir stivere tekster. Vurderes etter at fase 2 har gått gjennom én juni.

## Tall fra innsynskrav

Svar på innsynskrav som andre har sendt, ligger i postlisten, men dokumentene kan ikke lastes ned uten å «bestille» dem, og det er formelt et nytt innsynskrav. Det er et åpent spørsmål som avklares før slike tall legges inn. Til da brukes bare dokumenter som er publisert (møtedokumenter, rapporter og databaser).
