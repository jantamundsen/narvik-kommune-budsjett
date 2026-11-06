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
  // «figurer»: charts typed into config/saker.json. «avvik» is bars for deviations from budget, one set per «valg»
  // (a year) with buttons to switch; «linjer» is small line charts. A figure with «i» goes at the top of that
  // section, under its heading; one without is a section of its own after the budget table.
  const figs = S.figurer || [];
  const figChart = f => {
    if (f.type === 'avvik') {
      const vals = f.valg.flatMap(v => [...v.rader, ...(v.sum ? [v.sum] : [])].map(r => r.verdi));
      const dom = [Math.min(0, ...vals), Math.max(0, ...vals)];
      const pick = f.valg.length > 1 ? `<div class="seg fig-pick" role="radiogroup" aria-label="Velg år">${f.valg.map((v, i) => `<button type="button" role="radio" aria-checked="${!i}" data-i="${i}">${esc(v.navn)}</button>`).join('')}</div>` : '';
      return `${pick}${f.valg.map((v, i) => `<div class="fig-panel" data-i="${i}"${i ? ' hidden' : ''}>
          <div class="chart hb-chart" role="figure" aria-label="${esc(f.tittel || f.overskrift)}, ${esc(v.navn)}">${hbars(v.rader, v.sum, { dom, unit: f.enhet ? " " + f.enhet : "" })}</div>
          <p class="caption">${v.tekst ? esc(v.tekst) + ' ' : ''}Kilde: ${note(v.kilde)}.</p></div>`).join('')}
        ${f.merknad ? `<p class="caption">${esc(f.merknad)}</p>` : ''}`;
    }
    const panels = f.grafer.map(g => {
      const d = g.desimaler ?? 0, h = g.hittil, unit = g.enhet === '%' ? ' %' : ' ' + g.enhet;
      const prev = h && String(Number(h.periode.slice(-4)) - 1);
      return { navn: g.navn, unit: g.enhet, digits: d, years: g.punkter.map(p => p.aar), series: [{ navn: g.navn, vals: Object.fromEntries(g.punkter.map(p => [p.aar, p.verdi])) }],
        under: h ? `${esc(h.periode)}: ${nb(h.verdi, d)}${esc(unit)}${h.fjor != null ? `, ${chgText(pct(h.verdi, h.fjor))} fra samme måneder i ${prev} (${nb(h.fjor, d)})` : ''}` : '' };
    });
    const ks = [...new Map(f.grafer.flatMap(g => [...g.punkter.map(p => p.kilde), ...(g.hittil ? [g.hittil.kilde] : [])]).map(k => [k.id + '/' + k.side, k])).values()];
    return `${miniLines(panels)}<p class="caption">${f.merknad ? esc(f.merknad) + ' ' : ''}Kilder: ${note(ks)}.</p>`;
  };
  const figIn = id => figs.filter(f => f.i === id).map(f => `<div class="sak-fig" id="${esc(f.id)}"><h3 class="sub-h">${esc(f.overskrift)}</h3>${f.lead ? `<p>${esc(f.lead)}</p>` : ''}${figChart(f)}</div>`).join('');
  const ownFigs = figs.filter(f => !f.i).map(f => `<section aria-labelledby="h-${esc(f.id)}" id="${esc(f.id)}">
      <div class="section-head"><h2 id="h-${esc(f.id)}">${esc(f.overskrift)}</h2>${f.lead ? `<p class="lead">${esc(f.lead)}</p>` : ''}</div>
      ${figChart(f)}
    </section>`).join('');
  // A table with one source per row: the budget table («tabell») and any further tables («tabeller»).
  const sakTable = (T, id, head, lead) => `<section aria-labelledby="h-${id}" id="${id}">
      <div class="section-head"><h2 id="h-${id}">${esc(head)}</h2>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</div>
      ${figIn(id)}${figIn(id) ? `<h3 class="sub-h">${esc(T.tittel)}</h3>` : ''}
      <div class="ptable"><table class="sak-table"><caption class="sr-only">${esc(T.tittel)}</caption>
        <thead><tr>${T.kolonner.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${T.rader.map(r => `<tr>${r.celler.map(c => `<td${String(c).length <= 12 ? ' class="nw"' : ''}>${esc(c)}</td>`).join('')}<td class="muted">${note(r.kilde)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="caption">${esc(T.tittel)}. ${esc(T.merknad || '')}</p>
    </section>`;
  const tab = S.tabell ? sakTable(S.tabell, 'budsjett', 'Budsjett og regnskap') : '';
  const tables = (S.tabeller || []).map(T => sakTable(T, T.id, T.overskrift, T.lead)).join('');
  const savings = S.tiltak_omrade ? await savingsSection(S.tiltak_omrade) : '';
  const inst = S.ssb_institusjon ? await institutionTables(sources) : '';
  // Numbers that are not published, each with what exists instead and a link to «Tall som ikke er publisert».
  (S.savner || []).forEach(m => m.kilde && [].concat(m.kilde).forEach(k => sources.set(k.id, D.kilder[k.id])));
  const missing = S.savner?.length ? `<section aria-labelledby="h-savner" id="savner">
      <div class="section-head"><h2 id="h-savner">Det som ikke er publisert</h2>
        <p class="lead">Tall som ville vist mer om hvor kostnadene oppstår, men som jeg ikke har funnet i offentlige dokumenter. Hvert punkt sier hva som finnes i stedet.</p></div>
      <ul class="fact-list">${S.savner.map(m => `<li class="fact"><p><strong>${esc(m.tittel)}.</strong> ${esc(m.tekst)}</p><p class="caption fact-src">${m.kilde ? `Kilde: ${srcGroup([].concat(m.kilde))} · ` : ''}${m.se ? `<a href="${esc(m.se.href)}">${esc(m.se.navn)}</a> · ` : ''}<a href="${esc(m.href)}">Tall som ikke er publisert</a></p></li>`).join('')}</ul>
    </section>` : '';
  const role = `<section aria-labelledby="h-role" id="rolle">
      <div class="section-head"><h2 id="h-role">Kommunens rolle og penger</h2></div>
      <ul class="fact-list">${S.rolle.map(r => `<li class="fact"><p>${esc(r.tekst)}</p><p class="caption fact-src">Kilde: ${note(r.kilde)}</p></li>`).join('')}</ul>
    </section>`;
  // Topics such as jobs or environment, each a short list of sourced points.
  (S.temaer || []).forEach(t => t.punkter.forEach(p => [].concat(p.kilde).forEach(k => sources.set(k.id, D.kilder[k.id]))));
  const topics = (S.temaer || []).map((t, n) => `<section aria-labelledby="h-topic-${n}"${t.id ? ` id="${esc(t.id)}"` : ''}>
      <div class="section-head"><h2 id="h-topic-${n}">${esc(t.tittel)}</h2></div>
      <ul class="fact-list">${t.punkter.map(p => `<li class="fact${isMedia(p.kilde) ? ' fact-media' : ''}">${mediaTag(p)}${p.sitat ? quote(p) : `<p>${esc(p.tekst)}</p>`}<p class="caption fact-src">Kilde: ${srcGroup([].concat(p.kilde))}</p></li>`).join('')}</ul>
    </section>`).join('');
  // Newest first. The config keeps them oldest first (build_saker.py checks the order); after the first few,
  // the rest are behind a button so a long timeline doesn't push the rest of the page down.
  const SHOWN = 5, events = [...S.tidslinje].reverse();
  const time = `<section aria-labelledby="h-time" id="tidslinje">
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
  // A newspaper or NRK article is listed by outlet, date and a neutral subject («om»); the headline stays in the hover text.
  const docList = list => `<ul class="doc-list">${list.map(s => `<li><a href="${esc(s.url || s.pdf)}" target="_blank" rel="noopener"${s.om ? ` title="${esc(s.full)}"` : ''}>${esc(s.om ? `${s.navn}, om ${s.om}` : s.full)}</a>${s.url && s.pdf ? ` · <a href="${esc(s.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}</li>`).join('')}</ul>`;
  const media = [...sources.values()].filter(s => s.type === 'media');
  const docs = `<section aria-labelledby="h-docs">
      <div class="section-head"><h2 id="h-docs">Dokumentene</h2>
        <p class="lead">Alle kildene for saken. Har jeg oversett et vedtak eller et dokument, <a href="om#feil">si fra</a>.</p></div>
      ${docList([...sources.values()].filter(s => s.type !== 'media'))}
      ${media.length ? `<h3 class="doc-sub">Medieoppslag</h3><p class="caption">Artikler som utsagnene og medieoppslagene over er hentet fra.</p>${docList(media)}` : ''}
    </section>`;

  // A long sheet (one with further tables) starts with jump links to its sections, in the order they come, and
  // keeps «Hvem er involvert» until after the numbers.
  const long = !!S.tabeller?.length;
  const parts = [[tab, 'budsjett', 'Budsjett og regnskap'], ...figs.filter(f => !f.i).map(f => [ownFigs, f.id, f.overskrift]), ...(S.tabeller || []).map(T => [tables, T.id, T.overskrift]),
    [savings, 'innsparinger', 'Innsparingene'], [inst, 'forskjell', 'Hvor forskjellen mot lignende kommuner ligger'],
    [inst, 'institusjon', 'Sykehjem og institusjoner'], [inst, 'plasser-brukere', 'Plasser og beboere som ikke går opp'], [missing, 'savner', 'Det som ikke er publisert'], [time, 'tidslinje', 'Tidslinje']];
  const jump = long ? `<nav class="jump" aria-label="Innhold på siden"><span class="eyebrow">På siden</span><ul>${parts.filter(([html, id]) => html && html.includes(`id="${id}"`)).map(([, id, name]) => `<li><a href="#${id}">${esc(name)}</a></li>`).join('')}</ul></nav>` : '';
  // «Kort oppsummert»: the main numbers in a few sentences, each pointing to the section with its sources.
  const summary = S.oppsummering?.length ? `<section aria-labelledby="h-sum" id="oppsummert">
      <div class="section-head"><h2 id="h-sum">Kort oppsummert</h2><p class="lead">Hovedtallene på siden. Kildene står i seksjonen hvert punkt lenker til.</p></div>
      <ul class="fact-list">${S.oppsummering.map(o => `<li class="fact"><p>${esc(o.tekst)}</p><p class="caption fact-src"><a href="${esc(o.lenke)}">Les mer</a></p></li>`).join('')}</ul>
    </section>` : '';
  main.innerHTML = `<header>
      <nav class="crumbs" aria-label="Brødsmuler"><a href="saker">Utvalgte saker</a><span aria-hidden="true">›</span><span aria-current="page">${esc(S.tittel)}</span></nav>
      <div class="eyebrow">Sist kontrollert ${dateText(S.kontrollert)}</div>
      <h1>${esc(S.tittel)}</h1>
      <p class="lead">${esc(S.ingress)}</p>
      ${S.mangler ? `<p class="status-note">${esc(S.mangler)}</p>` : ''}
    </header>
    <section aria-label="Nøkkeltall"><div class="stats3 sak-stats" style="--n:${S.nokkeltall.length}">${stats}</div></section>
    ${summary}${jump}${long ? '' : actors}${tab}${ownFigs}${role}${tables}${savings}${inst}${missing}${long ? actors : ''}${topics}${time}${facts}${links}${docs}`;
  document.getElementById('tl-more')?.addEventListener('click', e => {
    document.querySelectorAll('#timeline li[hidden]').forEach(li => { li.hidden = false; });
    e.currentTarget.remove();
  });
  document.querySelectorAll('.sak-table').forEach(stackable);
  // Year buttons over a figure: show that year's bars.
  document.querySelectorAll('.fig-pick').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    g.parentElement.querySelectorAll('.fig-panel').forEach(p => { p.hidden = p.dataset.i !== b.dataset.i; });
  }));
  // The page is drawn after the data has loaded, so the browser cannot jump to #institusjon by itself.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();

// «Sykehjem og institusjoner i SSB-tallene» for a case with "ssb_institusjon": true. The numbers come from
// data/eldre.json and data/malgruppe.json, which the weekly data job updates, so they are not typed into saker.json.
// Narvik against the KOSTRA group only, every year SSB has, with a source under each table. No interpretation.
async function institutionTables(sources) {
  const get = u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [E, M, DT] = await Promise.all([get('data/eldre.json'), get('data/malgruppe.json'), get('data/detaljer.json')]);
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
  // Net running costs and premises for the institutions in the newest year, in mill. kr, with the change from the year before.
  const fy = DT?.years || [], fv = DT?.values?.konsern || {}, last = fy.length - 1;
  const net = f => fv[f]?.[DT.net_art];
  const P = I.dognpris, pv = P.values, pys = Object.keys(pv.narvik || {});
  if (net('253') && net('261') && last > 0) {
    const stat = (label, v, prev, unit, text) => `<div class="stat"><span class="sub">${esc(label)}</span><span class="big num">${v}<small> ${unit}</small></span><span class="sub">${text} (${chgText(pct(...prev))} fra året før)</span></div>`;
    const py = pys.at(-1), pp = pys.at(-2);
    sources.set('ssb-12362', { full: 'SSB, tabell 12362: netto driftsutgifter per funksjon', url: 'https://www.ssb.no/statbank/table/12362' });
    html += `<div class="stats3 sak-stats" style="--n:3">
        ${stat(`Drift av sykehjem og institusjoner i ${fy[last]}`, nb(net('253')[last] / 1000, 1), [net('253')[last], net('253')[last - 1]], 'mill. kr', 'netto driftsutgifter, funksjon 253')}
        ${stat(`Lokaler til institusjonene i ${fy[last]}`, nb(net('261')[last] / 1000, 1), [net('261')[last], net('261')[last - 1]], 'mill. kr', 'netto driftsutgifter, funksjon 261')}
        ${py && pp ? stat(`Utgift per oppholdsdøgn i ${py}`, nb(pv.narvik[py]), [pv.narvik[py], pv.narvik[pp]], 'kr', 'drift og lokaler per døgn') : ''}
      </div>
      <p class="caption">Hele kommunen med foretak. SSB samler alle sykehjemmene og de andre institusjonene i de to funksjonene, så tallene sier ikke hvordan kostnadene fordeler seg mellom sykehjemmene. Kilde: <a href="https://www.ssb.no/statbank/table/12362" target="_blank" rel="noopener">SSB, tabell 12362</a> og <a href="${esc(P.url)}" target="_blank" rel="noopener">tabell ${P.table}</a>.</p>`;
  }
  // Three small line charts before the tables: places and residents, residents per 100 places, and the price per day,
  // Narvik against the group. Each from zero on its own scale.
  {
    const pl = (E.ssb || []).find(x => x.key === 'plasser'), U = I.brukere?.values;
    const users = (r, y) => U?.[r]?.['F000-120']?.[y]?.antall;
    const ys = pl ? Object.keys(pl.values.narvik || {}).filter(y => users('narvik', y)) : [];
    const per100 = r => Object.fromEntries(ys.filter(y => users(r, y) && pl.values[r]?.[y]).map(y => [y, users(r, y) / pl.values[r][y] * 100]));
    if (ys.length > 1 && pys.length > 1) {
      html += `<h3 class="sub-h">Plasser, beboere og utgift per døgn</h3>
        ${miniLines([
          { navn: 'Plasser og beboere i Narvik', zero: false, years: ys, series: [{ navn: 'Plasser', vals: Object.fromEntries(ys.map(y => [y, pl.values.narvik[y]])), cls: 'alt' }, { navn: 'Beboere 31. desember', vals: Object.fromEntries(ys.map(y => [y, users('narvik', y)])) }] },
          { navn: 'Beboere per 100 plasser', zero: false, years: ys, series: [{ navn: 'Narvik', vals: per100('narvik') }, { navn: G, vals: per100('gruppe'), cls: 'alt' }] },
          { navn: 'Utgift per oppholdsdøgn', unit: 'kroner', zero: false, years: pys, series: [{ navn: 'Narvik', vals: pv.narvik }, { navn: G, vals: pv.gruppe || {}, cls: 'alt' }] },
        ])}
        <p class="caption">Grafene starter ikke på null, så forskjeller og endringer ser større ut enn de er. Beboere er personer med institusjonstjenester 31. desember. Beboere per 100 plasser er beregnet her. Utgift per døgn i løpende kroner. Tallene står i tabellene under. Kilde: ${ssbSrc(pl.table, pl.query, 'plasser i institusjon')}, ${ssbSrc(I.brukere.table, I.brukere.query, 'omsorgstjenester, brukere etter alder')} og ${ssbSrc(P.table, P.query, 'utvalgte nøkkeltall for helse og omsorg')}.</p>`;
    }
  }
  // Places, users and the price per day in Narvik, year by year, so the three can be read together.
  const pl = (E.ssb || []).find(x => x.key === 'plasser'), un = I.brukere?.values?.narvik;
  if (pl && un && pys.length) {
    const ys = pys.filter(y => pl.values.narvik?.[y] != null || un['F000-120']?.[y]);
    const chg = (o, y, i) => (i && o[y] != null && o[ys[i - 1]] != null ? chgText(pct(o[y], o[ys[i - 1]])) : null);
    html += `<h3 class="sub-h">Plasser, brukere og utgift per døgn i Narvik</h3>
      ${table('Narvik', ys, [
        { name: 'Plasser i institusjon', cell: y => (pl.values.narvik[y] == null ? null : nb(pl.values.narvik[y], pl.values.narvik[y] % 1 ? 1 : 0)) },
        { name: 'Brukere, alle aldre', cell: y => (un['F000-120']?.[y] ? nb(un['F000-120'][y].antall) : null) },
        { name: 'Brukere 80 år og over', cell: y => (un['F080-120']?.[y] ? nb(un['F080-120'][y].antall) : null) },
        { name: 'Utgift per oppholdsdøgn, kr', sum: true, cell: y => (pv.narvik[y] == null ? null : nb(pv.narvik[y])) },
        { name: 'Utgift per døgn, endring fra året før', cell: y => chg(pv.narvik, y, ys.indexOf(y)) },
      ])}
      <p class="caption">Brukerne er personer som hadde institusjonstjenester 31. desember, både langtidsopphold og korttidsopphold. Plassene er alle plasser i institusjon ved utgangen av året. Utgiften per døgn er i løpende kroner. · betyr at SSB ikke har tall. Kilde: ${ssbSrc(pl.table, pl.query, 'plasser i institusjon')}, ${ssbSrc(I.brukere.table, I.brukere.query, 'omsorgstjenester, brukere etter alder')} og ${ssbSrc(P.table, P.query, 'utvalgte nøkkeltall for helse og omsorg')}.</p>`;
  }
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
  if (pys.length) {
    html += `<h3 class="sub-h">Utgifter per oppholdsdøgn i institusjon, kroner</h3>
      ${table('Kr per døgn', pys, [
        { name: 'Narvik', sum: true, cell: y => (pv.narvik[y] == null ? null : nb(pv.narvik[y])) },
        { name: G, cell: y => (pv.gruppe?.[y] == null ? null : nb(pv.gruppe[y])) },
        { name: `Narvik mot ${G}`, cell: y => vs(pv.narvik[y], pv.gruppe?.[y]) },
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
  return `${gapSection(M, E, G, ssbSrc)}<section aria-labelledby="h-inst" id="institusjon">
      <div class="section-head"><h2 id="h-inst">Sykehjem og institusjoner i SSB-tallene</h2>
        <p class="lead">Tall fra SSBs KOSTRA-statistikk for Narvik og snittet i ${G}, kommunene SSB regner som sammenlignbare. KOSTRA deler tjenestene inn på en annen måte enn kommunalområdet i tabellen over (<a href="okonomi#inndeling">hvorfor tallene er ulike</a>). Tallene oppdateres når SSB publiserer nye. Flere sammenligninger står på <a href="utgifter/helse#institusjon">Helse og omsorg</a>.</p></div>
      ${html}
    </section>${placesSection(E, G, ssbSrc, table)}`;
}

// «Plasser og beboere som ikke går opp»: institution places (11875) next to the people in an institution on
// 31 December (12003), Narvik and the KOSTRA group, and the kommune's own count of days with patients waiting at the
// hospital. Two registers that are not built to be compared, so the page says what the numbers cannot tell.
function placesSection(E, G, ssbSrc, table) {
  const pl = (E?.ssb || []).find(x => x.key === 'plasser'), U = E?.institusjon?.brukere;
  if (!pl || !U) return '';
  const ys = Object.keys(pl.values.narvik || {}).filter(y => U.values.narvik?.['F000-120']?.[y]);
  if (!ys.length) return '';
  const users = (r, y) => U.values[r]?.['F000-120']?.[y]?.antall;
  const per100 = (r, y) => (users(r, y) && pl.values[r]?.[y] ? nb(users(r, y) / pl.values[r][y] * 100) : null);
  const ol = Object.fromEntries((E.kommunens_overliggerdogn || []).filter(o => o.periode === 'hele året').map(o => [o.aar, o.dogn]));
  const last = ys.at(-1);
  return `<section aria-labelledby="h-plasser" id="plasser-brukere">
      <div class="section-head"><h2 id="h-plasser">Plasser og beboere som ikke går opp</h2>
        <p class="lead">Narvik har hatt færre beboere i institusjon enn plasser ved hvert årsskifte siden ${ys[0]}: ${nb(users('narvik', last))} beboere på ${nb(Math.round(pl.values.narvik[last]))} plasser 31. desember ${last}. I snitt i ${esc(G)} er det flere beboere enn plasser. Samtidig har kommunen betalt for hundrevis av døgn der utskrivningsklare pasienter ventet på sykehuset på et kommunalt tilbud. Tallene under viser dette side om side.</p></div>
      ${table('', ys, [
        { name: 'Plasser i institusjon, Narvik', cell: y => nb(pl.values.narvik[y], pl.values.narvik[y] % 1 ? 1 : 0) },
        { name: 'Beboere 31. desember, Narvik', cell: y => nb(users('narvik', y)) },
        { name: 'Beboere per 100 plasser, Narvik', sum: true, cell: y => per100('narvik', y) },
        { name: `Beboere per 100 plasser, ${G}`, cell: y => per100('gruppe', y) },
        { name: 'Døgn med utskrivningsklare pasienter på sykehuset, Narvik', cell: y => (ol[y] == null ? null : nb(ol[y])) },
      ])}
      <p class="caption">Plassene og beboerne kommer fra to ulike registreringer hos SSB. Plassene er alle plasser i institusjon ved utgangen av året, også for korttidsopphold. Beboerne er personer som hadde institusjonstjenester 31. desember. Beboere per 100 plasser er beregnet her. Døgnene med utskrivningsklare pasienter er kommunens egne tall fra årsrapportene (2022 s. 36, 2023 s. 14, 2024 s. 44, 2025 s. 45). · betyr at tallet ikke finnes. Kilde: ${ssbSrc(pl.table, pl.query, 'plasser i institusjon')} og ${ssbSrc(U.table, U.query, 'omsorgstjenester, brukere etter alder')}.</p>
      <h3 class="sub-h">Det tallene ikke sier</h3>
      <ul class="plain-list">
        <li>Om plassene står tomme. En plass kan være registrert uten å være i bruk, for eksempel når det mangler bemanning eller en avdeling er under avvikling. Ankenes bo- og servicesenter var i drift fram til midten av februar 2026.</li>
        <li>Hvilke typer plasser som er i bruk, og om de passer for pasientene som venter på sykehuset.</li>
        <li>Hvor fullt hvert sykehjem er. SSBs nøkkeltall for belegg (tabell 12293) står med 0 for alle kommuner de siste årene, og kommunen publiserer ikke belegget per sykehjem.</li>
      </ul>
      <p class="caption">Ankenes: Tertialrapport 1/2026, s. 26. <a href="om#savner-sykehjemsplass">Tall som ikke er publisert</a></p>
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
// «Hvor forskjellen ligger»: the omsorg services per inhabitant 67+ in the newest year, Narvik against the KOSTRA
// group, one row per service so the rows add up to the total. Then the institution users 67+ per age group, with
// how many Narvik would have had at the group's share. Both are computed here and marked so. Facts only.
function gapSection(M, E, G, ssbSrc) {
  const I = E?.institusjon;
  const ms = (M?.measures || []).filter(x => x.area === 'helse' && x.key === '67');
  const total = ms.find(x => x.service === null);
  if (!total) return '';
  const rows = [
    ['253', 'Sykehjem og andre institusjoner (253)'],
    ['261', 'Lokaler til institusjonene (261)'],
    ['hjemmetjenester', 'Hjemmetjenester (254, 257, 258)'],
    ['234', 'Aktivitet og service for eldre (234)'],
  ].map(([k, name]) => ({ name, m: ms.find(x => x.service === k) })).filter(r => r.m);
  const y = Object.keys(total.values.narvik).filter(k => total.values.narvik[k] != null && total.values.gruppe?.[k] != null).pop();
  if (!y) return '';
  const cell = m => ({ n: m.values.narvik[y], g: m.values.gruppe[y] });
  const T0 = cell(total);
  const sign = d => (d > 0 ? '+' : d < 0 ? '−' : '') + nb(Math.abs(Math.round(d)));
  const line = (name, m, sum) => {
    const { n, g } = cell(m);
    return `<tr${sum ? ' class="sum"' : ''}><td>${esc(name)}</td><td>${nb(n)}</td><td>${nb(g)}</td><td>${sign(n - g)}</td><td>${chgText(pct(n, g))}</td></tr>`;
  };
  const T = cell(total);
  // The same rows as bars first: kroner more or less than the group per inhabitant 67+, blue and grey as on /okonomi.
  const bars = hbars(rows.map(r => ({ navn: r.name, verdi: cell(r.m).n - cell(r.m).g })), { navn: 'Omsorgstjenestene i alt', verdi: T0.n - T0.g }, { unit: ' kr', digits: 0, tone: 'cmp' });
  let html = `<h3 class="sub-h">Narvik mot ${esc(G)} per innbygger 67 år og over i ${y}, kroner</h3>
    <div class="chart hb-chart" role="figure" aria-label="Kroner mer eller mindre enn ${esc(G)} per innbygger 67 år og over, ${y}">${bars}</div>
    <p class="caption">Kroner mer (+) eller mindre (−) enn snittet i ${esc(G)}. Tallene og kildene står i tabellen under.</p>
    <h3 class="sub-h">Omsorgstjenester per innbygger 67 år og over i ${y}, kroner</h3>
    <div class="detail-scroll"><table class="num-table"><tr><th>KOSTRA-funksjon</th><th>Narvik</th><th>${esc(G)}</th><th>Forskjell, kr</th><th>Narvik mot ${esc(G)}</th></tr>
      ${rows.map(r => line(r.name, r.m)).join('')}${line('Omsorgstjenestene i alt', total, true)}</table></div>
    <p class="caption">Netto driftsutgifter per funksjon, kommunekonsern, delt på innbyggere 67 år og over 1. januar året etter. Beregnet her fordi SSB ikke publiserer tallet. De fire radene summerer seg til omsorgstjenestene i alt. Aktivitet og service for eldre (234) gjelder også yngre brukere, men er delt på innbyggere 67 år og over som de andre radene. Kilde: ${ssbSrc(total.table, total.query, 'netto driftsutgifter per funksjon')} og ${ssbSrc(total.population.table, total.population.query, 'befolkning etter alder')}.</p>`;
  // Users 67+ per age group, and how many Narvik would have had with the group's share of each age group.
  const U = I?.brukere, uy = U && Object.keys(U.values.narvik?.['F080-120'] || {}).pop();
  if (uy) {
    const ages = [['F067-079', '67–79 år'], ['F080-120', '80 år og over']];
    let sumN = 0, sumE = 0;
    const urows = ages.map(([code, name]) => {
      const n = U.values.narvik[code]?.[uy], g = U.values.gruppe?.[code]?.[uy];
      if (!n?.per1000 || g?.per1000 == null) return null;
      const exp = n.antall * g.per1000 / n.per1000;
      sumN += n.antall; sumE += exp;
      return `<tr><td>${name}</td><td>${nb(n.antall)}</td><td>${nb(Math.round(exp))}</td><td>${sign(n.antall - exp)}</td></tr>`;
    });
    // SSB's own share of 80+ with a stay in an institution is measured differently and can point the other way.
    const i80 = (E.ssb || []).find(x => x.key === 'inst80'), a = i80?.values.narvik?.[uy], b = i80?.values.gruppe?.[uy];
    const inst80 = a != null && b != null ? ` SSBs eget nøkkeltall for andelen innbyggere 80 år og over med opphold i institusjon, som måles på en annen måte, var ${nb(a, 1)} % i Narvik og ${nb(b, 1)} % i ${esc(G)} i ${uy}.` : '';
    if (urows.every(Boolean)) {
      html += `<h3 class="sub-h">Brukere av sykehjem og andre institusjoner i ${uy}, Narvik mot ${esc(G)}</h3>
        <p>Hvor mange eldre i Narvik som brukte institusjonene, og hvor mange det ville vært hvis like stor del av hver aldersgruppe brukte dem som i snitt i ${esc(G)}.</p>
        <div class="detail-scroll"><table class="num-table"><tr><th>Alder</th><th>Brukere i Narvik</th><th>Hvis Narvik var som snittet</th><th>Flere (+) eller færre (−)</th></tr>
          ${urows.join('')}<tr class="sum"><td>67 år og over</td><td>${nb(sumN)}</td><td>${nb(Math.round(sumE))}</td><td>${sign(sumN - sumE)}</td></tr></table></div>
        <p class="caption">«Hvis Narvik var som snittet» er antall innbyggere i Narvik i aldersgruppen ganget med andelen brukere i ${esc(G)}. Beregnet her. Andelene per 1 000 innbyggere står i tabellen «Brukere av institusjonstjenester per 1 000 innbyggere i aldersgruppen» under. Brukere er personer som hadde institusjonstjenester 31. desember, både langtidsopphold og korttidsopphold, ikke antall døgn eller plasser. Aldersgruppene er små, så noen få brukere endrer tallene mye.${inst80} Kilde: ${ssbSrc(U.table, U.query, 'omsorgstjenester, brukere etter alder')}${inst80 ? ` og ${ssbSrc(i80.table, i80.query, 'utvalgte nøkkeltall for helse og omsorg')}` : ''}.</p>`;
    }
  }
  const P = I?.dognpris?.values, py = P && Object.keys(P.narvik || {}).pop();
  const priceText = py && P.gruppe?.[py] != null
    ? ` Et oppholdsdøgn i institusjon kostet ${nb(P.narvik[py])} kr i Narvik og ${nb(P.gruppe[py])} kr i snitt i ${esc(G)} i ${py} (${chgText(pct(P.narvik[py], P.gruppe[py]))}), se «Sykehjem og institusjoner» under.` : '';
  return `<section aria-labelledby="h-gap" id="forskjell">
      <div class="section-head"><h2 id="h-gap">Hvor forskjellen mot lignende kommuner ligger</h2>
        <p class="lead">Narvik brukte ${nb(T.n)} kr per innbygger 67 år og over på omsorgstjenester i ${y}, mot ${nb(T.g)} kr i snitt i ${esc(G)} (${chgText(pct(T.n, T.g))}). Tabellene viser hvilke tjenester forskjellen ligger i, og hvor mange som bruker institusjonene.${priceText} Tallene er fra SSBs KOSTRA-statistikk, som deler tjenestene inn på en annen måte enn kommunalområdet i «Budsjett og regnskap» (<a href="okonomi#inndeling">hvorfor tallene er ulike</a>).</p></div>
      ${html}
    </section>`;
}
// «Innsparingene»: the cuts in the newest adopted budget for one area, from data/tiltak.json (the same data and rules
// as tiltak.html), with what the kommune's reports say happened to each, and the total for the whole kommune.
async function savingsSection(area) {
  const T = await fetch('data/tiltak.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const y = T && Object.keys(T.sources).filter(k => T.sources[k].status === 'vedtatt').pop();
  if (!y) return '';
  const LABEL = { 'gjennomfort': 'Gjennomført', 'i-arbeid': 'I arbeid', 'forsinket': 'Forsinket eller mindre effekt', 'ikke-gjennomfort': 'Ikke gjennomført', 'ikke-oppgitt': 'Nevnt uten status', 'reversert': 'Tatt ut av kommunestyret', 'ingen': 'Ingen status i rapportene' };
  const cut = l => (l.uten_belop ? 0 : -l['1000kr'][y]), back = l => Math.min(cut(l), l.reversert?.[y] || 0);
  const status = l => l.oppfolging?.status || (back(l) > 0 && back(l) >= cut(l) ? 'reversert' : 'ingen');
  const kept = l => cut(l) - back(l);
  const mk = v => nb(v / 1000, 1);
  const sum = (list, f) => list.reduce((s, l) => s + f(l), 0);
  const all = T.lines.filter(l => l.aar === y && l.innsparing);
  const mine = all.filter(l => l.omrade === area);
  if (!mine.length) return '';
  const name = T.areas.find(a => a.key === area)?.name || area;
  const facts = list => {
    const S = list.filter(l => !l.uten_belop), by = {};
    S.forEach(l => { const s = status(l); if (s !== 'reversert') by[s] = (by[s] || 0) + kept(l); });
    return { total: sum(S, cut), back: sum(S, back), by, n: S.length };
  };
  const A = facts(mine), K = facts(all);
  const reported = ['gjennomfort', 'i-arbeid', 'forsinket', 'ikke-gjennomfort'];
  const part = (F, keys) => keys.filter(k => F.by[k]).map(k => `${mk(F.by[k])} mill. kr ${LABEL[k].toLowerCase()}`);
  const silent = F => (F.by['ingen'] || 0) + (F.by['ikke-oppgitt'] || 0);
  const line = F => `${mk(F.total)} mill. kr${F.back ? `, der kommunestyret tok ut ${mk(F.back)} mill. kr i samme vedtak` : ''}. Av resten er ${[...part(F, reported), `${mk(silent(F))} mill. kr uten status i rapportene`].join(', ')}`;
  // The area's cuts as one bar split by what the reports say happened, in the order of the sankey on tiltak.html:
  // blue where a report gives a status, grey where it doesn't, light grey for what the kommunestyre took out.
  const ORDER = ['gjennomfort', 'i-arbeid', 'forsinket', 'ikke-gjennomfort', 'ikke-oppgitt', 'ingen'];
  const segs = [...ORDER.filter(k => A.by[k] > 0).map(k => [k, LABEL[k], A.by[k]]), ...(A.back ? [['reversert', LABEL.reversert, A.back]] : [])];
  const done = mine.filter(l => status(l) === 'gjennomfort');
  const stack = `<div class="chart stack-chart" role="figure" aria-label="Innsparingene i ${esc(name)} for ${y} etter status: ${segs.map(([, n, v]) => `${n} ${mk(v)} mill. kr`).join(', ')}">
      <div class="stack-bar">${segs.map(([k, n, v]) => `<span class="st-${k}" style="flex-basis:${(v / A.total * 100).toFixed(2)}%" title="${esc(n)}: ${mk(v)} mill. kr">${v / A.total > 0.08 ? mk(v) : ''}</span>`).join('')}</div>
      <ul class="flow-legend stack-legend">${segs.map(([k, n, v]) => `<li><i class="st-${k}"></i>${esc(n)}: <b class="num">${mk(v)}</b></li>`).join('')}</ul>
    </div>
    <p class="caption">Mill. kr av ${mk(A.total)} mill. kr i kutt for ${y}.${A.by.gjennomfort ? '' : ` Ingen kutt med beløp er meldt gjennomført.`}${done.some(l => l.uten_belop) ? ` ${done.filter(l => l.uten_belop).length === 1 ? 'Ett kutt' : 'Noen kutt'} uten beløp er gjennomført og står i tabellen under.` : ''}</p>`;
  const rows = [...mine].sort((a, b) => cut(b) - cut(a)).map(l => `<tr><td>${esc(l.navn)}</td><td>${l.uten_belop ? 'uten beløp' : mk(cut(l))}</td><td>${esc(LABEL[status(l)])}</td></tr>`).join('');
  return `<section aria-labelledby="h-sav" id="innsparinger">
      <div class="section-head"><h2 id="h-sav">Innsparingene i budsjettet for ${y}</h2>
        <p class="lead">Budsjettet kommunestyret vedtok for ${y}, hadde innsparinger i ${esc(name)} på ${line(A)}. For hele kommunen var innsparingene ${line(K)}.</p></div>
      ${stack}
      <h3 class="sub-h">Tiltak for tiltak</h3>
      <div class="ptable"><table class="sak-table"><caption class="sr-only">Innsparingene i ${esc(name)} i budsjettet for ${y}</caption>
        <thead><tr><th scope="col">Tiltak</th><th scope="col">Mill. kr i ${y}</th><th scope="col">Status i rapportene</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="caption">«Ingen status i rapportene» betyr at jeg ikke har funnet tiltaket omtalt i tertialrapportene eller årsrapporten, ikke at kuttet ikke ble gjort. «Uten beløp» er tiltak som står med 0 eller 1 000 kr i budsjettet. Beløpene er fra kommunens budsjett i Framsikt. Statusene, med side i rapportene, og alle tiltakene i kommunen står på <a href="tiltak?aar=${y}">Innsparinger</a>.</p>
    </section>`;
}

// Charts for the fact sheets. Plain HTML and SVG strings, drawn into the page with the rest of the sheet.
// Horizontal bars from a zero line with the value at the end of each bar, like the comparison on /okonomi.
// tone 'budget' is for deviations from budget: red over, green under (the only place the site uses red and green).
// tone 'cmp' is for comparisons with other kommuner: blue more, grey less. dom = [lo, hi] shares a scale between sets.
function hbars(rows, sum, { unit = '', digits = 1, tone = 'budget', dom } = {}) {
  const all = [...rows, ...(sum ? [sum] : [])].map(r => r.verdi);
  const [min, max] = dom || [Math.min(0, ...all), Math.max(0, ...all)];
  // Room beyond the longest bar for its label, which can be long («+83,9 mill. kr»).
  const room = (0.08 + 0.022 * (6 + unit.length)) * (max - min);
  const lo = min < 0 ? min - room : 0, hi = max > 0 ? max + room : 0;
  const pos = v => (v - lo) / (hi - lo) * 100, z = pos(0);
  const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + nb(Math.abs(v), digits);
  const cls = v => (tone === 'budget' ? (v > 0 ? 'over' : 'under') : (v > 0 ? 'more' : 'less'));
  const row = (r, isSum) => `<div class="hb-row${isSum ? ' sum' : ''}"><div class="hb-name">${esc(r.navn)}${r.tekst ? `<small>${esc(r.tekst)}</small>` : ''}</div>
    <div class="hb-track" style="--z:${z.toFixed(2)}%"><span class="hb-bar ${cls(r.verdi)}" style="left:${Math.min(z, pos(r.verdi)).toFixed(2)}%;width:${Math.max(0.4, Math.abs(pos(r.verdi) - z)).toFixed(2)}%"></span><span class="hb-val num ${r.verdi < 0 ? 'neg' : ''}" style="${r.verdi < 0 ? `right:${(100 - pos(r.verdi)).toFixed(2)}%` : `left:${pos(r.verdi).toFixed(2)}%`}">${sign(r.verdi)}${unit ? `<span class="hb-unit">${unit}</span>` : ''}</span></div></div>`;
  return `<div class="hbars">${rows.map(r => row(r)).join('')}${sum ? row(sum, true) : ''}</div>`;
}

// Small line charts side by side, each on its own scale from zero, every point labelled with its value.
// A panel: { navn, years, series: [{ navn, vals: {year: value}, cls }], digits, unit, under }.
function miniLines(panels) {
  const W = 240, H = 128, padX = 22, top = 22, base = 100;
  const card = p => {
    const ys = p.years, vs = p.series.flatMap(s => ys.map(y => s.vals[y]).filter(v => v != null));
    // From zero, or (zero: false) from a little under the lowest value, so the gap between two lines shows.
    const max = Math.max(...vs), min = p.zero === false ? Math.min(...vs) : 0, lo = p.zero === false ? min - (max - min) * 0.6 : 0, hi = max + (max - lo) * 0.08;
    const X = i => (ys.length === 1 ? W / 2 : padX + i * (W - 2 * padX) / (ys.length - 1)), Y = v => base - (v - lo) / (hi - lo) * (base - top);
    const one = p.series.length === 1, d = p.digits ?? 0;
    let svg = `<line x1="${padX - 8}" x2="${W - padX + 8}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="var(--rule)"/>`;
    p.series.forEach(s => {
      const pts = ys.map((y, i) => (s.vals[y] == null ? null : [X(i), Y(s.vals[y]), s.vals[y]])).filter(Boolean);
      svg += `<path d="M${pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')}" class="ml-line ${s.cls || ''}"/>`;
      pts.forEach((q, i) => {
        svg += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.5" class="ml-dot ${s.cls || ''}"/>`;
        // One line: every value over its point. Two lines: only the last value, above the higher line and below the lower.
        if (one) svg += `<text x="${q[0].toFixed(1)}" y="${(q[1] - 8).toFixed(1)}" text-anchor="middle" class="ml-val">${nb(q[2], d)}</text>`;
      });
      if (!one) {
        const q = pts.at(-1), other = p.series.find(o => o !== s).vals[ys.at(-1)];
        const above = other == null || q[2] >= other;
        svg += `<text x="${(q[0] + 2).toFixed(1)}" y="${(q[1] + (above ? -8 : 16)).toFixed(1)}" text-anchor="end" class="ml-val">${nb(q[2], d)}</text>`;
      }
    });
    ys.forEach((y, i) => { if (ys.length <= 4 || i === 0 || i === ys.length - 1) svg += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ml-year">${y}</text>`; });
    const label = p.series.map(s => `${s.navn}: ${ys.filter(y => s.vals[y] != null).map(y => `${y} ${nb(s.vals[y], d)}`).join(', ')}`).join('. ');
    const legend = one ? '' : `<span class="ml-legend">${p.series.map(s => `<span><i class="${s.cls || ''}"></i>${esc(s.navn)}</span>`).join('')}</span>`;
    return `<div class="multiple ml-card"><span class="m-name">${esc(p.navn)}${p.unit ? `, ${esc(p.unit)}` : ''}</span>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.navn)}. ${esc(label)}">${svg}</svg>${legend}${p.under ? `<span class="m-sub">${p.under}</span>` : ''}</div>`;
  };
  return `<div class="multiples ml-grid">${panels.map(card).join('')}</div>`;
}
