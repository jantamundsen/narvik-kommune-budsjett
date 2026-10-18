// omrade.html: one tjenesteområde (?omrade=helse), one service in it (&tjeneste=253) or one cost or income
// type in that service (&art=lonn), for one year (&aar=2025). Netto and per capita come from site/data/narvik.json
// (SSB 12362); costs and income from site/data/detaljer.json (SSB 12367). Every number names its art code, or is
// marked «beregnet» when it is computed here. Helpers are in common.js.
let N, D, area, years, year, prev, scope;
const q = new URLSearchParams(location.search);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mill = (v, d = 1) => (v == null ? '·' : nb(v / 1000, d));
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const link = p => '?' + new URLSearchParams(Object.entries({ aar: year, omrade: area.key, omfang: scope === 'kasse' ? 'kasse' : '', ...p }).filter(([, v]) => v)).toString();
const chgSpan = (v, p, invert = false) => {
  const c = p ? pct(v, p) : null;
  if (c === null) return '<span class="chg">–</span>';
  const cls = Math.abs(c) < 0.5 ? '' : (c > 0) !== invert ? 'up' : 'down';
  return `<span class="chg ${cls}">${chgText(c)}</span>`;
};

async function start() {
  const page = document.getElementById('page');
  try {
    const [a, b] = await Promise.all(['data/narvik.json', 'data/detaljer.json'].map(u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
    N = a; D = b;
  } catch (e) {
    page.innerHTML = '<p class="lead">Fant ikke datafilene. Kjør <code>python scripts/fetch_data.py</code> og <code>python scripts/fetch_details.py</code>, og åpne siden via en webserver.</p>';
    return;
  }
  area = N.categories.find(c => c.key === q.get('omrade'));
  if (!area) { location.replace('./'); return; }
  years = D.years.filter(y => N.years.includes(y));
  year = years.includes(q.get('aar')) ? q.get('aar') : years.at(-1);
  prev = years[years.indexOf(year) - 1];
  scope = q.get('omfang') === 'kasse' ? 'kasse' : 'konsern';
  document.getElementById('generated').textContent = new Date(N.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

  const svc = services().find(s => s.key === q.get('tjeneste'));
  const grp = svc && D.groups.find(g => g.key === q.get('art'));
  page.innerHTML = grp ? typePage(svc, grp) : svc ? servicePage(svc) : areaPage();
  document.title = [grp?.name, svc?.name, area.name, 'Pengene i Narvik'].filter(Boolean).join(' · ');
}

// ---- data ----

// The services of an area: from config/categories.json where it names them, else one per KOSTRA function.
function services() {
  const listed = area.services || [];
  const taken = new Set(listed.flatMap(s => s.functions));
  const rest = area.functions.filter(f => !taken.has(f)).map(f => ({ key: f, name: N.functions[f]?.name || f, functions: [f] }));
  return [...listed, ...rest]
    .map(s => ({ ...s, functions: s.functions.filter(f => N.functions[f]) }))
    .filter(s => s.functions.length && years.some(y => net(s.functions, y)));
}
const net = (fs, y) => fs.reduce((t, f) => t + (N.functions[f].narvik_1000kr[y] ?? 0), 0);
const codes = fs => fs.filter(f => years.some(y => N.functions[f].narvik_1000kr[y] != null)).join(', ');

// One art summed over functions, per year (null when no function has it).
function art(fs, a) {
  const vals = D.values[scope];
  return D.years.map((_, i) => fs.reduce((t, f) => { const v = vals[f]?.[a]?.[i]; return v == null ? t : (t ?? 0) + v; }, null));
}
const plus = (a, b, sign = 1) => a.map((v, i) => (v == null && b[i] == null ? null : (v ?? 0) + sign * (b[i] ?? 0)));
const at = (series, y) => series[D.years.indexOf(y)];

// Groups with their per-year values, the sums per side, AGD2 and the gap between them.
function breakdown(fs) {
  const empty = D.years.map(() => null);
  const groups = D.groups.map(g => {
    const v = g.arts.map(a => art(fs, a)).reduce((t, x) => plus(t, x), empty);
    const parts = (g.parts || []).map(a => ({ code: a, name: D.part_names[a] || D.arts[a], ssb: D.arts[a], v: art(fs, a) }));
    if (g.parts) {
      const rest = parts.reduce((t, p) => plus(t, p.v, -1), v).map(x => (x != null && Math.abs(x) < 1 ? 0 : x));
      parts.unshift({ code: 'beregnet', name: g.rest, derived: `${g.arts.join(' + ')} − ${g.parts.join(' − ')}`, v: rest });
    }
    return { ...g, v, parts };
  });
  const side = s => groups.filter(g => g.side === s).reduce((t, g) => plus(t, g.v), empty);
  const cost = side('utgift'), income = side('inntekt'), netto = art(fs, D.net_art);
  return { groups, cost, income, netto, gap: plus(netto, plus(cost, income, -1), -1) };
}

function ssbUrl(fs, arts) {
  const d = D.source.dims, p = new URLSearchParams({ lang: 'no' });
  p.set(`valueCodes[${d.region}]`, D.source.region.split(' ')[0]);
  p.set(`valueCodes[${d.scope}]`, D.scopes[scope].code);
  p.set(`valueCodes[${d.function}]`, fs.join(','));
  p.set(`valueCodes[${d.art}]`, arts.join(','));
  p.set(`valueCodes[${d.contents}]`, D.source.contents);
  p.set(`valueCodes[${d.year}]`, D.years.join(','));
  return D.source.api + '?' + decodeURIComponent(p.toString()) + '&outputFormat=html';
}

// ---- pieces ----

function crumbs(items) {
  const all = [['Alle områder', './?aar=' + year], ...items];
  return `<nav class="crumbs" aria-label="Brødsmuler">${all.map(([t, h], i) => (i === all.length - 1 ? `<span aria-current="page">${esc(t)}</span>` : `<a href="${esc(h)}">${esc(t)}</a><span aria-hidden="true">›</span>`)).join('')}</nav>`;
}
function yearChips(extra) {
  return `<div class="years" aria-label="Velg år"><span>Regnskapsår</span>${years.map(y => `<a class="chip" href="${esc(link({ ...extra, aar: y }))}"${y === year ? ' aria-current="true"' : ''}>${y}</a>`).join('')}</div>`;
}
function head(eyebrow, title, lead, extra) {
  return `<header class="drill-head"><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}${yearChips(extra)}</header>`;
}
const stat = (label, big, unit, sub) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}${unit ? ` <small>${unit}</small>` : ''}</span><span class="sub">${sub}</span></div>`;

// A ranked list of rows, each a link when href is given: name, a bar on one scale, amount and a right-hand note.
function rankList(rows, cls = '') {
  const max = Math.max(...rows.map(r => Math.max(0, r.v ?? 0)), 1);
  return `<div class="rank ${cls}">${rows.map(r => {
    const inner = `<span class="rank-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="rank-track"><span class="rank-fill" style="width:${Math.max(0, (r.v ?? 0) / max * 100)}%"></span></span><span class="rank-amt num">${mill(r.v)}</span><span class="rank-note num">${r.note ?? ''}</span>`;
    return r.href ? `<a class="rank-row" href="${esc(r.href)}">${inner}<span class="rank-go" aria-hidden="true">›</span></a>` : `<div class="rank-row">${inner}<span></span></div>`;
  }).join('')}</div>`;
}

// One bar from the full cost to what the kommune paid itself, with the income groups beside it.
function flow(b, scale) {
  const cost = at(b.cost, year) ?? 0, netto = at(b.netto, year) ?? 0;
  const inc = b.groups.filter(g => g.side === 'inntekt' && (at(g.v, year) ?? 0) >= 50).sort((x, y) => at(y.v, year) - at(x.v, year));
  const total = Math.max(cost, netto + inc.reduce((t, g) => t + at(g.v, year), 0), 1);
  const segs = [{ name: 'Kommunen selv', v: netto, cls: 'own' }, ...inc.map((g, i) => ({ name: g.name, v: at(g.v, year), cls: 'inc', mix: Math.max(25, 100 - i * 22) }))];
  if (netto <= 0) {
    return `<p>Inntektene, ${mill(total - netto)} mill. kr, var større enn kostnadene, ${mill(cost)} mill. kr. Overskuddet på ${mill(-netto)} mill. kr trekker fra i kommunens netto.</p>`;
  }
  return `<div class="flow-bar" role="img" aria-label="${esc(segs.map(s => `${s.name} ${mill(s.v)} mill. kr`).join(', '))}">${segs.map(s => `<span class="flow-seg ${s.cls}" style="flex-basis:${s.v / total * 100}%${s.mix ? `;--mix:${s.mix}%` : ''}" title="${esc(s.name)}: ${mill(s.v)} mill. kr">${s.cls === 'own' && s.v / total > 0.3 ? `${scale === 'area' ? 'Kommunen betaler' : 'Kommunen betalte'} ${mill(s.v)}` : ''}</span>`).join('')}</div>
    <ul class="flow-legend">${segs.map(s => `<li><i class="flow-seg ${s.cls}" style="${s.mix ? `--mix:${s.mix}%` : ''}"></i>${esc(s.name)} ${mill(s.v)} mill.</li>`).join('')}</ul>`;
}

function fiveYears(series) {
  const vals = years.map(y => at(series, y) ?? 0);
  const max = Math.max(...vals.map(Math.abs), 1);
  return `<div class="bars5">${years.map((y, i) => `<a class="bar5${y === year ? ' sel' : ''}" href="${esc(link({ ...Object.fromEntries(q), aar: y }))}" aria-label="${y}: ${mill(vals[i])} mill. kr"><span class="num">${mill(vals[i])}</span><i style="height:${Math.abs(vals[i]) / max * 120}px"></i><b>${y}</b></a>`).join('')}</div>`;
}

function scopeToggle(extra) {
  return `<div class="seg" role="group" aria-label="Regnskapsomfang">${Object.entries(D.scopes).map(([k, s]) => `<a href="${esc(link({ ...extra, omfang: k === 'kasse' ? 'kasse' : '' }))}" title="${esc(s.note)}"${k === scope ? ' aria-current="true"' : ''}>${esc(s.name)}</a>`).join('')}</div>`;
}

// ---- level 1: the area ----

function areaPage() {
  const isService = !N.offset_categories.includes(area.key);
  const svcAreas = N.categories.filter(c => !N.offset_categories.includes(c.key));
  const v = area.narvik_1000kr[year], pv = prev && area.narvik_1000kr[prev];
  const svcTotal = svcAreas.reduce((t, c) => t + c.narvik_1000kr[year], 0);
  const share = v / svcTotal * 100;
  const rank = [...svcAreas].sort((a, b) => b.narvik_1000kr[year] - a.narvik_1000kr[year]).findIndex(c => c.key === area.key) + 1;
  const pc = Math.round(v * 1000 / N.population[year]);
  const land = area.per_capita.landet[year], nord = area.per_capita.nordland[year];
  const cmp = (a, b, name) => (b ? `${nb(Math.abs(a / b - 1) * 100)} % ${a >= b ? 'over' : 'under'} ${name}` : null);
  const all = area.functions.filter(f => N.functions[f]);
  const b = breakdown(all);
  const svcs = services();

  const title = isService
    ? `${nb(v / 1000)} millioner kroner, ${nb(share)} % av det kommunen bruker på tjenester`
    : `${v < 0 ? '−' : ''}${nb(Math.abs(v) / 1000)} millioner kroner i ${lower(area.name)}`;
  let html = crumbs([[area.name]]);
  html += head(`${area.name} · ${year}`, esc(title), `${esc(area.description)}. Tallet er det kommunen betaler selv, etter refusjoner og egenandeler.`);
  html += `<div class="summary">${stat('Netto driftsutgifter', mill(v), 'mill. kr', prev ? `${chgSpan(v, pv)} fra ${prev}` : 'Første år i serien')}
    ${stat('Per innbygger', nb(pc), 'kr', [cmp(pc, land, 'landet'), cmp(pc, nord, 'Nordland')].filter(Boolean).join(', ') || 'Ingen sammenligningstall')}
    ${isService ? stat('Andel av tjenestene', nb(share), '%', rank === 1 ? 'Største område' : `Nr. ${rank} av ${svcAreas.length} områder`) : ''}</div>`;

  if (at(b.cost, year)) {
    html += `<section class="drill-sec"><h2>Fra hele kostnaden til det kommunen betaler</h2>
      <p class="lead">Tjenestene kostet ${mill(at(b.cost, year), 0)} mill. kr. ${mill(at(b.income, year), 0)} mill. ble dekket av andre, så kommunen betalte ${mill(at(b.netto, year), 0)} mill. selv.</p>${flow(b, 'area')}</section>`;
  }

  const rows = svcs.map(s => ({ name: s.name, sub: s.name === N.functions[s.functions[0]]?.name ? `Funksjon ${s.functions[0]}` : `Funksjon ${codes(s.functions)}`, v: net(s.functions, year), note: prev ? chgSpan(net(s.functions, year), net(s.functions, prev)) : '', href: link({ tjeneste: s.key }) }))
    .sort((a, b) => b.v - a.v);
  html += `<section class="drill-sec"><h2>Hvilke tjenester pengene går til</h2>${rankList(rows)}
    ${svcs.filter(s => s.note).map(s => `<p class="caption">${esc(s.name)}: ${esc(s.note)}</p>`).join('')}
    <p class="caption">Trykk på en tjeneste for å se hva den bruker pengene på og hva som kommer inn.</p></section>`;

  html += `<section class="drill-sec"><h2>Fem år</h2>${fiveYears(D.years.map(y => area.narvik_1000kr[y] ?? null))}<p class="caption">Netto driftsutgifter i mill. kr, løpende kroner.</p></section>`;

  html += `<details class="drill-sec all-numbers"><summary>Vis alle tall per KOSTRA-funksjon</summary><div class="detail-scroll"><table class="num-table"><tr><th>KOSTRA-funksjon (1000 kr)</th>${years.map(y => `<th${y === year ? ' class="sel"' : ''}>${y}</th>`).join('')}</tr>
    ${all.filter(f => years.some(y => N.functions[f].narvik_1000kr[y])).map(f => `<tr><td>${f} ${esc(N.functions[f].name)}</td>${years.map(y => { const x = N.functions[f].narvik_1000kr[y]; return `<td${y === year ? ' class="sel"' : ''}>${x == null ? '·' : nb(x)}</td>`; }).join('')}</tr>`).join('')}
    <tr class="sum"><td>Sum</td>${years.map(y => `<td${y === year ? ' class="sel"' : ''}>${nb(area.narvik_1000kr[y])}</td>`).join('')}</tr></table></div>
    <p class="caption">· betyr at funksjonen ikke fantes eller ikke er rapportert det året.</p></details>`;

  html += `<p class="caption source">Kilde: SSB tabell 12362 (netto, art AGD2, og per innbygger) og 12367 (kostnader og inntekter, ${esc(lower(D.scopes[scope].name))}, omfang ${D.scopes[scope].code}), funksjon ${esc(codes(all))}. <a href="${esc(ssbUrl(all, [D.net_art, ...D.groups.flatMap(g => g.arts)]))}" target="_blank" rel="noopener">Se tallene hos SSB</a>.${gapNote(b)}</p>`;
  return html;
}

function gapNote(b) {
  const g = at(b.gap, year);
  return g ? ` For konsernet oppgir SSB et netto som er ${mill(Math.abs(g))} mill. kr ${g > 0 ? 'høyere' : 'lavere'} enn kostnadene minus inntektene. I kommunekassen går tallene opp.` : '';
}

// ---- level 2: one service ----

function servicePage(s) {
  const b = breakdown(s.functions);
  const v = at(b.netto, year), pv = prev && at(b.netto, prev);
  const cost = at(b.cost, year), income = at(b.income, year);
  // Largest first; lines under 50 000 kr round to 0,0 mill. and are left out here, but stay in the SSB link.
  const pick = sd => b.groups.filter(g => g.side === sd && Math.abs(at(g.v, year) ?? 0) >= 50).sort((x, y) => at(y.v, year) - at(x.v, year));
  const costs = pick('utgift'), incomes = pick('inntekt');
  const top = costs[0], topIn = incomes[0];
  const ptop = top && at(top.v, year) / cost * 100;

  let html = crumbs([[area.name, link({})], [s.name]]);
  if (cost == null && v == null) {
    return html + head(`${area.name} · ${year}`, esc(s.name), `SSB har ingen tall for ${esc(lower(s.name))} i ${year}.`, { tjeneste: s.key });
  }
  const title = v >= 0 ? `${esc(s.name)} kostet kommunen ${nb(v / 1000)} millioner kroner` : `${esc(s.name)} ga ${nb(-v / 1000)} millioner kroner mer inn enn ut`;
  html += head(`KOSTRA-funksjon ${codes(s.functions)} · ${year}`, title, top ? `${esc(top.name)} er ${nb(ptop)} % av kostnaden.${s.note ? ' ' + esc(s.note) : ''}` : '', { tjeneste: s.key });
  html += `<div class="summary">${stat('Kommunen betalte', mill(v), 'mill. kr', prev ? `${chgSpan(v, pv)} fra ${prev}` : 'Første år i serien')}
    ${top ? stat('Største kostnad', nb(ptop), '%', `${esc(top.name)}, ${mill(at(top.v, year))} av ${mill(cost)} mill. kr`) : ''}
    ${topIn ? stat(esc(topIn.name), mill(at(topIn.v, year)), 'mill. kr', prev ? `${chgSpan(at(topIn.v, year), at(topIn.v, prev), true)} fra ${prev}` : '') : ''}</div>`;

  const rowsOf = list => list.map(g => ({ name: g.name, v: at(g.v, year), note: `${nb(at(g.v, year) / (g.side === 'utgift' ? cost : income) * 100)} %`, href: link({ tjeneste: s.key, art: g.key }) }));
  html += `<section class="drill-sec"><h2>Hva pengene går til</h2><p class="lead">Hele kostnaden var ${mill(cost)} mill. kr. Trykk på en linje for å se hva den består av.</p>${rankList(rowsOf(costs))}</section>`;
  if (incomes.length) html += `<section class="drill-sec"><h2>Hva som kommer inn</h2><p class="lead">${mill(income)} mill. kr ble dekket av andre enn kommunen.</p>${rankList(rowsOf(incomes), 'income')}</section>`;
  html += `<section class="drill-sec"><h2>Fem år</h2>${fiveYears(b.netto)}<p class="caption">Det kommunen betalte, i mill. kr, løpende kroner.</p></section>`;
  html += sourceBox(s, [D.net_art, ...D.groups.flatMap(g => g.arts)], `Hver linje over er én eller flere av SSBs arter. Trykk på en linje for å se artskodene.${gapNote(b)}`, { tjeneste: s.key });
  return html;
}

function sourceBox(s, arts, text, extra) {
  return `<section class="source-box"><span class="eyebrow">Hvor tallene kommer fra</span>
    <p>SSB tabell ${D.source.table}, Narvik (1806), ${esc(lower(D.scopes[scope].name))}, omfang ${D.scopes[scope].code}, funksjon ${esc(codes(s.functions))}. ${text}</p>
    <div class="source-actions"><a class="btn" href="${esc(ssbUrl(s.functions, arts))}" target="_blank" rel="noopener">Åpne de samme tallene hos SSB</a>${scopeToggle(extra)}</div></section>`;
}

// ---- level 3: one cost or income type in a service ----

function typePage(s, g) {
  const b = breakdown(s.functions);
  const grp = b.groups.find(x => x.key === g.key);
  const v = at(grp.v, year), pv = prev && at(grp.v, prev);
  const parts = grp.parts.filter(p => years.some(y => at(p.v, y)));
  const big = parts.filter(p => !p.derived).sort((x, y) => (at(y.v, year) ?? 0) - (at(x.v, year) ?? 0))[0];
  const title = `${mill(v)} millioner kroner ${g.side === 'utgift' ? 'til' : 'i'} ${esc(lower(g.name))}`;
  let lead = `${esc(s.name)}, ${year}.`;
  if (prev && pv) lead += ` ${chgText(pct(v, pv)).replace('+', 'Opp ').replace('−', 'Ned ')} fra ${prev}.`;
  if (big && v) lead += ` ${esc(big.name)} er ${nb(at(big.v, year) / v * 100)} % av beløpet.`;

  let html = crumbs([[area.name, link({})], [s.name, link({ tjeneste: s.key })], [g.name]]);
  html += head(`Funksjon ${codes(s.functions)} · art ${g.arts.join(' + ')} · ${year}`, title, lead, { tjeneste: s.key, art: g.key });

  const shown = parts.filter(p => (at(p.v, year) ?? 0) > 0);
  if (shown.length > 1 && v > 0) {
    html += `<div class="flow-bar parts" role="img" aria-label="${esc(shown.map(p => `${p.name} ${mill(at(p.v, year))} mill. kr`).join(', '))}">${shown.map((p, i) => `<span class="flow-seg ${g.side === 'utgift' ? 'cost' : 'inc'}" style="flex-basis:${at(p.v, year) / v * 100}%;--mix:${Math.max(30, 100 - i * 25)}%">${at(p.v, year) / v > 0.25 ? `${esc(p.name)} ${mill(at(p.v, year))}` : ''}</span>`).join('')}</div>
      <ul class="flow-legend">${shown.map((p, i) => `<li><i class="flow-seg ${g.side === 'utgift' ? 'cost' : 'inc'}" style="--mix:${Math.max(30, 100 - i * 25)}%"></i>${esc(p.name)} ${mill(at(p.v, year))} mill.</li>`).join('')}</ul>`;
  }

  const row = (name, code, series, cls = '', title = '') => `<tr class="${cls}"><td${title ? ` title="${esc(title)}"` : ''}>${esc(name)}</td><td class="code">${esc(code)}</td>${years.map(y => `<td${y === year ? ' class="sel"' : ''}>${mill(at(series, y))}</td>`).join('')}</tr>`;
  html += `<section class="drill-sec"><h2>Alle år, mill. kr</h2><div class="detail-scroll"><table class="num-table"><tr><th>Linje</th><th class="code">Art</th>${years.map(y => `<th${y === year ? ' class="sel"' : ''}>${y}</th>`).join('')}</tr>
    ${parts.map(p => row(p.derived ? p.name : p.name, p.derived ? 'beregnet' : p.code, p.v, p.derived ? 'derived' : '', p.derived ? `Beregnet: ${p.derived}` : p.ssb)).join('')}
    ${row(parts.length ? 'Sum' : g.name, g.arts.join(' + '), grp.v, 'sum')}</table></div>
    ${g.note ? `<p class="caption">${esc(g.note)}</p>` : ''}</section>`;

  const derived = parts.find(p => p.derived);
  html += sourceBox(s, [...g.arts, ...(g.parts || [])], parts.length
    ? `${esc(parts.filter(p => !p.derived).map(p => `${p.name} (${p.code})`).join(', '))} er SSBs egne arter.${derived ? ` «${esc(derived.name)}» er regnet ut her: ${esc(derived.derived)}.` : ''}`
    : `Beløpet er art ${g.arts.join(' + ')}, ${esc(D.arts[g.arts[0]])}.`, { tjeneste: s.key, art: g.key });
  html += `<section class="ssb-end"><span class="eyebrow">Her slutter SSB</span><p>Mer detaljer, for eksempel per sykehjem, skole eller avdeling, finnes ikke i KOSTRA. Det krever kommunens eget regnskap per enhet.</p></section>`;
  return html;
}

start();
