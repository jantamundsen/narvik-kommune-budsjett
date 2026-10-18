// Cost and income types behind each area's net spending, from site/data/detaljer.json (written by
// scripts/fetch_details.py from SSB table 12367). Used by app.js in the expanded rows of the ledger.
// Every number is either one or more cells of the table (named by art code) or computed from them, and then says so.
let DET = null;
let detScope = 'konsern';
const detFn = {}; // area key -> selected function code, or '' for the whole area

async function loadDetails() {
  try {
    const res = await fetch('data/detaljer.json', { cache: 'no-cache' });
    if (res.ok) DET = await res.json();
  } catch (e) { DET = null; }
}

// Sum one art over functions for every year; null when no function has a value.
function artSum(fs, art) {
  const vals = DET.values[detScope];
  return DET.years.map((_, i) => {
    let t = null;
    fs.forEach(f => { const v = vals[f]?.[art]?.[i]; if (v != null) t = (t ?? 0) + v; });
    return t;
  });
}
const add = (a, b, sign = 1) => a.map((v, i) => (v == null && b[i] == null ? null : (v ?? 0) + sign * (b[i] ?? 0)));
const zero = () => DET.years.map(() => null);

// The rows of the breakdown: groups, their SSB sub-arts and computed remainders, sums, net, and any gap to AGD2.
function detailRows(fs) {
  const rows = [];
  const side = { utgift: zero(), inntekt: zero() };
  DET.groups.forEach(g => {
    const v = g.arts.map(a => artSum(fs, a)).reduce((t, x) => add(t, x), zero());
    side[g.side] = add(side[g.side], v);
    rows.push({ kind: 'group', g, name: g.name, code: g.arts.join(' + '), v });
    if (!g.parts) return;
    let rest = v;
    g.parts.forEach(a => {
      const pv = artSum(fs, a);
      rest = add(rest, pv, -1);
      rows.push({ kind: 'part', name: DET.arts[a], code: a, v: pv });
    });
    rows.push({ kind: 'part', derived: true, name: g.rest, code: `${g.arts.join(' + ')} − ${g.parts.join(' − ')}`, v: rest.map(x => (x != null && Math.abs(x) < 1 ? 0 : x)) });
  });
  const net = artSum(fs, DET.net_art);
  const gap = add(net, add(side.utgift, side.inntekt, -1), -1);
  return { rows, side, net, gap };
}

function ssbQuery(fs) {
  const d = DET.source.dims, p = new URLSearchParams({ lang: 'no' });
  p.set(`valueCodes[${d.region}]`, DET.source.region.split(' ')[0]);
  p.set(`valueCodes[${d.scope}]`, DET.scopes[detScope].code);
  p.set(`valueCodes[${d.function}]`, fs.join(','));
  p.set(`valueCodes[${d.art}]`, Object.keys(DET.arts).join(','));
  p.set(`valueCodes[${d.contents}]`, DET.source.contents);
  p.set(`valueCodes[${d.year}]`, DET.years.join(','));
  return DET.source.api + '?' + decodeURIComponent(p.toString()) + '&outputFormat=html';
}

function breakdownFor(c) {
  const box = el('div', { class: 'breakdown', id: 'bd-' + c.key });
  if (!DET) return box;
  const all = c.functions.filter(f => DET.values[detScope][f]);
  if (!all.length) return box;
  const sel = all.includes(detFn[c.key]) ? detFn[c.key] : '';
  const fs = sel ? [sel] : all;
  const yi = DET.years.indexOf(year);
  const { rows, side, net, gap } = detailRows(fs);

  box.appendChild(el('h3', {}, 'Hva pengene går til og hvor de kommer fra'));

  const controls = el('div', { class: 'bd-controls' });
  const pick = el('select', { 'aria-label': 'Vis for' });
  pick.appendChild(el('option', { value: '' }, `Hele området (${all.length} funksjoner)`));
  all.forEach(f => pick.appendChild(el('option', { value: f }, `${f} ${DET.function_names[f]}`)));
  pick.value = sel;
  pick.addEventListener('change', () => { detFn[c.key] = pick.value; redrawBreakdown(c); });
  const scopes = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Regnskapsomfang' });
  Object.entries(DET.scopes).forEach(([k, s]) => {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(k === detScope), title: s.note }, s.name);
    b.addEventListener('click', () => { detScope = k; document.querySelectorAll('.breakdown').forEach(n => redrawBreakdown(services.concat(offsets).find(x => 'bd-' + x.key === n.id))); });
    scopes.appendChild(b);
  });
  controls.append(pick, scopes);
  box.appendChild(controls);

  if (yi < 0) { box.appendChild(el('p', {}, `SSB har ikke artsfordelte tall for ${year} ennå.`)); return box; }

  const hasYear = (side.utgift[yi] ?? 0) > 0 || (side.inntekt[yi] ?? 0) > 0;
  if (!hasYear) box.appendChild(el('p', {}, `${sel ? 'Funksjon ' + sel : 'Området'} har ingen tall i ${year}. Tabellen viser årene som har tall.`));
  // Two stacked bars on one scale: what it cost, and what came in. The gap between them is the net.
  const groups = rows.filter(r => r.kind === 'group');
  const max = Math.max(side.utgift[yi] ?? 0, side.inntekt[yi] ?? 0);
  const bars = el('div', { class: 'bd-bars', ...(hasYear ? {} : { hidden: '' }) });
  ['utgift', 'inntekt'].forEach(sd => {
    const line = el('div', { class: 'bd-line' });
    line.appendChild(el('span', { class: 'bd-label' }, sd === 'utgift' ? 'Utgifter' : 'Inntekter'));
    const track = el('div', { class: 'bd-track' });
    const gs = groups.filter(r => r.g.side === sd && (r.v[yi] ?? 0) > 0);
    gs.forEach((r, i) => {
      const seg = el('span', { class: 'bd-seg ' + sd, title: `${r.name}: ${nb(r.v[yi] / 1000, 1)} mill. kr (${r.code})` });
      seg.style.width = (max ? r.v[yi] / max * 100 : 0) + '%';
      seg.style.setProperty('--mix', Math.max(25, 100 - i * 14) + '%');
      track.appendChild(seg);
    });
    line.append(track, el('span', { class: 'bd-amt num' }, nb((side[sd][yi] ?? 0) / 1000, 1) + ' mill.'));
    bars.appendChild(line);
  });
  box.appendChild(bars);
  const legend = el('ul', { class: 'bd-legend', ...(hasYear ? {} : { hidden: '' }) });
  ['utgift', 'inntekt'].forEach(sd => groups.filter(r => r.g.side === sd && (r.v[yi] ?? 0) > 0).forEach((r, i) => {
    const li = el('li'); const sw = el('i', { class: 'bd-seg ' + sd }); sw.style.setProperty('--mix', Math.max(25, 100 - i * 14) + '%');
    const sh = r.v[yi] / (side[sd][yi] || 1) * 100;
    li.append(sw, document.createTextNode(`${r.name} ${nb(sh, sh < 1 ? 1 : 0)} %`));
    legend.appendChild(li);
  }));
  box.appendChild(legend);

  // The table: every group with SSB's sub-arts, the computed remainders, the sums and the net.
  const scroll = el('div', { class: 'detail-scroll' });
  const t = el('table', { class: 'bd-table' });
  const hr = el('tr'); hr.append(el('th', {}, '1000 kr'), el('th', { class: 'code' }, 'Art'));
  DET.years.forEach(y => hr.appendChild(el('th', y === year ? { class: 'sel' } : {}, y)));
  t.appendChild(hr);
  const show = v => v.some(x => x != null && x !== 0);
  const line = (name, code, v, cls = '', note) => {
    const tr = el('tr', { class: cls });
    const td = el('td', note ? { title: note } : {}, name);
    tr.append(td, el('td', { class: 'code' }, code));
    DET.years.forEach((y, i) => tr.appendChild(el('td', y === year ? { class: 'sel' } : {}, v[i] == null ? '·' : nb(v[i]))));
    t.appendChild(tr);
  };
  const head = text => { const tr = el('tr', { class: 'bd-side' }); const td = el('td', { colspan: 2 + DET.years.length }, text); tr.appendChild(td); t.appendChild(tr); };
  ['utgift', 'inntekt'].forEach(sd => {
    head(sd === 'utgift' ? 'Utgifter' : 'Inntekter');
    let inGroup = null;
    rows.forEach(r => {
      if (r.kind === 'group') inGroup = r.g;
      if (inGroup.side !== sd || !show(r.v)) return;
      if (r.kind === 'group') line(r.name, r.code, r.v, 'bd-group', r.g.note);
      else line(r.derived ? `${r.name} (beregnet)` : r.name, r.derived ? 'beregnet' : r.code, r.v, 'bd-part' + (r.derived ? ' derived' : ''), r.derived ? `Beregnet: ${r.code}` : undefined);
    });
    line(sd === 'utgift' ? 'Sum utgifter' : 'Sum inntekter', 'beregnet', side[sd], 'bd-sum derived', 'Summen av gruppene over');
  });
  head('Resultat');
  if (show(gap)) line('Ikke fordelt på art hos SSB (beregnet)', 'beregnet', gap, 'bd-part derived', `Beregnet: ${DET.net_art} − (sum utgifter − sum inntekter)`);
  line('Netto driftsutgifter', DET.net_art, net, 'bd-sum');
  scroll.appendChild(t);
  box.appendChild(scroll);

  const cap = el('p', { class: 'caption' });
  cap.append(`Kilde: SSB, tabell ${DET.source.table}, ${DET.scopes[detScope].name.toLowerCase()} (omfang ${DET.scopes[detScope].code}), ${fs.length === 1 ? 'funksjon ' + fs[0] : 'funksjonene ' + fs.join(', ')}. Hver linje er artskoden i kolonnen «Art» hos SSB. Linjer merket «beregnet» er regnet ut her. `);
  const a = el('a', { href: ssbQuery(fs), target: '_blank', rel: 'noopener' }, 'Se tallene hos SSB');
  cap.append(a, '.');
  if (show(gap)) cap.append(' For konsernet oppgir SSB et netto som for noen funksjoner ikke er lik summen av artene. Forskjellen står som egen linje. I kommunekassen går artene opp i netto.');
  box.appendChild(cap);
  return box;
}

function redrawBreakdown(c) {
  const old = document.getElementById('bd-' + c.key);
  if (old) old.replaceWith(breakdownFor(c));
}
