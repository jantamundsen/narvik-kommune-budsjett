// Helpers shared by app.js (index.html), budsjett.js (budsjett.html), omrade.js and lopende.js.
const nb = (v, d = 0) => v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
const pct = (a, b) => (b ? (a - b) / Math.abs(b) * 100 : null);
const chgText = p => (p === null ? '–' : (p > 0 ? '+' : p < 0 ? '−' : '') + nb(Math.abs(p), 1) + ' %');
// The year in the address (?aar=2024), so the two pages can link to the same year.
const urlYear = () => new URLSearchParams(location.search).get('aar');
// Link to the SSB 12362 query behind a per-capita comparison: these regions, these functions, net (AGD2), per inhabitant.
// N is narvik.json; codes include the old numbers of renumbered kommuner so earlier years show too.
function ssbCompareUrl(N, fs, years) {
  const d = N.source.dims, p = new URLSearchParams({ lang: 'no' });
  p.set(`valueCodes[${d.region}]`, ['1806', ...N.compare.flatMap(r => [r.code, ...(r.earlier || [])])].join(','));
  p.set(`valueCodes[${d.function}]`, fs.join(','));
  p.set(`valueCodes[${d.art}]`, 'AGD2');
  p.set(`valueCodes[${d.contents}]`, N.source.per_capita);
  p.set(`valueCodes[${d.year}]`, years.join(','));
  return N.source.api + '?' + decodeURIComponent(p.toString()) + '&outputFormat=html';
}
// One line about a comparison region: "kommune, 25 204 innb." or "snitt av 27 kommuner".
function regionNote(N, r, y) {
  if (r.kind === 'kommune') return r.population?.[y] ? `${nb(r.population[y])} innbyggere` : 'Kommune';
  if (r.kind === 'gruppe') return N.kostra_group ? `Snitt av ${N.kostra_group.members.length} kommuner` : 'Snitt';
  return r.key === 'landet' ? 'Snitt av alle kommuner utenom Oslo' : 'Snitt av kommunene i fylket';
}
// «Bak tallene»: facts from data/fakta.json (typed in from the kommune's own reports by scripts/build_fakta.py),
// as list items. F is fakta.json; showArea adds which of the kommune's own areas a fact is about.
function factItems(F, list, showArea) {
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return list.map(f => {
    const k = F.kilder[f.kilde.id];
    const src = `<a href="${h(k.pdf)}#page=${f.kilde.side}" target="_blank" rel="noopener" title="${h(k.full)}${f.kilde.del ? ', ' + h(f.kilde.del) : ''}">${h(k.navn)}, s. ${f.kilde.side}</a>`;
    const area = showArea ? ` · ${f.kommunalomrade === 'Hele kommunen' ? 'Gjelder hele kommunen' : `Gjelder kommunalområdet ${h(f.kommunalomrade)}`}` : '';
    return `<li class="fact"><span class="eyebrow">${h(f.tema)} · ${h(f.periode)} ${h(f.aar)}</span><p>${h(f.tekst)}</p>`
      + (f.sitat ? `<blockquote class="fact-quote"><span class="eyebrow">Kommunens forklaring</span><p>«${h(f.sitat)}»</p></blockquote>` : '')
      + (f.merknad ? `<p class="caption">${h(f.merknad)}</p>` : '')
      + `<p class="caption fact-src">Kilde: ${src}${area}</p></li>`;
  }).join('');
}
// Columns for each year around a zero line, so a deficit points down. vals is [{y, v}], fmt formats a label
// and sel is the selected year. Used on inntekter.html and gjeld.html.
function columns(vals, fmt, sel) {
  const max = Math.max(...vals.map(x => Math.abs(x.v ?? 0)), 0.0001);
  const hasNeg = vals.some(x => x.v < 0);
  const H = 120, up = hasNeg ? H * 0.62 : H, down = hasNeg ? H * 0.38 : 0;
  const scale = Math.max(...vals.map(x => (x.v > 0 ? x.v / up : -x.v / down) || 0), 0.0001);
  return `<div class="cols" style="--up:${up}px;--down:${down}px">${vals.map(x => {
    const h = x.v == null ? 0 : Math.abs(x.v) / scale;
    const neg = x.v < 0;
    return `<div class="col${x.y === sel ? ' sel' : ''}${neg ? ' neg' : ''}"><span class="up">${neg ? '' : `<b>${x.v == null ? '·' : fmt(x.v)}</b><i style="height:${h}px"></i>`}</span><span class="down">${neg ? `<i style="height:${h}px"></i><b>${fmt(x.v)}</b>` : ''}</span><small>${x.y}</small></div>`;
  }).join('')}</div>`;
}

// inntekter.html and gjeld.html: on narrow screens each row becomes a card: the first cell is its title and the others carry their column heading.
function stackable(table) {
  const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent);
  table.classList.add('stack');
  table.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
    if (i && heads[i]) td.dataset.label = heads[i];
  }));
}
// The «Økonomi» menu on pages outside the economy area is a <details>; close it on a click elsewhere or Escape.
document.addEventListener('click', e => {
  document.querySelectorAll('.nav-menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.nav-menu[open]').forEach(d => { d.open = false; d.querySelector('summary').focus(); });
});
