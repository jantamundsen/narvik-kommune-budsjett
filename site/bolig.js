// bolig.html: the dwellings in Narvik, how many new ones are built, prices, owners and renters, and the dwellings
// the kommune has at its disposal, each against the comparison regions. Renders site/data/bolig.json (written by
// scripts/fetch_bolig.py from SSB). Helpers are in common.js.
let B;

const pc = (v, d = 1) => (v == null ? '·' : nb(v, d) + ' %');
const num = v => (v == null ? '·' : nb(v));
const region = k => B.regions.find(r => r.key === k);
const PLAIN = ['narvik', 'harstad', 'rana', 'alta', 'nordland', 'norge'];
const KOSTRA = ['narvik', 'harstad', 'rana', 'alta', 'gruppe', 'nordland', 'landet'];
const ssb = (t, text) => `<a href="${B.sources[t].query}&outputFormat=html" target="_blank" rel="noopener">${text || 'SSB tabell ' + t}</a>`;
const quarter = q => q.replace('K', '. kv. ');
const shortQ = q => `${q.slice(2, 4)} K${q.slice(-1)}`;

async function start() {
  try {
    const res = await fetch('data/bolig.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    B = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/bolig.json. Kjør <code>python scripts/fetch_bolig.py</code> og åpne siden via en webserver.';
    return;
  }
  document.getElementById('generated').textContent = new Date(B.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const tables = [...new Map(Object.values(B.sources).map(s => [s.table, s.url])).entries()];
  document.getElementById('sources').innerHTML = tables.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`).join(', ');
  const y = B.year, stock = B.stock[y], total = Object.values(stock).reduce((a, b) => a + b, 0);
  const tYear = Object.keys(B.tenure.narvik).at(-1), ten = B.tenure.narvik[tYear];
  const qs = Object.keys(B.prices.narvik).sort();
  const households = ten['0']?.n, owns = ten['1'].pct + ten['2'].pct;

  document.getElementById('lead').textContent = `Narvik hadde ${nb(total)} boliger i ${y} og ${nb(households)} husholdninger i ${tYear}. ${nb(stock['01'] / total * 100)} % av boligene er eneboliger. ${nb(owns, 1)} % av husholdningene eier boligen de bor i.`;
  const first = Object.keys(B.stock)[0], fTotal = Object.values(B.stock[first]).reduce((a, b) => a + b, 0);
  document.getElementById('summary').innerHTML = [
    ['Boliger', nb(total), `${chgText(pct(total, fTotal))} siden ${first}`],
    ['Eier boligen', pc(owns), `av ${nb(households)} husholdninger i ${tYear}, selveiere og andels- eller aksjeeiere`],
  ].map(([label, big, sub]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span></div>`).join('');

  drawTypes(y, total);
  drawAge(y);
  drawNew();
  drawPrices(qs);
  drawTenure(tYear);
  drawMunicipal();
}

// One bar row per item: [label, value, right-hand text], scaled to the largest value.
function bars(rows) {
  const max = Math.max(...rows.map(r => r[1]));
  return rows.map(([label, v, note]) => `<div class="hb bo"><span>${label}</span><span class="track"><i style="width:${v / max * 100}%"></i></span><span class="r">${nb(v)}</span><span class="r muted">${note}</span></div>`).join('');
}

function table(id, cols, keys) {
  const t = document.getElementById(id);
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${keys.map(k => region(k)).filter(Boolean).map(r =>
    `<tr${r.key === 'narvik' ? ' class="me"' : ''}><td>${r.name}</td>${cols.map(c => `<td>${c.get(r.key) ?? '·'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  stackable(t);
}

function drawTypes(y, total) {
  const stock = B.stock[y];
  document.getElementById('types-h').textContent = `Boliger etter bygningstype, ${y}`;
  document.getElementById('stock-types').innerHTML = bars(B.types.map(t => [t.name, stock[t.code] ?? 0, pc((stock[t.code] ?? 0) / total * 100, 0)]));
  document.getElementById('types-lead').textContent = `${nb((stock['01'] ?? 0) / total * 100)} % av boligene i Narvik er eneboliger, mot ${B.shares.norge?.['01'] ?? '·'} % i landet. ${nb((stock['04'] ?? 0) / total * 100)} % er leiligheter i boligblokk, mot ${B.shares.norge?.['04'] ?? '·'} % i landet.`;
  document.getElementById('types-caption').innerHTML = `Boliger per 1. januar ${y}, bebodde og ubebodde. ${ssb('06265', 'Se tallene hos SSB')} (tabell 06265).`;
  table('types-cmp', [
    { label: 'Enebolig', get: k => pc(B.shares[k]?.['01'], 0) },
    { label: 'Tomannsbolig', get: k => pc(B.shares[k]?.['02'], 0) },
    { label: 'Rekkehus og småhus', get: k => pc(B.shares[k]?.['03'], 0) },
    { label: 'Boligblokk', get: k => pc(B.shares[k]?.['04'], 0) },
    { label: 'Bofellesskap og andre', get: k => B.shares[k] ? pc((B.shares[k]['05'] ?? 0) + (B.shares[k]['999'] ?? 0), 0) : '·' },
  ], PLAIN);
  document.getElementById('types-cmp-caption').innerHTML = `Andel av boligene etter bygningstype, ${y}. SSB runder av til hele prosent, så radene summerer ikke alltid til 100. ${ssb('12941')}.`;
}

// Shares are of the dwellings with a known year of construction, so they add up to 100 and compare across regions.
const BANDS = [
  { label: '2001 og senere', test: c => c >= '11' },
  { label: '1981–2000', test: c => c === '09' || c === '10' },
  { label: '1946–1980', test: c => c >= '06' && c <= '08' },
  { label: 'Før 1946', test: c => c <= '04' },
];

function drawAge(y) {
  const known = k => Object.entries(B.age[k] || {}).filter(([c]) => c !== '99');
  const share = (k, test) => {
    const rows = known(k), all = rows.reduce((a, [, v]) => a + v, 0);
    return all ? rows.filter(([c]) => test(c)).reduce((a, [, v]) => a + v, 0) / all * 100 : null;
  };
  const periods = B.periods.filter(p => p.code !== '99').reverse();
  const N = B.age.narvik, base = known('narvik').reduce((a, [, v]) => a + v, 0);
  document.getElementById('age-h').textContent = `Boliger etter byggeår, ${y}, nyeste først`;
  document.getElementById('stock-age').innerHTML = bars(periods.map(p => [p.name.replace('-', '–'), N[p.code] ?? 0, pc((N[p.code] ?? 0) / base * 100, 0)]));
  const before = share('narvik', c => c <= '08'), after = share('narvik', BANDS[0].test);
  document.getElementById('age-lead').textContent = `${nb(before)} % av boligene i Narvik er bygget før 1981, mot ${nb(share('norge', c => c <= '08'))} % i landet. ${nb(after)} % er bygget i 2001 eller senere, mot ${nb(share('norge', BANDS[0].test))} % i landet.`;
  document.getElementById('age-caption').innerHTML = `Boliger per 1. januar ${y}, bebodde og ubebodde, med kjent byggeår. ${nb(N['99'] ?? 0)} boliger har ukjent byggeår og er ikke med. ${ssb('06266', 'Se tallene hos SSB')} (tabell 06266).`;
  table('age-cmp', BANDS.map(b => ({ label: b.label, get: k => pc(share(k, b.test), 0) })), PLAIN);
  document.getElementById('age-cmp-caption').innerHTML = `Andel av boligene med kjent byggeår, ${y}, beregnet her fra SSBs antall boliger per byggeår. ${ssb('06266')}.`;
}

function drawNew() {
  const N = B.built.narvik, years = Object.keys(N).sort();
  document.getElementById('new-chart').innerHTML = columns(years.map(y => ({ y, v: N[y].Fullforte ?? null })), v => nb(v), years.at(-1));
  const last = years.at(-1), span = years.slice(-5);
  const sum = (k, m) => span.reduce((a, y) => a + (B.built[k]?.[y]?.[m] ?? 0), 0);
  const pop = k => region(k)?.population?.[last];
  const n5 = sum('narvik', 'Fullforte');
  document.getElementById('new-lead').textContent = `${nb(N[last].Fullforte)} nye boliger ble fullført i Narvik i ${last}, og det ble gitt igangsettingstillatelse til ${nb(N[last].Igangsatte)}. Fra ${span[0]} til ${last} ble det fullført ${nb(n5)} boliger, ${nb(n5 / pop('narvik') * 1000, 1)} per 1000 innbyggere.`;
  document.getElementById('new-caption').innerHTML = `Fullførte boliger, alle bygningstyper, tilbygg og påbygg inkludert. SSB har tall for dagens Narvik fra ${years[0]}. ${ssb('05940', 'Se tallene hos SSB')} (tabell 05940).`;
  table('new-cmp', [
    { label: `Fullført ${span[0]}–${last}`, get: k => num(B.built[k] ? sum(k, 'Fullforte') : null) },
    { label: 'Per 1000 innb., beregnet', get: k => (B.built[k] && pop(k) ? nb(sum(k, 'Fullforte') / pop(k) * 1000, 1) : '·') },
    { label: `Igangsatt ${last}`, get: k => num(B.built[k]?.[last]?.Igangsatte) },
  ], PLAIN);
  document.getElementById('new-cmp-caption').innerHTML = `Per 1000 innbyggere er regnet ut her: fullførte boliger delt på folketallet ${last}. Hele landet har ikke folketall i datagrunnlaget her. ${ssb('05940')}.`;
}

function drawPrices(qs) {
  const P = B.prices.narvik, lq = qs.at(-1);
  document.getElementById('price-chart').innerHTML = columns(qs.map(q => ({ y: q, v: P[q]['00']?.price ?? null })), v => nb(Math.round(v / 100) / 10, 1), lq)
    .replace(/<small>(\d{4})K(\d)<\/small>/g, (_, y, k) => `<small>${shortQ(y + 'K' + k)}</small>`);
  const types = B.price_types.filter(t => t.code !== '00').map(t => ({ ...t, ...P[lq][t.code] }));
  const n = B.prices.norge?.[lq]?.['00']?.price, me = P[lq]['00'].price;
  document.getElementById('price-lead').textContent = `Boliger i Narvik ble solgt for ${nb(me)} kr per kvadratmeter i snitt i ${quarter(lq)}, ${nb(Math.abs(me / n - 1) * 100)} % ${me < n ? 'lavere' : 'høyere'} enn snittet i landet. ${types.map(t => `${t.name} ${nb(t.price)} kr`).join(', ')}.`;
  document.getElementById('price-caption').innerHTML = `Tusen kroner per kvadratmeter innvendig bruksareal, alle boligtyper. SSB har kvadratmeterpris for hver kommune fra ${quarter(qs[0])}. ${ssb('14310', 'Se tallene hos SSB')} (tabell 14310).`;
  const g = (k, t, f) => B.prices[k]?.[lq]?.[t]?.[f];
  table('price-cmp', [
    { label: 'Alle boligtyper, kr per m²', get: k => num(g(k, '00', 'price')) },
    { label: 'Eneboliger', get: k => num(g(k, '01', 'price')) },
    { label: 'Småhus', get: k => num(g(k, '02', 'price')) },
    { label: 'Blokkleiligheter', get: k => num(g(k, '03', 'price')) },
    { label: 'Antall salg', get: k => num(g(k, '00', 'sales')) },
  ], PLAIN);
  document.getElementById('price-cmp-caption').innerHTML = `Gjennomsnittlig kvadratmeterpris, ${quarter(lq)}. · betyr at SSB ikke har tallet, for eksempel fordi det var for få salg. ${ssb('14310')}.`;
}

function drawTenure(y) {
  const T = B.tenure.narvik[y];
  const bar = document.getElementById('tenure-bar'), legend = document.getElementById('tenure-legend');
  bar.replaceChildren(); legend.replaceChildren();
  B.tenure_types.forEach((t, i) => {
    const v = T[t.code]?.pct ?? 0;
    const s = el('span', { title: `${t.name}: ${nb(v, 1)} %` });
    s.style.flex = `0 0 ${v}%`;
    s.style.background = `color-mix(in srgb, var(--accent) ${100 - i * 30}%, var(--surface))`;
    if (v >= 9) s.appendChild(el('span', {}, nb(v) + ' %'));
    bar.appendChild(s);
    const li = el('li');
    li.append(el('span', { class: 'kr' }, nb(v) + ' %'), el('span', {}, `${t.name} (${nb(T[t.code]?.n ?? 0)})`));
    legend.appendChild(li);
  });
  const ys = Object.keys(B.tenure.narvik).sort(), f = ys[0];
  const cr = B.crowded.narvik[y];
  document.getElementById('tenure-lead').textContent = `${nb(T['1'].pct + T['2'].pct, 1)} % av husholdningene i Narvik eide boligen sin i ${y}, og ${nb(T['3'].pct, 1)} % leide, mot ${nb(B.tenure.narvik[f]['3'].pct, 1)} % i ${f}. ${nb(cr.pct, 1)} % av husholdningene, ${nb(cr.n)}, bodde trangt.`;
  table('tenure-cmp', [
    { label: 'Selveier', get: k => pc(B.tenure[k]?.[y]?.['1']?.pct) },
    { label: 'Andels- eller aksjeeier', get: k => pc(B.tenure[k]?.[y]?.['2']?.pct) },
    { label: 'Leier', get: k => pc(B.tenure[k]?.[y]?.['3']?.pct) },
    { label: 'Bor trangt', get: k => pc(B.crowded[k]?.[y]?.pct) },
  ], PLAIN);
  document.getElementById('tenure-caption').innerHTML = `Husholdninger i privathusholdninger, ${y}. Andels- eller aksjeeier er for eksempel borettslag. ${ssb('14891', 'Eie og leie hos SSB')} (tabell 14891), ${ssb('14903', 'bor trangt hos SSB')} (tabell 14903). Se også <a href="befolkning#hh">husholdningene på Befolkning</a>.`;
}

function drawMunicipal() {
  const M = B.municipal.narvik, ys = Object.keys(M).sort(), y = ys.at(-1), m = M[y];
  const other = m.total - m.owned - m.rented_in - (m.private ?? 0);
  const rows = [['Leid inn fra andre', m.rented_in], ['Eid av kommunen', m.owned], ['Privateide med kommunal tildelingsrett', m.private ?? 0]];
  if (other > 0) rows.push(['Andre', other]);
  document.getElementById('mun-split-h').textContent = `Hvem som eier boligene, ${y}`;
  document.getElementById('mun-split').innerHTML = bars(rows.map(([n, v]) => [n, v, pc(v / m.total * 100, 0)]));
  document.getElementById('mun-chart').innerHTML = columns(ys.map(x => ({ y: x, v: M[x].applications ?? null })), v => nb(v), y);
  document.getElementById('mun-lead').innerHTML = `Kommunen disponerte ${nb(m.total)} boliger i ${y}, ${nb(m.per_1000)} per 1000 innbyggere. ${nb(m.owned)} av dem eide kommunen selv, og ${nb(m.rented_in)} var leid inn fra andre. Kommunen fikk ${nb(m.applications)} søknader om kommunal bolig, og ${nb(m.refused_pct)} % av søkerne fikk avslag. Hva kommunen bruker på boligene, står under <a href="omrade?omrade=bolig&aar=${y}">Kommunale boliger</a> i utgiftene.`;
  document.getElementById('mun-caption').innerHTML = `Kommunalt disponerte boliger per 31. desember ${y}, og søknader i løpet av året. ${ssb('12008', 'Boligene hos SSB')} (tabell 12008), ${ssb('12012', 'søknadene hos SSB')} (tabell 12012).`;
  const g = (k, f) => B.municipal[k]?.[y]?.[f];
  table('mun-cmp', [
    { label: 'Boliger per 1000 innb.', get: k => num(g(k, 'per_1000')) },
    { label: 'Eid av kommunen, beregnet', get: k => (g(k, 'total') ? pc(g(k, 'owned') / g(k, 'total') * 100, 0) : '·') },
    { label: 'Søkere med avslag', get: k => pc(g(k, 'refused_pct'), 0) },
    { label: 'Tilgjengelig for rullestolbrukere', get: k => pc(g(k, 'accessible_pct'), 0) },
  ], KOSTRA);
  document.getElementById('mun-cmp-caption').innerHTML = `KOSTRA, ${y}. Andelen eid av kommunen er regnet ut her: kommunalt eide boliger delt på alle boliger kommunen disponerer. KOSTRA-gruppe 9, Nordland og landet uten Oslo er SSBs egne tall for gruppen. ${ssb('12008')}, ${ssb('12012')}.`;
}

start();
