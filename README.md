# Pengene i Narvik

Hvor går pengene i Narvik kommune? En enkel nettside som viser kommunens netto driftsutgifter fordelt på tjenester, år for år, og sammenlignet med landet og Nordland.

Tallene kommer fra SSBs KOSTRA-statistikk, [tabell 12362](https://www.ssb.no/statbank/table/12362), og viser regnskap (hva kommunen faktisk brukte), ikke budsjett.

## Slik er det bygget

```
config/categories.json    KOSTRA-funksjoner gruppert i 15 tjenesteområder
scripts/fetch_data.py     henter tall fra SSB og skriver site/data/narvik.json
site/                     den statiske nettsiden (HTML, CSS og ren JavaScript)
.github/workflows/        oppdaterer data fra SSB og publiserer til GitHub Pages
```

Ingen server, database eller byggesteg. Skriptet bruker bare Pythons standardbibliotek.

## Kjøre lokalt

```sh
python scripts/fetch_data.py          # henter ferske tall fra SSB
python -m http.server -d site 8000    # åpne http://localhost:8000
```

Siden må åpnes via en webserver, siden den leser `data/narvik.json` med `fetch`.

## Kategoriene

SSB rapporterer rundt 80 KOSTRA-funksjoner (for eksempel 202 Grunnskole og 253 Helse- og omsorgstjenester i institusjon). `config/categories.json` samler dem i tjenesteområder folk kjenner igjen. Hver funksjon hører til nøyaktig én kategori, slik at summen alltid blir riktig.

Hvis SSB innfører en ny funksjonskode, avslutter skriptet med en advarsel som navngir koden. Legg den til i riktig kategori og kjør skriptet på nytt.

## Begreper

- **Netto driftsutgifter** (art AGD2): kostnaden for en tjeneste minus inntektene som hører til den (gebyrer, refusjoner, øremerkede tilskudd). Det er det kommunen betaler med frie inntekter.
- **Per innbygger**: folketallet hentes ikke direkte, men beregnes fra SSBs beløp og beløp per innbygger.
- **Vann, avløp og renovasjon** og **pensjonsposter** trekker fra i netto og vises for seg.

## Publisering

1. Under *Settings → Pages*, velg *GitHub Actions* som kilde.
2. Arbeidsflyten *Publiser nettsiden* kjører ved hver endring i `site/`.
3. *Oppdater data fra SSB* kjører 1. april og 20. juni, etter SSBs KOSTRA-publiseringer, og kan også startes manuelt under *Actions*.

Laget som et åpent hobbyprosjekt, ikke av Narvik kommune.
