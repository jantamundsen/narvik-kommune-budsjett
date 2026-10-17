// Pengene i Narvik: renders site/data/narvik.json (written by scripts/fetch_data.py).
const nb = (v, d = 0) => v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
const mill = v => nb(v / 1000, 0);
const svgNS = 'http://www.w3.org/2000/svg';
let DATA, YEARS, OFFSET_KEYS, services, offsets, year;
const openRows = new Set();

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function s(tag, attrs = {}, text) {
  const n = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
const sum = (list, y) => list.reduce((t, c) => t + c.narvik_1000kr[y], 0);
const pct = (a, b) => (b ? (a - b) / Math.abs(b) * 100 : null);
const chgText = p => (p === null ? '–' : (p > 0 ? '+' : p < 0 ? '−' : '') + nb(Math.abs(p), 1) + ' %');
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
  document.getElementById('generated').textContent = new Date(DATA.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const yearsEl = document.getElementById('years');
  YEARS.forEach(y => {
    const b = el('button', { role: 'radio', type: 'button', id: 'year-' + y, 'aria-checked': String(y === year) }, y);
    b.addEventListener('click', () => setYear(y));
    yearsEl.appendChild(b);
  });
  render();
}

function setYear(y) { year = y; try { localStorage.setItem('narvik-year', y); } catch (e) {} render(); }

function render() {
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
}

function drawNote(svcTotal) {
  const pos = services.filter(c => c.narvik_1000kr[year] > svcTotal * 0.0005).sort((a, b) => b.narvik_1000kr[year] - a.narvik_1000kr[year]);
  const posTotal = pos.reduce((t, c) => t + c.narvik_1000kr[year], 0);
  const bar = document.getElementById('note-bar'); bar.replaceChildren();
  const legend = document.getElementById('note-legend'); legend.replaceChildren();
  pos.forEach((c, i) => {
    const kr = c.narvik_1000kr[year] / posTotal * 100;
    const op = Math.max(0.22, 1 - i * 0.11);
    const b = el('button', { type: 'button', title: `${c.name}: ${nb(kr, 1)} kr av 100`, 'aria-label': `${c.name}, ${nb(kr)} kroner av hundre` });
    b.style.flex = `0 0 ${kr}%`;
    b.style.background = `color-mix(in srgb, var(--accent) ${Math.round(op * 100)}%, var(--surface))`;
    if (kr >= 9) b.appendChild(el('span', {}, nb(kr) + ' kr'));
    b.addEventListener('click', () => openRow(c.key));
    bar.appendChild(b);
    const li = el('li');
    li.appendChild(el('span', { class: 'kr' }, nb(kr, kr < 1 ? 1 : 0) + ' kr'));
    li.appendChild(el('span', {}, c.name));
    legend.appendChild(li);
  });
}

function rowFor(c, svcTotal, maxShare, prev) {
  const v = c.narvik_1000kr[year];
  const open = openRows.has(c.key);
  const row = el('div', { class: 'row', id: 'row-' + c.key, 'data-open': String(open) });
  const btn = el('button', { class: 'row-btn', type: 'button', 'aria-expanded': String(open), 'aria-controls': 'det-' + c.key });
  const name = el('span', { class: 'row-name c-name' });
  name.append(el('b', {}, c.name), el('small', {}, c.description));
  const share = el('span', { class: 'share c-share' });
  if (svcTotal) {
    const track = el('span', { class: 'share-track' }); const fill = el('span', { class: 'share-fill' });
    fill.style.display = 'block'; fill.style.width = Math.max(0, v / svcTotal / maxShare * 100) + '%';
    track.appendChild(fill); share.append(track, el('small', {}, nb(v / svcTotal * 100, 1) + ' %'));
  }
  const p = prev ? pct(v, c.narvik_1000kr[prev]) : null;
  const cls = p === null || OFFSET_KEYS.includes(c.key) ? 'chg' : 'chg ' + (p > 0.5 ? 'up' : p < -0.5 ? 'down' : '');
  btn.append(name, share,
    el('span', { class: 'r num c-amt' }, nb(v / 1000, Math.abs(v) < 10000 ? 1 : 0)),
    el('span', { class: 'r num c-pc' }, nb(perCap(v, year))),
    el('span', { class: 'r c-chg ' + cls }, prev ? chgText(p) : '–'));
  btn.addEventListener('click', () => toggle(c.key));
  row.appendChild(btn);

  const det = el('div', { class: 'detail', id: 'det-' + c.key });
  det.hidden = !open;
  const scroll = el('div', { class: 'detail-scroll' });
  const t = el('table');
  const hr = el('tr'); hr.appendChild(el('th', {}, 'KOSTRA-funksjon (1000 kr)'));
  YEARS.forEach(y => hr.appendChild(el('th', y === year ? { class: 'sel' } : {}, y)));
  t.appendChild(hr);
  c.functions.filter(f => DATA.functions[f]).forEach(f => {
    const vals = YEARS.map(y => DATA.functions[f].narvik_1000kr[y]);
    if (vals.every(x => x === null || x === 0)) return;
    const tr = el('tr'); tr.appendChild(el('td', {}, `${f} ${DATA.functions[f].name}`));
    YEARS.forEach((y, i) => tr.appendChild(el('td', y === year ? { class: 'sel' } : {}, vals[i] === null ? '·' : nb(vals[i]))));
    t.appendChild(tr);
  });
  const tot = el('tr'); tot.appendChild(el('td', { style: 'font-weight:600' }, 'Sum'));
  YEARS.forEach(y => tot.appendChild(el('td', y === year ? { class: 'sel', style: 'font-weight:600' } : { style: 'font-weight:600' }, nb(c.narvik_1000kr[y]))));
  t.appendChild(tot);
  scroll.appendChild(t); det.appendChild(scroll);
  if (c.functions.includes('257')) det.appendChild(el('p', {}, 'Fra 2024 er hjemmetjenester (254) delt i 257 og 258. Summen for området er sammenlignbar over tid.'));
  det.appendChild(el('p', {}, '· betyr at funksjonen ikke fantes eller ikke er rapportert det året.'));
  row.appendChild(det);
  return row;
}

function toggle(key) {
  openRows.has(key) ? openRows.delete(key) : openRows.add(key);
  const r = document.getElementById('row-' + key), open = openRows.has(key);
  r.dataset.open = String(open);
  r.querySelector('.row-btn').setAttribute('aria-expanded', String(open));
  r.querySelector('.detail').hidden = !open;
}
function openRow(key) {
  if (!openRows.has(key)) toggle(key);
  document.getElementById('row-' + key).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function drawCompare() {
  // Use the selected year when SSB comparison figures exist for it, else the latest year that has them.
  const has = y => services.some(c => c.per_capita.landet[y] !== null);
  const cy = has(year) ? year : [...YEARS].reverse().find(has);
  const cap = document.getElementById('cmp-caption');
  if (!cy) { document.getElementById('cmp-chart').replaceChildren(); cap.textContent = 'Ingen sammenligningstall i datafilen.'; return; }
  cap.textContent = `Netto driftsutgifter per innbygger, ${cy}.` + (cy !== year ? ` Sammenligningstall for ${year} mangler i datafilen, derfor vises ${cy}.` : '');
  const pc = c => ({ narvik: perCap(c.narvik_1000kr[cy], cy), landet: c.per_capita.landet[cy], nordland: c.per_capita.nordland[cy] });
  const cats = services.map(c => ({ c, p: pc(c) })).filter(x => x.p.landet > 0 && x.p.narvik > 0).sort((a, b) => b.p.narvik - a.p.narvik);
  const W = 760, left = 210, right = 690, rowH = 30, y0 = 20, H = y0 + cats.length * rowH + 36;
  const max = Math.ceil(Math.max(...cats.flatMap(x => [x.p.narvik, x.p.landet, x.p.nordland || 0])) / 10000) * 10000;
  const X = v => left + v / max * (right - left);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Netto driftsutgifter per innbygger ${cy}, Narvik mot landet og Nordland` });
  for (let t = 0; t <= max; t += 10000) {
    svg.appendChild(s('line', { x1: X(t), x2: X(t), y1: y0 - 8, y2: H - 30, stroke: 'var(--rule)' }));
    svg.appendChild(s('text', { x: X(t), y: H - 12, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, nb(t)));
  }
  cats.forEach(({ c, p }, i) => {
    const y = y0 + i * rowH + 8;
    const present = [p.narvik, p.landet, p.nordland].filter(v => v !== null);
    const lo = Math.min(...present), hi = Math.max(...present);
    svg.appendChild(s('text', { x: 0, y: y + 4, 'font-size': 13, fill: 'var(--ink)' }, c.name));
    svg.appendChild(s('line', { x1: X(lo), x2: X(hi), y1: y, y2: y, stroke: 'var(--muted)', 'stroke-opacity': 0.5, 'stroke-width': 2 }));
    const dot = (v, attrs, label) => { if (v === null) return; const d = s('circle', Object.assign({ cx: X(v), cy: y }, attrs)); d.appendChild(s('title', {}, `${c.name}, ${label}: ${nb(v)} kr per innbygger`)); svg.appendChild(d); };
    dot(p.landet, { r: 5, fill: 'var(--muted)' }, 'landet');
    dot(p.nordland, { r: 5, fill: 'var(--surface)', stroke: 'var(--muted)', 'stroke-width': 1.5 }, 'Nordland');
    dot(p.narvik, { r: 6, fill: 'var(--accent)' }, 'Narvik');
    svg.appendChild(s('text', { x: X(hi) + 12, y: y + 4, 'font-size': 12.5, 'font-weight': 600, fill: 'var(--ink)' }, nb(p.narvik)));
  });
  document.getElementById('cmp-chart').replaceChildren(svg);
  const h = cats.find(x => x.c.key === 'helse');
  document.getElementById('cmp-lead').textContent = h
    ? `I ${cy} brukte Narvik ${nb(h.p.narvik)} kr per innbygger på helse og omsorg, ${nb(Math.abs(h.p.narvik / h.p.landet - 1) * 100)} % ${h.p.narvik >= h.p.landet ? 'mer' : 'mindre'} enn landsgjennomsnittet` + (h.p.nordland ? ` og ${nb(h.p.nordland)} kr i snitt i Nordland.` : '.')
    : '';
}

function drawTrend() {
  const W = 760, H = 260, left = 56, right = 740, y0 = 20, base = 220;
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
    svg.appendChild(s('text', { x: x + bw / 2, y: Y(v) - 8, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': sel ? 700 : 500, fill: sel ? 'var(--ink)' : 'var(--ink-2)' }, nb(v)));
    svg.appendChild(s('text', { x: x + bw / 2, y: base + 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': sel ? 700 : 400, fill: sel ? 'var(--ink)' : 'var(--ink-2)' }, y));
  });
  svg.appendChild(s('text', { x: left - 8, y: 10, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-2)' }, 'mill. kr'));
  document.getElementById('trend-chart').replaceChildren(svg);
  const first = vals[0], last = vals.at(-1), y1 = YEARS[0], y2 = YEARS.at(-1);
  document.getElementById('trend-lead').textContent = `Netto driftsutgifter økte fra ${nb(first)} til ${nb(last)} millioner kroner fra ${y1} til ${y2}, ${nb((last / first - 1) * 100)} %. Folketallet var omtrent det samme, ${nb(DATA.population[y1])} mot ${nb(DATA.population[y2])}.`;
}

// Budget section: renders site/data/budsjett.json (written by scripts/fetch_budget.py). Stays hidden if the file is missing.
async function startBudget() {
  let B;
  try {
    const res = await fetch('data/budsjett.json', { cache: 'no-cache' });
    if (!res.ok) return;
    B = await res.json();
  } catch (e) { return; }
  const find = (kind, year) => B.series.find(x => x.kind === kind && (!year || x.year === year));
  const src = x => B.sources[x.source];
  const mk = v => nb(v / 1000, Math.abs(v) < 10000 ? 1 : 0);
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + mk(Math.abs(v));
  const cite = x => {
    const a = el('a', { href: src(x).url, target: '_blank', rel: 'noopener' }, src(x).name);
    const span = el('span');
    span.append(a, `, ${B.table}, kolonne «${x.column}» (`);
    const links = [];
    if (x.data_url !== src(x).pdf) links.push(el('a', { href: x.data_url, target: '_blank', rel: 'noopener' }, 'data'));
    if (src(x).pdf) links.push(el('a', { href: src(x).pdf, target: '_blank', rel: 'noopener' }, `PDF s. ${src(x).pdf_page}`));
    links.forEach((a, i) => span.append(...(i ? [', ', a] : [a])));
    span.append(')');
    return span;
  };
  const RENAMED = 'Området Kommunedirektøren heter Rådmannen i dokumentene fra før 2026.';
  const caption = (id, list, extra) => {
    const c = document.getElementById(id); c.replaceChildren('Mill. kr, netto per tjenesteområde. Kilder: ');
    [...new Map(list.map(x => [x.id, x])).values()].forEach((x, i) => { if (i) c.append('; '); c.append(cite(x)); });
    c.append('. ' + (extra || ''));
  };
  const head = (cols) => {
    const h = el('div', { class: 'ledger-head' });
    cols.forEach((t, i) => h.appendChild(el('span', i > 1 ? { class: 'r' } : {}, t)));
    return h;
  };
  const row = (name, bar, a, aLabel, b, chg, chgCls, total) => {
    const r = el('div', { class: 'budget-row' + (total ? ' total' : '') });
    const y1 = el('span', { class: 'r num c-y1' }); y1.append(el('span', { class: 'm-label' }, aLabel + ' '), a);
    r.append(el('span', { class: 'c-name' }, name), bar || el('span', { class: 'c-share' }), y1, el('span', { class: 'r num c-amt' }, b), el('span', { class: 'r chg c-chg ' + chgCls }, chg));
    return r;
  };

  // Planned against spent: the latest year with both an adopted budget and accounts.
  const bud = [...B.series].reverse().find(x => x.kind === 'budsjett' && find('regnskap', x.year));
  if (bud) {
    const act = find('regnskap', bud.year), y = bud.year;
    const diffs = B.areas.map(a => act['1000kr'][a.key] - bud['1000kr'][a.key]);
    const maxDiff = Math.max(...diffs.map(Math.abs));
    const led = document.getElementById('budget-actual');
    led.replaceChildren(head(['Tjenesteområde', 'Avvik', `Budsjett ${y}`, `Regnskap ${y}`, 'Avvik']));
    B.areas.forEach((a, i) => {
      const d = diffs[i], bar = el('span', { class: 'c-share' }), dev = el('span', { class: 'dev', title: `${signed(d)} mill. kr` });
      const fill = el('span', { class: d > 0 ? 'over' : 'under' }); fill.style.width = (Math.abs(d) / maxDiff * 50) + '%';
      dev.appendChild(fill); bar.appendChild(dev);
      led.appendChild(row(a.name, bar, mk(bud['1000kr'][a.key]), 'Budsjett', mk(act['1000kr'][a.key]), signed(d), d > 500 ? 'up' : d < -500 ? 'down' : ''));
    });
    const dt = act.total_1000kr - bud.total_1000kr;
    led.appendChild(row('Sum', null, mk(bud.total_1000kr), 'Budsjett', mk(act.total_1000kr), signed(dt), dt > 0 ? 'up' : 'down', true));
    document.getElementById('h-budget').textContent = `Planlagt og brukt i ${y}`;
    const top = B.areas.map((a, i) => ({ a, d: diffs[i] })).sort((p, q) => q.d - p.d)[0];
    document.getElementById('budget-lead').textContent = `Kommunestyret vedtok ${mk(bud.total_1000kr)} mill. kr til driften av tjenesteområdene i ${y}. Regnskapet endte på ${mk(act.total_1000kr)} mill. kr, ${mk(Math.abs(dt))} mill. kr ${dt >= 0 ? 'mer' : 'mindre'}. ${top.d > 0 ? `Største avvik var ${top.a.name.toLowerCase()}, ${signed(top.d)} mill. kr.` : ''}`;
    caption('budget-actual-caption', [bud, act], `Budsjettet er det opprinnelige, slik det ble vedtatt i desember året før. Rammene justeres i løpet av året, for eksempel når lønnsoppgjøret fordeles fra fellesposten til tjenesteområdene, så avviket her er ikke det samme som et merforbruk. ${RENAMED}`);
    document.getElementById('budget').hidden = false;
  }

  // The newest budget year: the adopted budget if there is one, else the proposal, against the year before.
  const ny = B.series.filter(x => x.kind === 'budsjett' || x.kind === 'forslag').map(x => x.year).sort().at(-1);
  const cur = ny && (find('budsjett', ny) || find('forslag', ny)), prop = ny && find('forslag', ny);
  const base = cur && find('budsjett', String(+ny - 1));
  if (cur && base) {
    const adopted = cur.kind === 'budsjett', curLabel = `${adopted ? 'Vedtatt' : 'Forslag'} ${cur.year}`;
    const led = document.getElementById('plan-ledger');
    led.replaceChildren(head(['Tjenesteområde', 'Andel', `Vedtatt ${base.year}`, curLabel, 'Endring']));
    const maxShare = Math.max(...B.areas.map(a => cur['1000kr'][a.key] / cur.total_1000kr));
    B.areas.forEach(a => {
      const v = cur['1000kr'][a.key], p = pct(v, base['1000kr'][a.key]);
      const bar = el('span', { class: 'share c-share' }), track = el('span', { class: 'share-track' }), fill = el('span', { class: 'share-fill' });
      fill.style.display = 'block'; fill.style.width = Math.max(0, v / cur.total_1000kr / maxShare * 100) + '%';
      track.appendChild(fill); bar.append(track, el('small', {}, nb(v / cur.total_1000kr * 100, 1) + ' %'));
      led.appendChild(row(a.name, bar, mk(base['1000kr'][a.key]), `Vedtatt ${base.year}`, mk(v), chgText(p), p > 0.5 ? 'up' : p < -0.5 ? 'down' : ''));
    });
    const p = pct(cur.total_1000kr, base.total_1000kr);
    led.appendChild(row('Sum', null, mk(base.total_1000kr), `Vedtatt ${base.year}`, mk(cur.total_1000kr), chgText(p), p > 0 ? 'up' : 'down', true));
    document.getElementById('h-plan').textContent = `Budsjettet for ${cur.year}`;
    document.getElementById('plan-lead').textContent = adopted
      ? `Kommunestyret ga tjenesteområdene ${mk(cur.total_1000kr)} mill. kr for ${cur.year}, mot ${mk(base.total_1000kr)} mill. kr for ${base.year}.` + (prop ? ` Kommunedirektøren hadde foreslått ${mk(prop.total_1000kr)} mill. kr.` : '')
      : `Forslaget gir tjenesteområdene ${mk(cur.total_1000kr)} mill. kr i ${cur.year}, mot ${mk(base.total_1000kr)} mill. kr vedtatt for ${base.year}.`;
    const status = document.getElementById('plan-status');
    status.textContent = adopted ? '' : `Tallene for ${cur.year} er kommunedirektørens forslag, ikke kommunestyrets vedtak. Kommunestyrets vedtak kan avvike fra forslaget.`;
    status.hidden = adopted;
    const extra = adopted
      ? `Budsjettet for ${cur.year} er det opprinnelige, slik kommunestyret vedtok det. ${RENAMED}`
      : '';
    caption('plan-caption', adopted && prop ? [base, cur, prop] : [base, cur], `Endring er fra vedtatt ${base.year} til ${adopted ? 'vedtatt' : 'forslaget for'} ${cur.year}, i løpende kroner. ${extra}`);
    document.getElementById('plan').hidden = false;
  }
}

start();
startBudget();
