// saker.html: «Utvalgte saker». Without a case it lists the cases; sak/helse-og-omsorg shows one fact sheet.
// scripts/build_pages.py writes sak/<id>.html from saker.html with data-sak set and the header filled in for search
// engines; this script then draws the full sheet. The old address saker?sak=<id> still works.
// Everything comes from data/saker.json, which scripts/build_saker.py writes from config/saker.json.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateText = iso => new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

(async () => {
  const main = document.getElementById('sak');
  let D;
  try { D = await fetch('data/saker.json', { cache: 'no-cache' }).then(r => r.json()); } catch (e) {
    main.innerHTML = '<p>Fant ikke sakene. Prøv å laste siden på nytt.</p>';
    return;
  }
  // A source as a link to the page it is on: «Tertialrapport 2/2026, s. 9».
  const src = k => {
    const s = D.kilder[k.id];
    const href = s.pdf ? s.pdf + (k.side ? '#page=' + k.side : '') : s.url;
    return `<a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(s.full)}">${esc(s.navn)}${k.side ? ', s. ' + k.side : ''}</a>`;
  };
  // Several pages in one document as «Kontrollutvalget 01.12.2025, s. 35, 36», each page its own link.
  const srcGroup = ks => [...ks.reduce((m, k) => m.set(k.id, [...(m.get(k.id) || []), k]), new Map())].map(([kid, list]) => {
    const s = D.kilder[kid], pages = list.filter(k => k.side);
    if (!pages.length) return src(list[0]);
    return `<span title="${esc(s.full)}">${esc(s.navn)}, s. ${pages.map(k => `<a href="${esc(s.pdf)}#page=${k.side}" target="_blank" rel="noopener">${k.side}</a>`).join(', ')}</span>`;
  }).join('; ');
  // A line that rests only on newspaper or NRK articles is marked, so it is never read as what the documents say:
  // «Utsagn» for a quote from someone in a public role, «Medieoppslag» for what the paper reports.
  const isMedia = k => [].concat(k).every(x => D.kilder[x.id]?.type === 'media');
  const mediaTag = p => isMedia(p.kilde) ? `<span class="tag media-tag" title="Fra et avisoppslag eller NRK, ikke fra et dokument. Sjekk kilden.">${p.sitat ? 'Utsagn' : 'Medieoppslag'}</span>` : '';
  const quote = p => `<blockquote class="fact-quote sak-quote"><p>«${esc(p.sitat)}»</p><p class="caption quote-who">– ${esc(p.hvem)}</p></blockquote>${p.tekst ? `<p class="caption">${esc(p.tekst)}</p>` : ''}`;
  const id = new URLSearchParams(location.search).get('sak') || main.dataset.sak;
  const S = D.saker.find(s => s.id === id);
  setCanonical(S ? 'sak/' + S.id : 'saker');
  if (!S) return list(main, D);

  document.title = `${S.sok_tittel || S.tittel + ": faktaark"} · Åpne tall for Narvik`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', S.ingress);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', S.ingress);
  const sources = new Map();
  // A line can rest on more than one page, so a source may also be a list.
  const note = k => { [].concat(k).forEach(x => sources.set(x.id, D.kilder[x.id])); return Array.isArray(k) ? srcGroup(k) : src(k); };

  const stats = S.nokkeltall.map(n => `<div class="stat"><span class="sub">${esc(n.navn)}</span><span class="big num">${esc(n.verdi)}</span><span class="sub">${esc(n.tekst)}</span><span class="caption">Kilde: ${note(n.kilde)}</span></div>`).join('');
  // Who is involved: one row per actor, its role in a sentence or two, and the pages that say so.
  S.aktorer?.forEach(a => [].concat(a.kilde).forEach(k => sources.set(k.id, D.kilder[k.id])));
  const actors = S.aktorer?.length ? `<section aria-labelledby="h-actors">
      <div class="section-head"><h2 id="h-actors">Hvem er involvert</h2></div>
      <dl class="actors">${S.aktorer.map(a => `<div><dt>${esc(a.navn)}</dt><dd>${esc(a.rolle)} <span class="caption">Kilde: ${srcGroup([].concat(a.kilde))}</span></dd></div>`).join('')}</dl>
    </section>` : '';
  const tab = S.tabell ? `<section aria-labelledby="h-tab">
      <div class="section-head"><h2 id="h-tab">Budsjett og regnskap</h2></div>
      <div class="ptable"><table id="sak-table"><caption class="sr-only">${esc(S.tabell.tittel)}</caption>
        <thead><tr>${S.tabell.kolonner.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${S.tabell.rader.map(r => `<tr>${r.celler.map(c => `<td>${esc(c)}</td>`).join('')}<td class="muted">${note(r.kilde)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="caption">${esc(S.tabell.tittel)}. ${esc(S.tabell.merknad || '')}</p>
    </section>` : '';
  const inst = S.ssb_institusjon ? await institutionTables(sources) : '';
  const role = `<section aria-labelledby="h-role">
      <div class="section-head"><h2 id="h-role">Kommunens rolle og penger</h2></div>
      <ul class="fact-list">${S.rolle.map(r => `<li class="fact"><p>${esc(r.tekst)}</p><p class="caption fact-src">Kilde: ${note(r.kilde)}</p></li>`).join('')}</ul>
    </section>`;
  // Topics such as jobs or environment, each a short list of sourced points.
  (S.temaer || []).forEach(t => t.punkter.forEach(p => [].concat(p.kilde).forEach(k => sources.set(k.id, D.kilder[k.id]))));
  const topics = (S.temaer || []).map((t, n) => `<section aria-labelledby="h-topic-${n}">
      <div class="section-head"><h2 id="h-topic-${n}">${esc(t.tittel)}</h2></div>
      <ul class="fact-list">${t.punkter.map(p => `<li class="fact${isMedia(p.kilde) ? ' fact-media' : ''}">${mediaTag(p)}${p.sitat ? quote(p) : `<p>${esc(p.tekst)}</p>`}<p class="caption fact-src">Kilde: ${srcGroup([].concat(p.kilde))}</p></li>`).join('')}</ul>
    </section>`).join('');
  // Newest first. The config keeps them oldest first (build_saker.py checks the order); after the first few,
  // the rest are behind a button so a long timeline doesn't push the rest of the page down.
  const SHOWN = 5, events = [...S.tidslinje].reverse();
  const time = `<section aria-labelledby="h-time">
      <div class="section-head"><h2 id="h-time">Tidslinje</h2><p class="lead">Nyeste først.</p></div>
      <ol class="timeline" id="timeline">${events.map((t, i) => `<li${isMedia(t.kilde) ? ' class="tl-media"' : ''}${i >= SHOWN ? ' hidden' : ''}><span class="tl-date num">${esc(t.dato)}</span><div>${mediaTag(t)}<p>${esc(t.tekst)}</p>${t.sitat ? `<blockquote class="fact-quote sak-quote"><p>«${esc(t.sitat)}»</p><p class="caption quote-who">– ${esc(t.hvem)}</p></blockquote>` : ''}<p class="caption">Kilde: ${note(t.kilde)}</p></div></li>`).join('')}</ol>
      ${events.length > SHOWN ? `<button type="button" class="btn tl-more" id="tl-more">Vis hele tidslinjen (${events.length - SHOWN} til)</button>` : ''}
    </section>`;
  // «Bak tallene» points from fakta.json, one group per year, the newest open.
  let facts = '';
  if (S.fakta?.length) {
    S.fakta.forEach(f => sources.set(f.kilde.id, D.kilder[f.kilde.id]));
    const years = [...new Set(S.fakta.map(f => f.aar))];
    const F = { kilder: D.kilder };
    facts = `<section aria-labelledby="h-facts">
      <div class="section-head"><h2 id="h-facts">Det kommunens rapporter sier</h2>
        <p class="lead">Punkter fra årsrapporter og tertialrapporter om ${esc(S.fakta[0].kommunalomrade.toLowerCase())}, skrevet av med side. De samme punktene står på områdesidene under «Bak tallene».</p></div>
      ${years.map((y, i) => `<details class="fact-year"${i ? '' : ' open'}><summary>${esc(y)} <span class="caption">${S.fakta.filter(f => f.aar === y).length} punkter</span></summary><ul class="fact-list">${factItems(F, S.fakta.filter(f => f.aar === y), false)}</ul></details>`).join('')}
    </section>`;
  }
  const links = `<section aria-labelledby="h-links">
      <div class="section-head"><h2 id="h-links">Mer på siden</h2></div>
      <div class="link-cards">${S.lenker.map(l => `<article class="link-card"><h3>${esc(l.navn)}</h3><p>${esc(l.tekst)}</p><a class="cross-link" href="${esc(l.href)}">Gå til ${esc(l.navn.toLowerCase())} →</a></article>`).join('')}</div>
    </section>`;
  const docList = list => `<ul class="doc-list">${list.map(s => `<li><a href="${esc(s.url || s.pdf)}" target="_blank" rel="noopener">${esc(s.full)}</a>${s.url && s.pdf ? ` · <a href="${esc(s.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}</li>`).join('')}</ul>`;
  const media = [...sources.values()].filter(s => s.type === 'media');
  const docs = `<section aria-labelledby="h-docs">
      <div class="section-head"><h2 id="h-docs">Dokumentene</h2>
        <p class="lead">Alle kildene for saken. Har jeg oversett et vedtak eller et dokument, <a href="om#feil">si fra</a>.</p></div>
      ${docList([...sources.values()].filter(s => s.type !== 'media'))}
      ${media.length ? `<h3 class="doc-sub">Medieoppslag</h3><p class="caption">Artikler som utsagnene og medieoppslagene over er hentet fra.</p>${docList(media)}` : ''}
    </section>`;

  main.innerHTML = `<header>
      <nav class="crumbs" aria-label="Brødsmuler"><a href="saker">Utvalgte saker</a><span aria-hidden="true">›</span><span aria-current="page">${esc(S.tittel)}</span></nav>
      <div class="eyebrow">Sist kontrollert ${dateText(S.kontrollert)}</div>
      <h1>${esc(S.tittel)}</h1>
      <p class="lead">${esc(S.ingress)}</p>
      ${S.mangler ? `<p class="status-note">${esc(S.mangler)}</p>` : ''}
    </header>
    <section aria-label="Nøkkeltall"><div class="stats3 sak-stats" style="--n:${S.nokkeltall.length}">${stats}</div></section>
    ${actors}${tab}${inst}${role}${topics}${time}${facts}${links}${docs}`;
  document.getElementById('tl-more')?.addEventListener('click', e => {
    document.querySelectorAll('#timeline li[hidden]').forEach(li => { li.hidden = false; });
    e.currentTarget.remove();
  });
  const t = document.getElementById('sak-table');
  if (t) stackable(t);
  // The page is drawn after the data has loaded, so the browser cannot jump to #institusjon by itself.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();

// «Sykehjem og institusjoner i SSB-tallene» for a case with "ssb_institusjon": true. The numbers come from
// data/eldre.json and data/malgruppe.json, which the weekly data job updates, so they are not typed into saker.json.
// Narvik against the KOSTRA group only, every year SSB has, with a source under each table. No interpretation.
async function institutionTables(sources) {
  const get = u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [E, M] = await Promise.all([get('data/eldre.json'), get('data/malgruppe.json')]);
  const I = E?.institusjon;
  if (!I) return '';
  const G = 'KOSTRA-gruppe 9';
  const ssbSrc = (table, query, what) => {
    const url = `https://www.ssb.no/statbank/table/${table}`;
    sources.set('ssb-' + table, { full: `SSB, tabell ${table}: ${what}`, url });
    return `<a href="${esc(query)}&outputFormat=html" target="_blank" rel="noopener">SSB, tabell ${table}</a>`;
  };
  const table = (head, ys, rows) => `<div class="detail-scroll"><table class="num-table"><tr><th>${esc(head)}</th>${ys.map(y => `<th>${y}</th>`).join('')}</tr>
    ${rows.map(r => `<tr${r.sum ? ' class="sum"' : ''}><td>${esc(r.name)}</td>${ys.map(y => `<td>${r.cell(y) ?? '·'}</td>`).join('')}</tr>`).join('')}</table></div>`;
  const vs = (a, b) => (a == null || b == null ? null : chgText(pct(a, b)));
  let html = '';

  // Institution running costs (253) per inhabitant 67+, computed on the site from 12362 and 07459.
  const m = (M?.measures || []).find(x => x.area === 'helse' && x.service === '253' && x.key === '67');
  if (m) {
    const v = m.values, ys = Object.keys(v.narvik || {}).filter(y => v.narvik[y] != null);
    html += `<h3 class="sub-h">Drift av sykehjem og institusjoner per innbygger 67 år og over, kroner</h3>
      ${table('KOSTRA-funksjon 253', ys, [
        { name: 'Narvik', sum: true, cell: y => nb(v.narvik[y]) },
        { name: G, cell: y => (v.gruppe?.[y] == null ? null : nb(v.gruppe[y])) },
        { name: `Narvik mot ${G}`, cell: y => vs(v.narvik[y], v.gruppe?.[y]) },
      ])}
      <p class="caption">Netto driftsutgifter til KOSTRA-funksjon 253 (helse- og omsorgstjenester i institusjon), kommunekonsern, delt på innbyggere 67 år og over 1. januar året etter. Beregnet her fordi SSB ikke publiserer tallet. Lokalene (funksjon 261) er ikke med. Kilde: ${ssbSrc(m.table, m.query, 'netto driftsutgifter per funksjon')} og ${ssbSrc(m.population.table, m.population.query, 'befolkning etter alder')}.</p>`;
  }

  // Cost per day in an institution, SSB's own key figure.
  const P = I.dognpris, pv = P.values, pys = Object.keys(pv.narvik || {});
  if (pys.length) {
    html += `<h3 class="sub-h">Utgifter per oppholdsdøgn i institusjon, kroner</h3>
      ${table('Kr per døgn', pys, [
        { name: 'Narvik', sum: true, cell: y => (pv.narvik[y] == null ? null : nb(pv.narvik[y])) },
        { name: G, cell: y => (pv.gruppe?.[y] == null ? null : nb(pv.gruppe[y])) },
        { name: `Narvik mot ${G}`, cell: y => vs(pv.narvik[y], pv.gruppe?.[y]) },
        { name: 'Narvik, endring fra året før', cell: (y, i = pys.indexOf(y)) => (i ? vs(pv.narvik[y], pv.narvik[pys[i - 1]]) : null) },
      ])}
      <p class="caption">SSBs nøkkeltall «${esc(P.name)}». Utgiftene omfatter både driften (funksjon 253) og lokalene (261), delt på antall døgn beboerne har bodd på institusjonen. Løpende kroner. Kilde: ${ssbSrc(P.table, P.query, 'utvalgte nøkkeltall for helse og omsorg')}.</p>`;
  }

  // Users of institution services per 1 000 inhabitants in the age group.
  const U = I.brukere, uv = U.values, uys = Object.keys(uv.narvik?.['F000-120'] || {});
  if (uys.length) {
    const ages = U.ages.filter(a => a.code !== 'F000-066');
    const f = (k, a, y) => { const c = uv[k]?.[a]?.[y]; return c?.per1000 == null ? null : nb(c.per1000, 1); };
    html += `<h3 class="sub-h">Brukere av institusjonstjenester per 1 000 innbyggere i aldersgruppen</h3>
      ${table('Per 1 000 innbyggere', uys, ages.flatMap(a => [
        { name: `${a.name}, Narvik`, sum: true, cell: y => { const c = uv.narvik?.[a.code]?.[y]; return c?.per1000 == null ? null : `${nb(c.per1000, 1)} <small>(${nb(c.antall)})</small>`; } },
        { name: `${a.name}, ${G}`, cell: y => f('gruppe', a.code, y) },
      ]))}
      <p class="caption">Personer SSB har registrert med institusjonstjenester (sykehjem og andre helse- og omsorgsinstitusjoner), ikke antall plasser. Tallet i parentes er antall brukere i Narvik. Kilde: ${ssbSrc(U.table, U.query, 'omsorgstjenester, brukere etter alder og tjenestegrupper')}.</p>`;
  }
  if (!html) return '';
  return `<section aria-labelledby="h-inst" id="institusjon">
      <div class="section-head"><h2 id="h-inst">Sykehjem og institusjoner i SSB-tallene</h2>
        <p class="lead">Tall fra SSBs KOSTRA-statistikk for Narvik og snittet i ${G}, kommunene SSB regner som sammenlignbare. KOSTRA deler tjenestene inn på en annen måte enn kommunalområdet i tabellen over (<a href="okonomi#inndeling">hvorfor tallene er ulike</a>). Tallene oppdateres når SSB publiserer nye. Flere sammenligninger står på <a href="utgifter/helse#institusjon">Helse og omsorg</a>.</p></div>
      ${html}
    </section>`;
}

function list(main, D) {
  main.innerHTML = `<header>
      <h1>Utvalgte saker</h1>
      <p class="lead">Faktaark om saker mange i Narvik snakker om. Hvert ark samler vedtak, datoer og tall fra kommunens egne dokumenter og andre offentlige kilder, med lenke til siden tallet står på. Noen ark har også utsagn og oppslag fra aviser og NRK, tydelig merket.</p>
    </header>
    <section aria-label="Sakene"><div class="link-cards">${D.saker.map(s => `<article class="link-card">
      <span class="eyebrow">Sist kontrollert ${dateText(s.kontrollert)}</span>
      <h3>${esc(s.tittel)}</h3>
      <p>${esc(s.ingress)}</p>
      <a class="cross-link" href="sak/${encodeURIComponent(s.id)}">Les faktaarket →</a>
    </article>`).join('')}</div></section>`;
}
