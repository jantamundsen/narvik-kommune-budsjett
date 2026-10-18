// Helpers shared by app.js (index.html) and budsjett.js (budsjett.html).
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
