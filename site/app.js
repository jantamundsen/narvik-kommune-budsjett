// Åpne tall for Narvik: renders site/data/narvik.json (written by scripts/fetch_data.py). Helpers are in common.js.
const mill = v => nb(v / 1000, 0);
const svgNS = 'http://www.w3.org/2000/svg';
let DATA, YEARS, OFFSET_KEYS, services, offsets, year;
let ref = 'gruppe'; // comparison region key from DATA.compare (?mot=)
let budgetYears = new Set(); // years with both a budget and accounts on budsjett.html

function s(tag, attrs = {}, text) {
  const n = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
const sum = (list, y) => list.reduce((t, c) => t + c.narvik_1000kr[y], 0);
const perCap = (v, y) => Math.round(v * 1000 / DATA.population[y]);

async function start() {
  try {
    const res = await fetch('data/narvik.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    document.querySelector('.wrap').insertAdjacentHTML('beforeend', '<p class="lead">Fant ikke data/narvik.json. Kjør <code>python scripts/fetch_data.py</code> og åpne siden via en webserver.</p>');
    return;
  }
  YEARS = DATA.years;
  OFFSET_KEYS = DATA.offset_categories;
  services = DATA.categories.filter(c => !OFFSET_KEYS.includes(c.key));
  offsets = DATA.categories.filter(c => OFFSET_KEYS.includes(c.key));
  year = YEARS.at(-1);
  try { const y = localStorage.getItem('narvik-year'); if (YEARS.includes(y)) year = y; } catch (e) {}
  if (YEARS.includes(urlYear())) year = urlYear();
  const mot = new URLSearchParams(location.search).get('mot');
  if (DATA.compare.some(r => r.key === mot)) ref = mot;
  document.getElementById('generated').textContent = new Date(DATA.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const yearsEl = document.getElementById('years');
  YEARS.forEach(y => {
    const b = el('button', { role: 'radio', type: 'button', id: 'year-' + y, 'aria-checked': String(y === year) }, y);
    b.addEventListener('click', () => setYear(y));
    yearsEl.appendChild(b);
  });
  render();
  loadBudgetYears();
}

// Link to budsjett.html for the selected year when that page has a budget to compare with its accounts.
async function loadBudgetYears() {
  try {
    const res = await fetch('data/budsjett.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const B = await res.json();
    const has = (k, y) => B.series.some(x => x.kind === k && x.year === y);
    budgetYears = new Set(B.series.filter(x => x.kind === 'regnskap' && has('budsjett', x.year)).map(x => x.year));
  } catch (e) { return; }
  drawBudgetLink();
}
function drawBudgetLink() {
  const a = document.getElementById('budget-link');
  a.hidden = !budgetYears.has(year);
  a.href = 'budsjett?aar=' + year;
  a.textContent = `Se budsjett mot regnskap for ${year} →`;
}

function setYear(y) { year = y; try { localStorage.setItem('narvik-year', y); } catch (e) {} writeUrl(); render(); }
// The address carries the year and the comparison region, so a view can be shared.
function writeUrl() {
  const p = new URLSearchParams({ aar: year });
  if (ref !== 'gruppe') p.set('mot', ref);
  try { history.replaceState(null, '', '?' + p + location.hash); } catch (e) {}
}

function render() {
  drawBudgetLink();
  document.querySelectorAll('#years button').forEach(b => b.setAttribute('aria-checked', String(b.textContent === year)));
  const prev = YEARS[YEARS.indexOf(year) - 1];
  const total = DATA.total_1000kr[year];
  const svcTotal = sum(services, year), offTotal = sum(offsets, year);
  document.getElementById('sum-year').textContent = year;
  document.getElementById('s-total').innerHTML = nb(total / 1000) + ' <small>mill. kr</small>';
  document.getElementById('s-total-chg').textContent = prev ? `${chgText(pct(total, DATA.total_1000kr[prev]))} fra ${prev}` : 'Første år i serien';
  document.getElementById('s-pc').innerHTML = nb(perCap(total, year)) + ' <small>kr</small>';
  document.getElementById('s-pop').textContent = `${nb(DATA.population[year])} innbyggere`;
  const top = [...services].sort((a, b) => b.narvik_1000kr[year] - a.narvik_1000kr[year])[0];
  document.getElementById('s-top').textContent = top.name;
  document.getElementById('s-top-sub').textContent = `${mill(top.narvik_1000kr[year])} mill. kr · ${nb(top.narvik_1000kr[year] / svcTotal * 100)} % av tjenestene`;
  document.getElementById('equation').innerHTML = `Tjenester <b>${mill(svcTotal)} mill. kr</b> ${offTotal < 0 ? '−' : '+'} pensjonsposter og gebyrfinansiert vann, avløp og renovasjon <b>${mill(Math.abs(offTotal))} mill. kr</b> = netto <b>${mill(total)} mill. kr</b>`;

  drawNote(svcTotal);

  const ledger = document.getElementById('ledger');
  ledger.querySelectorAll('.row').forEach(r => r.remove());
  const maxShare = Math.max(...services.map(c => c.narvik_1000kr[year] / svcTotal));
  [...services].sort((a, b) => b.narvik_1000kr[year] - a.narvik_1000kr[year]).forEach(c => ledger.appendChild(rowFor(c, svcTotal, maxShare, prev)));

  const off = document.getElementById('offsets'); off.replaceChildren();
  const oh = el('div', { class: 'ledger', style: 'margin-top:24px' });
  const head = el('div', { class: 'ledger-head' });
  ['Trekker fra i netto', '', 'Mill. kr', 'Per innb.', 'Endring'].forEach((t, i) => head.appendChild(el('span', i > 1 ? { class: 'r' } : {}, t)));
  oh.appendChild(head);
  offsets.forEach(c => oh.appendChild(rowFor(c, null, 1, prev)));
  off.appendChild(oh);

  drawCompare();
  drawTrend();
  drawMultiples();
}

function drawNote(svcTotal) {
  const pos = services.filter(c => c.narvik_1000kr[year] > svcTotal * 0.0005).sort((a, b) => b.narvik_1000kr[year] - a.narvik_1000kr[year]);
  const posTotal = pos.reduce((t, c) => t + c.narvik_1000kr[year], 0);
  const bar = document.getElementById('note-bar'); bar.replaceChildren();
  const legend = document.getElementById('note-legend'); legend.replaceChildren();
  pos.forEach((c, i) => {
    const kr = c.narvik_1000kr[year] / posTotal * 100;
    const op = Math.max(0.22, 1 - i * 0.11);
    const b = el('a', { href: areaHref(c.key), title: `${c.name}: ${nb(kr, 1)} kr av 100`, 'aria-label': `${c.name}, ${nb(kr)} kroner av hundre` });
    b.style.flex = `0 0 ${kr}%`;
    b.style.background = `color-mix(in srgb, var(--accent) ${Math.round(op * 100)}%, var(--surface))`;
    if (kr >= 9) b.appendChild(el('span', {}, nb(kr) + ' kr'));
    bar.appendChild(b);
    const li = el('li');
    li.appendChild(el('span', { class: 'kr' }, nb(kr, kr < 1 ? 1 : 0) + ' kr'));
    li.appendChild(el('span', {}, c.name));
    legend.appendChild(li);
  });
}

// Each area links to omrade.html, which drills down into its services and cost types.
const areaHref = key => `utgifter/${key}?aar=${year}`;

function rowFor(c, svcTotal, maxShare, prev) {
  const v = c.narvik_1000kr[year];
  const row = el('div', { class: 'row', id: 'row-' + c.key });
  const btn = el('a', { class: 'row-btn', href: areaHref(c.key) });
  const name = el('span', { class: 'row-name c-name' });
  name.append(el('b', {}, c.name), el('small', {}, c.description));
  const share = el('span', { class: 'share c-share' });
  if (svcTotal) {
    const track = el('span', { class: 'share-track' }); const fill = el('span', { class: 'share-fill' });
    fill.style.display = 'block'; fill.style.width = Math.max(0, v / svcTotal / maxShare * 100) + '%';
    track.appendChild(fill); share.append(track, el('small', {}, nb(v / svcTotal * 100, 1) + ' %'));
  }
  const p = prev ? pct(v, c.narvik_1000kr[prev]) : null;
  // No colour on the change from the year before; red and green are only for deviations from the budget.
  const cls = 'chg';
  btn.append(name, share,
    el('span', { class: 'r num c-amt' }, nb(v / 1000, Math.abs(v) < 10000 ? 1 : 0)),
    el('span', { class: 'r num c-pc' }, nb(c.per_capita?.narvik?.[year] ?? perCap(v, year))),
    el('span', { class: 'r c-chg ' + cls }, prev ? chgText(p) : '–'));
  row.appendChild(btn);
  return row;
}

// Narvik per inhabitant against one comparison region (?mot=harstad), area by area, largest difference first.
function setRef(k) { ref = k; writeUrl(); drawCompare(); }
function drawCompare() {
  const C = DATA.compare;
  const R = C.find(r => r.key === ref) || C[0];
  const pick = document.getElementById('cmp-pick'); pick.replaceChildren();
  C.forEach(r => {
    const b = el('button', { type: 'button', 'aria-pressed': String(r === R) }, shortName(r));
    b.addEventListener('click', () => setRef(r.key));
    pick.appendChild(b);
  });

  // Use the selected year when SSB has figures for the region, else the latest year that has them.
  const has = y => services.some(c => c.per_capita[R.key]?.[y] != null);
  const cy = has(year) ? year : [...YEARS].reverse().find(has);
  const list = document.getElementById('cmp-list'), cap = document.getElementById('cmp-caption');
  if (!cy) { list.replaceChildren(); cap.textContent = 'Ingen sammenligningstall i datafilen.'; return; }
  const rows = services.map(c => ({ c, n: c.per_capita.narvik[cy], r: c.per_capita[R.key][cy] }))
    .filter(x => x.n != null && x.r != null).map(x => ({ ...x, d: x.n - x.r })).sort((a, b) => b.d - a.d);
  const maxD = Math.max(...rows.map(x => Math.abs(x.d)), 1);
  const sumN = rows.reduce((t, x) => t + x.n, 0), sumR = rows.reduce((t, x) => t + x.r, 0), sumD = sumN - sumR;
  const pop = DATA.population[cy];
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + nb(Math.abs(v));

  const head = el('div', { class: 'cmp-row cmp-head' });
  head.append(el('span', {}, 'Område'), el('span', { class: 'r' }, 'Narvik'), el('span', { class: 'r' }, shortName(R)), el('span', {}, 'Forskjell'), el('span', { class: 'r' }, 'Kr'));
  list.replaceChildren(head);
  const line = (name, x, href, cls = '') => {
    const row = el(href ? 'a' : 'div', Object.assign({ class: 'cmp-row ' + cls }, href ? { href } : {}));
    const dev = el('span', { class: 'dev', title: `${signed(x.d)} kr per innbygger` });
    const fill = el('span', { class: x.d >= 0 ? 'more' : 'less' });
    fill.style.width = Math.min(50, Math.abs(x.d) / maxD * 50) + '%';
    dev.appendChild(fill);
    row.append(el('span', { class: 'c-name' }, name), el('span', { class: 'r num c-n' }, nb(x.n)), el('span', { class: 'r num c-r' }, nb(x.r)),
      el('span', { class: 'c-dev' }, ''), el('span', { class: 'r num c-d' }, signed(x.d)));
    row.children[3].appendChild(dev);
    return row;
  };
  rows.forEach(x => list.appendChild(line(x.c.name, x, areaHref(x.c.key) + '#sammenligning')));
  list.appendChild(line('Alle tjenesteområder', { n: sumN, r: sumR, d: sumD }, null, 'total'));

  const who = R.kind === 'kommune' ? R.name : R.key === 'gruppe' ? `snittet i ${R.name}` : `snittet for ${lower1(R.name)}`;
  const top = rows[0], bottom = rows.at(-1);
  document.getElementById('cmp-lead').textContent =
    `I ${cy} brukte Narvik ${nb(Math.abs(sumD))} kr ${sumD >= 0 ? 'mer' : 'mindre'} per innbygger på tjenestene enn ${who}.` +
    (pop ? ` Med ${nb(pop)} innbyggere tilsvarer det ${nb(Math.abs(sumD) * pop / 1e6)} mill. kr.` : '') +
    (top.d > 0 ? ` Den største forskjellen er ${lower1(top.c.name)}, ${nb(top.d)} kr per innbygger.` : '') +
    (bottom.d < 0 ? ` På ${lower1(bottom.c.name)} bruker Narvik ${nb(-bottom.d)} kr mindre per innbygger.` : '');
  cap.innerHTML = `Netto driftsutgifter per innbygger i kroner, ${cy}, kommunekonsern. ${esc1(R.name)}: ${esc1(regionNote(DATA, R, cy).toLowerCase())}.` +
    (cy !== year ? ` SSB har ikke tall for ${esc1(R.name)} i ${year}, derfor vises ${cy}.` : '') +
    ` Trykk på et område for å se alle sammenligningene for det. <a href="${esc1(ssbCompareUrl(DATA, services.flatMap(c => c.functions), [cy]))}" target="_blank" rel="noopener">Se tallene hos SSB</a> (tabell 12362, beløp per innbygger, summert per område).`;

  // Every area against every region for the year.
  const cols = [{ key: 'narvik', name: 'Narvik' }, ...C];
  document.getElementById('cmp-table').innerHTML = `<table class="num-table"><tr><th>Kr per innbygger, ${cy}</th>${cols.map(r => `<th>${esc1(shortName(r))}</th>`).join('')}</tr>
    ${services.map(c => `<tr><td><a href="${esc1(areaHref(c.key))}#sammenligning">${esc1(c.name)}</a></td>${cols.map(r => { const v = c.per_capita[r.key]?.[cy]; return `<td${r.key === 'narvik' ? ' class="sel"' : ''}>${v == null ? '·' : nb(v)}</td>`; }).join('')}</tr>`).join('')}</table>`;
  const g = DATA.kostra_group;
  document.getElementById('cmp-group').innerHTML = g
    ? `${esc1(g.name)}: ${esc1(lower1(g.description))}. ${g.members.length} kommuner: ${esc1(g.members.map(m => m.name.split(' - ')[0]).join(', '))}. Kilde: <a href="${esc1(g.source.url)}" target="_blank" rel="noopener">${esc1(g.source.name)}</a>.`
    : '';
}
const shortName = r => r.name.replace('KOSTRA-gruppe', 'Gruppe');
const lower1 = t => t.charAt(0).toLowerCase() + t.slice(1);
const esc1 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function drawTrend() {
  const W = 760, H = 270, left = 56, right = 740, y0 = 50, base = 230;
  const vals = YEARS.map(y => DATA.total_1000kr[y] / 1000);
  const max = Math.ceil(Math.max(...vals) / 500) * 500;
  const Y = v => base - v / max * (base - y0);
  const band = (right - left) / YEARS.length, bw = band * 0.56;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Netto driftsutgifter i millioner kroner per år, ${YEARS[0]} til ${YEARS.at(-1)}` });
  for (let t = 0; t <= max; t += 500) {
    svg.appendChild(s('line', { x1: left, x2: right, y1: Y(t), y2: Y(t), stroke: 'var(--rule)' }));
    svg.appendChild(s('text', { x: left - 8, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, nb(t)));
  }
  YEARS.forEach((y, i) => {
    const x = left + i * band + (band - bw) / 2, v = vals[i], sel = y === year;
    const r = s('rect', { x, y: Y(v), width: bw, height: base - Y(v), rx: 3, fill: sel ? 'var(--accent)' : 'var(--muted)', 'fill-opacity': sel ? 1 : 0.55, style: 'cursor:pointer' });
    r.appendChild(s('title', {}, `${y}: ${nb(v)} mill. kr`));
    r.addEventListener('click', () => setYear(y));
    svg.appendChild(r);
    svg.appendChild(s('text', { x: x + bw / 2, y: Y(v) + 24, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': sel ? 700 : 500, fill: sel ? 'var(--surface)' : 'var(--ink)' }, nb(v)));
    svg.appendChild(s('text', { x: x + bw / 2, y: base + 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': sel ? 700 : 400, fill: sel ? 'var(--ink)' : 'var(--ink-2)' }, y));
  });
  // A line through the bar tops, with the change from the year before written over each segment.
  const cx = i => left + i * band + band / 2;
  svg.appendChild(s('path', { d: 'M' + vals.map((v, i) => `${cx(i)} ${Y(v)}`).join(' L'), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  vals.forEach((v, i) => {
    svg.appendChild(s('circle', { cx: cx(i), cy: Y(v), r: 4, fill: 'var(--surface)', stroke: 'var(--ink)', 'stroke-width': 2 }));
    if (!i) return;
    const c = pct(v, vals[i - 1]);
    const t = s('text', { x: (cx(i - 1) + cx(i)) / 2, y: (Y(vals[i - 1]) + Y(v)) / 2 - 12, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: 'var(--ink)' }, chgText(c));
    t.appendChild(s('title', {}, `${YEARS[i - 1]} til ${YEARS[i]}: ${chgText(c)}`));
    svg.appendChild(t);
  });
  svg.appendChild(s('text', { x: left - 8, y: y0 - 12, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-2)' }, 'mill. kr'));
  document.getElementById('trend-chart').replaceChildren(svg);
  const first = vals[0], last = vals.at(-1), y1 = YEARS[0], y2 = YEARS.at(-1);
  document.getElementById('trend-lead').textContent = `Netto driftsutgifter økte fra ${nb(first)} til ${nb(last)} millioner kroner fra ${y1} til ${y2}, ${nb((last / first - 1) * 100)} %. Folketallet var omtrent det samme, ${nb(DATA.population[y1])} mot ${nb(DATA.population[y2])}.`;
}

// One small bar chart per service area, each starting at zero on its own scale, so the shape shows the change without exaggerating it.
// Areas with a negative or zero year are left out of the grid, since a percentage change across zero has no meaning.
function drawMultiples() {
  const y1 = YEARS[0], y2 = YEARS.at(-1);
  const ok = c => YEARS.every(y => c.narvik_1000kr[y] > 0);
  const shown = services.filter(ok).sort((a, b) => b.narvik_1000kr[y2] - a.narvik_1000kr[y2]);
  const left = services.filter(c => !ok(c));
  const box = document.getElementById('multiples'); box.replaceChildren();
  const W = 150, H = 70, pad = 6, top = 8, base = 54;
  // Same vertical scale in percent for every area (top = lowest year plus the largest rise among areas), so a steep line means a large change.
  // Very small areas (under 10 mill. kr in some year) swing a lot in percent and get their own scale, marked on the chart.
  const SMALL = 10000;
  const isSmall = c => YEARS.some(y => c.narvik_1000kr[y] < SMALL);
  const ratio = c => { const v = YEARS.map(y => c.narvik_1000kr[y]); return Math.max(...v) / Math.min(...v); };
  const R = Math.max(...shown.filter(c => !isSmall(c)).map(ratio));
  shown.forEach(c => {
    const v = YEARS.map(y => c.narvik_1000kr[y] / 1000);
    const own = isSmall(c);
    const lo = Math.min(...v), hi = own ? Math.max(...v) : lo * R, span = hi - lo || 1;
    const X = i => pad + i * (W - 2 * pad) / (YEARS.length - 1), Y = t => base - (t - lo) / span * (base - top);
    const a = el('a', { class: 'multiple', href: areaHref(c.key) });
    a.append(el('span', { class: 'm-name' }, c.name), el('span', { class: 'm-chg num' }, chgText(pct(v.at(-1), v[0]))));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${c.name}, mill. kr: ` + YEARS.map((y, i) => `${y} ${mill(v[i] * 1000)}`).join(', ') });
    const pts = v.map((t, i) => `${X(i).toFixed(1)} ${Y(t).toFixed(1)}`);
    svg.appendChild(s('path', { d: 'M' + pts.join(' L') + ` L${X(v.length - 1)} ${base + 4} L${X(0)} ${base + 4} Z`, fill: 'var(--accent-soft)' }));
    svg.appendChild(s('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    YEARS.forEach((y, i) => {
      const sel = y === year;
      const dot = s('circle', { cx: X(i), cy: Y(v[i]), r: sel ? 4 : 2.2, fill: sel ? 'var(--accent)' : 'var(--surface)', stroke: 'var(--accent)', 'stroke-width': sel ? 2 : 1.4 });
      dot.appendChild(s('title', {}, `${y}: ${nb(v[i], v[i] < 10 ? 1 : 0)} mill. kr`));
      svg.appendChild(dot);
    });
    svg.appendChild(s('text', { x: X(0), y: H - 1, 'font-size': 10, fill: 'var(--ink-2)' }, YEARS[0]));
    svg.appendChild(s('text', { x: X(YEARS.length - 1), y: H - 1, 'font-size': 10, 'text-anchor': 'end', fill: 'var(--ink-2)' }, YEARS.at(-1)));
    if (own) svg.appendChild(s('text', { x: W / 2, y: H - 1, 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--ink-2)' }, 'egen skala'));
    a.appendChild(svg);
    const d = n => nb(n, n < 10 ? 1 : 0);
    a.appendChild(el('span', { class: 'm-sub num' }, `${d(v[0])} → ${d(v.at(-1))} mill. kr`));
    box.appendChild(a);
  });
  document.getElementById('multi-lead').textContent = `Netto driftsutgifter per område, ${y1}–${y2}. Alle grafene har samme skala i prosent, målt fra områdets laveste år, så en bratt linje betyr stor endring. Skalaen starter ikke på null, og grafene viser ikke hvor store områdene er mot hverandre. Tallet er endringen fra ${y1} til ${y2}. Valgt år (${year}) er markert. Trykk på et område for å gå inn i det.`;
  const names = left.map(c => lower1(c.name));
  document.getElementById('multi-caption').textContent = 'Løpende kroner, ikke justert for prisvekst. Endring i prosent er beregnet fra SSB-tallene.' +
    (names.length ? ` ${names.join(' og ').replace(/^./, ch => ch.toUpperCase())} er ikke med fordi de er negative eller null i minst ett år, og da gir en prosentvis endring ikke mening.` : '') +
    ' Områder under 10 mill. kr har egen skala, fordi små beløp svinger mye i prosent. Pensjonsjusteringer og vann, avløp og renovasjon vises under «Trekker fra i netto» over.';
}

start();
