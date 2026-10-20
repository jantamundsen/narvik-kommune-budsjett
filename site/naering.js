// naering.html: businesses in Narvik from SSB (bedrifter by industry and size, new enterprises, how many survive,
// bankruptcies, overnight stays) and the largest workplaces from Enhetsregisteret, each against the comparison
// regions. Renders site/data/naering.json (written by scripts/fetch_naering.py). Helpers are in common.js.
let D;

const pc = (v, d = 1) => (v == null ? '·' : v > 0 && v < 0.05 ? 'under 0,1 %' : nb(v, v > 0 && v < 1 ? Math.max(d, 1) : d) + ' %');
const num = v => (v == null ? '·' : nb(v));
const region = k => D.regions.find(r => r.key === k);
const KEYS = ['narvik', 'harstad', 'rana', 'alta', 'nordland', 'norge'];
const ssb = (t, text) => `<a href="${D.sources[t].query}&outputFormat=html" target="_blank" rel="noopener">${text || 'SSB tabell ' + t}</a>`;
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const month = m => `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const quarter = q => `${q.slice(5)}. kvartal ${q.slice(0, 4)}`;
const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Enhetsregisteret writes names in capitals; show them as ordinary words, keeping AS, HF, IKS and the like.
const KEEP = new Set(['AS', 'ASA', 'HF', 'IKS', 'SF', 'KF', 'UIT', 'LKAB', 'UH', 'NAV']);
const SMALL = new Set(['OG', 'I', 'FOR', 'AV', 'PÅ', 'TIL', 'MED']);
const cap = w => w.split('-').map(p => (p ? p[0] + p.slice(1).toLowerCase() : p)).join('-');
const nice = s => s.split(' ').map((w, i) => (w === 'AVD' ? 'avd.' : KEEP.has(w) ? w : i && SMALL.has(w) ? w.toLowerCase() : cap(w))).join(' ');

async function start() {
  try {
    const res = await fetch('data/naering.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/naering.json. Kjør <code>python scripts/fetch_naering.py</code> og åpne siden via en webserver.';
    return;
  }
  document.getElementById('generated').textContent = new Date(D.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('sources').innerHTML = Object.values(D.sources).map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.table}</a>`).join(', ');

  const y = Object.keys(D.units.narvik).at(-1), units = D.units.narvik[y]['00-99|99'];
  const nq = last4('new', 'narvik'), bq = last4('bankruptcies', 'narvik');
  document.getElementById('lead').textContent = `Det var ${nb(units)} bedrifter i Narvik 1. januar ${y}. Fra ${quarter(nq.from)} til ${quarter(nq.to)} ble det registrert ${nb(nq.now)} nye foretak, og ${nb(bq.now)} foretak gikk konkurs.`;
  document.getElementById('summary').innerHTML = [
    ['Bedrifter', nb(units), `1. januar ${y}, ${nb(D.units.narvik[y]['00-99|00'])} av dem uten ansatte`],
    ['Nye foretak', nb(nq.now), `siste fire kvartaler, ${chgText(pct(nq.now, nq.before))} fra fire kvartaler før`],
    ['Konkurser', nb(bq.now), `siste fire kvartaler, mot ${nb(bq.before)} fire kvartaler før`],
  ].map(([label, big, sub]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span></div>`).join('');

  drawUnits(y);
  drawNew();
  drawSurvival();
  drawBankruptcies();
  drawStays();
  drawBig();
}

// The sum of the last four quarters Narvik has, and of the four before, for one region.
function last4(part, k) {
  const qs = Object.keys(D[part].narvik), now = qs.slice(-4), before = qs.slice(-8, -4);
  const s = list => (list.every(q => D[part][k]?.[q] != null) ? list.reduce((a, q) => a + D[part][k][q], 0) : null);
  return { now: s(now), before: s(before), from: now[0], to: now.at(-1) };
}
// Whole years in a quarterly series.
function yearly(part, k) {
  const S = D[part][k] || {}, out = {};
  Object.entries(S).forEach(([q, v]) => { (out[q.slice(0, 4)] ||= []).push(v); });
  return Object.fromEntries(Object.entries(out).filter(([, vs]) => vs.length === 4).map(([y, vs]) => [y, vs.reduce((a, b) => a + b, 0)]));
}
const perThousand = (v, k, y) => { const p = D.population[k]?.[y]; return v != null && p ? v / p * 1000 : null; };

function bars(rows, fmt = nb, cls = 'ab') {
  const max = Math.max(...rows.map(r => r[1]));
  return rows.map(([label, v, note]) => `<div class="hb ${cls}"><span>${label}</span><span class="track"><i style="width:${v / max * 100}%"></i></span><span class="r">${fmt(v)}</span><span class="r muted">${note}</span></div>`).join('');
}

function table(id, cols, keys = KEYS) {
  const t = document.getElementById(id);
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${keys.map(k => region(k)).filter(Boolean).map(r =>
    `<tr${r.key === 'narvik' ? ' class="me"' : ''}><td>${r.name}</td>${cols.map(c => `<td>${c.get(r.key) ?? '·'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  stackable(t);
}

// Shorter names for SSB's main industries.
const SHORT = {
  '01-03': 'Jordbruk, skogbruk og fiske', '05-09': 'Bergverk', '10-33': 'Industri', '35': 'Kraftforsyning',
  '36-39': 'Vann, avløp og renovasjon', '41-43': 'Bygg og anlegg', '45-47': 'Varehandel', '49-53': 'Transport og lagring',
  '55-56': 'Overnatting og servering', '58-63': 'Informasjon og kommunikasjon', '64-66': 'Finans og forsikring',
  '68': 'Eiendom', '69-75': 'Faglig og teknisk tjenesteyting', '77-82': 'Forretningsmessig tjenesteyting',
  '84.100-84.399': 'Offentlig administrasjon og forsvar', '85': 'Undervisning', '86-88': 'Helse og sosiale tjenester',
  '90-93': 'Kultur og fritid', '94-96': 'Personlig tjenesteyting',
};
const SIZE_GROUPS = [
  { key: 'alle', name: 'Alle', title: 'alle størrelser', codes: ['99'] },
  { key: '0', name: 'Ingen', title: 'uten ansatte', codes: ['00'] },
  { key: '1-9', name: '1–9', title: '1–9 ansatte', codes: ['01', '02'] },
  { key: '10-49', name: '10–49', title: '10–49 ansatte', codes: ['03', '04'] },
  { key: '50', name: '50+', title: '50 ansatte eller flere', codes: ['05', '15', '16'] },
];
const SIZES = [['00', 'Ingen ansatte'], ['01', '1–4'], ['02', '5–9'], ['03', '10–19'], ['04', '20–49'], ['05', '50–99'], ['15', '100–249'], ['16', '250 eller flere']];

function drawUnits(y) {
  const U = D.units, me = U.narvik[y], total = me['00-99|99'], first = Object.keys(U.narvik)[0];
  const share = (k, code, size = '99', yr = y) => { const s = U[k]?.[yr]; return s?.['00-99|99'] ? (s[`${code}|${size}`] ?? 0) / s['00-99|99'] * 100 : null; };
  const big = (k, yr = y) => { const s = U[k]?.[yr]; return s ? ['04', '05', '15', '16'].reduce((a, c) => a + (s[`00-99|${c}`] ?? 0), 0) : null; };
  const rows = Object.keys(SHORT).map(c => [SHORT[c], me[`${c}|99`] ?? 0, pc(share('narvik', c), 0)]).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
  // Industry bars for one size group at a time, picked with the buttons above them.
  const pick = document.getElementById('ind-pick');
  const drawInd = g => {
    const n = c => g.codes.reduce((a, z) => a + (me[`${c}|${z}`] ?? 0), 0), all = n('00-99');
    const list = Object.keys(SHORT).map(c => [SHORT[c], n(c), all ? pc(n(c) / all * 100, 0) : '·']).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
    document.getElementById('ind-h').innerHTML = `Bedrifter etter næring, <span style="white-space:nowrap">${g.title}</span>, 1. januar ${y}`;
    document.getElementById('ind-bars').innerHTML = list.length ? bars(list) : '<p class="caption">Ingen bedrifter.</p>';
    document.getElementById('ind-sum').textContent = `${nb(all)} bedrifter med dette antallet ansatte. Prosenten er av disse.`;
    pick.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === g.key)));
  };
  pick.replaceChildren(...SIZE_GROUPS.map(g => {
    const b = el('button', { type: 'button', 'data-g': g.key, 'aria-pressed': 'false' }, g.name);
    b.addEventListener('click', () => drawInd(g));
    return b;
  }));
  drawInd(SIZE_GROUPS[0]);
  document.getElementById('size-h').textContent = `Bedrifter etter antall ansatte, 1. januar ${y}`;
  document.getElementById('size-bars').innerHTML = bars(SIZES.map(([c, n]) => [n, me[`00-99|${c}`] ?? 0, pc(share('narvik', '00-99', c), 0)]));
  const top = rows.slice(0, 3).map(r => r[0].toLowerCase());
  document.getElementById('units-lead').textContent = `${nb(total)} bedrifter var registrert i Narvik 1. januar ${y}, ${chgText(pct(total, U.narvik[first]['00-99|99']))} fra ${first}. Flest var innen ${top[0]}, ${top[1]} og ${top[2]}. ${nb(big('narvik'))} bedrifter hadde 20 ansatte eller flere.`;
  document.getElementById('units-caption').innerHTML = `Bedrifter (virksomheter) som ligger i Narvik, etter hovednæring og antall ansatte. Velg antall ansatte over næringsgrafen for å se bare bedrifter av den størrelsen. Prosenten er beregnet her. ${nb(me['00|99'] ?? 0)} bedrifter har ukjent næring og er ikke med i næringsgrafen. ${ssb('10309', 'Se tallene hos SSB')} (tabell 10309).`;
  table('units-cmp', [
    { label: `Bedrifter ${y}`, get: k => num(U[k]?.[y]?.['00-99|99']) },
    { label: 'Per 1 000 innbyggere, beregnet', get: k => { const v = perThousand(U[k]?.[y]?.['00-99|99'], k, y); return v == null ? '·' : nb(v, 0); } },
    { label: `Endring siden ${first}`, get: k => (U[k]?.[first]?.['00-99|99'] ? chgText(pct(U[k][y]['00-99|99'], U[k][first]['00-99|99'])) : '·') },
    { label: 'Uten ansatte', get: k => pc(share(k, '00-99', '00'), 0) },
    { label: '20 ansatte eller flere', get: k => (U[k]?.[y] ? pc(big(k) / U[k][y]['00-99|99'] * 100) : '·') },
  ]);
  document.getElementById('units-cmp-caption').innerHTML = `Bedrifter 1. januar ${y}. Per 1 000 innbyggere er regnet ut her med folketallet 1. januar (${ssb('07459', 'SSB tabell 07459')}). Andelene er av alle bedriftene, beregnet her. ${ssb('10309')}.`;
}

function drawNew() {
  const Y = yearly('new', 'narvik'), years = Object.keys(Y), qs = Object.keys(D.new.narvik), lastQ = qs.at(-1);
  document.getElementById('new-year').innerHTML = columns(years.map(y => ({ y, v: Y[y] })), v => nb(v), years.at(-1));
  const eight = qs.slice(-8);
  document.getElementById('new-q-h').textContent = `Per kvartal, ${quarter(eight[0])} til ${quarter(lastQ)}`;
  document.getElementById('new-q').innerHTML = columns(eight.map(q => ({ y: q, v: D.new.narvik[q] })), v => nb(v), lastQ)
    .replace(/<small>(\d{4})K(\d)<\/small>/g, (_, y, k) => `<small>${k}. kv. ${y.slice(2)}</small>`);
  const s = last4('new', 'narvik'), ly = years.at(-1);
  const ytd = qs.filter(q => q.startsWith(lastQ.slice(0, 4))), ytdPrev = ytd.map(q => `${+q.slice(0, 4) - 1}${q.slice(4)}`);
  const sum = list => list.reduce((a, q) => a + (D.new.narvik[q] ?? 0), 0);
  document.getElementById('new-lead').textContent = `I ${ly} ble det registrert ${nb(Y[ly])} nye foretak i Narvik. Hittil i ${lastQ.slice(0, 4)} er det ${nb(sum(ytd))}, mot ${nb(sum(ytdPrev))} i de samme kvartalene i ${+lastQ.slice(0, 4) - 1}. Det høyeste antallet i ett år siden ${years[0]} var ${nb(Math.max(...Object.values(Y)))}.`;
  document.getElementById('new-caption').innerHTML = `Nye foretak registrert i kvartalet, unntatt offentlig forvaltning og jordbruk, skogbruk og fiske. Årene er summen av fire kvartaler, regnet ut her. ${ssb('08076', 'Se tallene hos SSB')} (tabell 08076).`;
  const py = String(+lastQ.slice(0, 4) - 1);
  table('new-cmp', [
    { label: 'Siste fire kvartaler', get: k => num(last4('new', k).now) },
    { label: 'Fire kvartaler før', get: k => num(last4('new', k).before) },
    { label: 'Endring', get: k => { const x = last4('new', k); return x.now != null && x.before ? chgText(pct(x.now, x.before)) : '·'; } },
    { label: `Per 1 000 innbyggere, ${ly}, beregnet`, get: k => { const v = perThousand(yearly('new', k)[ly], k, ly); return v == null ? '·' : nb(v, 1); } },
  ]);
  document.getElementById('new-cmp-caption').innerHTML = `Nye foretak fra ${quarter(s.from)} til ${quarter(s.to)}, summert her fra SSBs tall for hvert kvartal. Per 1 000 innbyggere er regnet ut med folketallet 1. januar ${ly}. ${ssb('08076')}, ${ssb('07459', 'SSB tabell 07459')}.`;
}

function drawSurvival() {
  const S = D.survival, years = Object.keys(S.narvik);
  // The newest cohort SSB has followed for each number of years.
  const cohorts = [3, 2, 1].map(a => ({ a, y: [...years].reverse().find(y => S.narvik[y][`${a}|00`]) })).filter(c => c.y);
  const share = (k, c) => { const s = S[k]?.[c.y]; return s?.[`${c.a}|00`] ? s[`${c.a}|01`] / s[`${c.a}|00`] * 100 : null; };
  const c3 = cohorts[0];
  document.getElementById('surv-lead').textContent = `Av de ${nb(S.narvik[c3.y][`${c3.a}|00`])} nye foretakene med aktivitet i Narvik i ${c3.y} var ${nb(S.narvik[c3.y][`${c3.a}|01`])} fortsatt i drift etter ${c3.a} år, ${pc(share('narvik', c3), 0)}. I hele landet var andelen ${pc(share('norge', c3), 0)}.`;
  table('surv-cmp', cohorts.map(c => ({ label: `Etablert ${c.y}, i drift etter ${c.a === 1 ? 'ett år' : c.a + ' år'}`, get: k => pc(share(k, c), 0) })));
  document.getElementById('surv-caption').innerHTML = `Nye foretak med aktivitet i etableringsåret, og hvor mange av dem som fortsatt hadde aktivitet ett, to og tre år senere. Prosenten er beregnet her fra SSBs antall. Hvert år er de foretakene som ble etablert det året. ${ssb('13701', 'Se tallene hos SSB')} (tabell 13701).`;
}

function drawBankruptcies() {
  const Y = yearly('bankruptcies', 'narvik'), years = Object.keys(Y), s = last4('bankruptcies', 'narvik');
  document.getElementById('bank-year').innerHTML = columns(years.map(y => ({ y, v: Y[y] })), v => nb(v), years.at(-1));
  const vals = Object.values(Y), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  document.getElementById('bank-lead').textContent = `${nb(Y[years.at(-1)])} foretak i Narvik gikk konkurs i ${years.at(-1)}, og ${nb(s.now)} fra ${quarter(s.from)} til ${quarter(s.to)}. Fra ${years[0]} til ${years.at(-1)} var det mellom ${nb(Math.min(...vals))} og ${nb(Math.max(...vals))} i året.`;
  document.getElementById('bank-caption').innerHTML = `Åpnede konkurser i foretak registrert i Narvik. Årene er summen av fire kvartaler, regnet ut her. Det er få konkurser i én kommune, så tallene kan variere mye fra år til år. ${ssb('07165', 'Se tallene hos SSB')} (tabell 07165).`;
  const ly = years.at(-1), units = (k, y) => D.units[k]?.[y]?.['00-99|99'];
  table('bank-cmp', [
    { label: `${ly}`, get: k => num(yearly('bankruptcies', k)[ly]) },
    { label: 'Siste fire kvartaler', get: k => num(last4('bankruptcies', k).now) },
    { label: 'Fire kvartaler før', get: k => num(last4('bankruptcies', k).before) },
    { label: `Per 1 000 bedrifter, ${ly}, beregnet`, get: k => { const b = yearly('bankruptcies', k)[ly], u = units(k, ly); return b != null && u ? nb(b / u * 1000, 1) : '·'; } },
  ]);
  document.getElementById('bank-cmp-caption').innerHTML = `Åpnede konkurser, summert her fra SSBs tall for hvert kvartal. Per 1 000 bedrifter er regnet ut med antall bedrifter 1. januar ${ly} fra ${ssb('10309', 'SSB tabell 10309')}. ${ssb('07165')}.`;
}

function drawStays() {
  const S = D.stays, ms = Object.keys(S.narvik), last = ms.at(-1), twelve = ms.slice(-12);
  const tot = (k, m) => { const s = S[k]?.[m]; return s ? (s['01'] ?? 0) + (s['02+03+04'] ?? 0) : null; };
  document.getElementById('stay-h').textContent = `Overnattinger per måned i tusen, ${month(twelve[0])} til ${month(last)}`;
  document.getElementById('stay-month').innerHTML = columns(twelve.map(m => ({ y: m, v: tot('narvik', m) })), v => nb(v / 1000, 1), last)
    .replace(/<small>(\d{4})M(\d\d)<\/small>/g, (_, y, mo) => `<small>${MONTHS[+mo - 1].slice(0, 3)}</small>`);
  const yearSum = (k, y, code) => { const list = ms.filter(m => m.startsWith(y)); return list.length === 12 ? list.reduce((a, m) => a + (code ? S[k]?.[m]?.[code] ?? 0 : tot(k, m) ?? 0), 0) : null; };
  const years = [...new Set(ms.map(m => m.slice(0, 4)))].filter(y => ms.filter(m => m.startsWith(y)).length === 12);
  // SSB has no figures for camping, cabins and hostels in some kommuner (only zeros or nothing).
  const hasOther = k => Object.values(S[k] || {}).some(v => v['02+03+04'] > 0);
  const ly = years.at(-1), py = years.at(-2), peak = twelve.reduce((a, m) => (tot('narvik', m) > tot('narvik', a) ? m : a), twelve[0]);
  document.getElementById('stay-lead').textContent = `Det var ${nb(yearSum('narvik', ly))} overnattinger på hoteller, campingplasser, hyttegrender og vandrerhjem i Narvik i ${ly}${py ? `, ${chgText(pct(yearSum('narvik', ly), yearSum('narvik', py)))} fra ${py}` : ''}. ${pc(yearSum('narvik', ly, '01') / yearSum('narvik', ly) * 100, 0)} var på hotell. Den siste tolvmånedersperioden var det flest i ${month(peak)}.`;
  document.getElementById('stay-caption').innerHTML = `Overnattinger i kommersielle overnattingsbedrifter, alle gjester uansett hvor de bor. Privat utleie, for eksempel gjennom Airbnb, er ikke med. Kommunetallene starter i 2024. ${ssb('12894', 'Se tallene hos SSB')} (tabell 12894).`;
  table('stay-cmp', [
    { label: `Overnattinger ${ly}`, get: k => num(yearSum(k, ly)) },
    ...(py ? [{ label: `Endring fra ${py}`, get: k => (yearSum(k, py) ? chgText(pct(yearSum(k, ly), yearSum(k, py))) : '·') }] : []),
    { label: 'Andel på hotell', get: k => (yearSum(k, ly) && hasOther(k) ? pc(yearSum(k, ly, '01') / yearSum(k, ly) * 100, 0) : '·') },
    { label: 'Per innbygger, beregnet', get: k => { const v = yearSum(k, ly), p = D.population[k]?.[ly]; return v && p ? nb(v / p, 1) : '·'; } },
  ], KEYS.filter(k => S[k]));
  document.getElementById('stay-cmp-caption').innerHTML = `Overnattinger i ${ly}, summert her fra SSBs tall for hver måned. Per innbygger er regnet ut med folketallet 1. januar ${ly} (${ssb('07459', 'SSB tabell 07459')}). Tabellen har bare kommuner. ${KEYS.filter(k => S[k] && !hasOther(k)).map(k => region(k).name).join(' og ') || 'Ingen'} har ingen tall for campingplasser, hyttegrender og vandrerhjem hos SSB, så der er bare hotellene med. ${ssb('12894')}.`;
}

function drawBig() {
  const B = D.brreg, units = B.units, sum = units.reduce((a, u) => a + u.ansatte, 0);
  const by = {};
  units.forEach(u => { by[u.sektor] = (by[u.sektor] || 0) + u.ansatte; });
  document.getElementById('big-lead').textContent = `${units.length} arbeidsplasser i Narvik har minst ${B.min_employees} ansatte i Enhetsregisteret, til sammen ${nb(sum)} ansatte. Den største er ${nice(units[0].navn)} med ${nb(units[0].ansatte)}.`;
  document.getElementById('big-sector-h').textContent = `Ansatte på arbeidsplasser med minst ${B.min_employees} ansatte, etter eier`;
  document.getElementById('big-sector').innerHTML = bars(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, n, pc(n / sum * 100, 0)]));
  document.getElementById('big-sector-caption').textContent = 'Eier er sektoren til foretaket arbeidsplassen hører til, slik den står i Enhetsregisteret. Staten omfatter også helseforetakene. Summen og prosenten er regnet ut her.';
  const t = document.getElementById('big-list');
  const SHOW = 15;
  t.innerHTML = `<thead><tr><th>Arbeidsplass</th><th>Ansatte</th><th>Næring</th><th>Eier</th></tr></thead><tbody>${units.map((u, i) =>
    `<tr${i >= SHOW ? ' hidden' : ''}><td><a href="https://virksomhet.brreg.no/nb/oppslag/underenheter/${h(u.orgnr)}" target="_blank" rel="noopener">${h(nice(u.navn))}</a></td><td>${nb(u.ansatte)}</td><td style="white-space:normal;text-align:left">${h(u.naering || '')}</td><td>${h(u.sektor)}</td></tr>`).join('')}</tbody>`;
  stackable(t);
  if (units.length > SHOW) {
    const btn = el('button', { class: 'btn', type: 'button', style: 'margin-top:12px;border:0;cursor:pointer;justify-self:start' }, `Vis alle ${units.length}`);
    btn.addEventListener('click', () => { t.querySelectorAll('tr[hidden]').forEach(r => { r.hidden = false; }); btn.remove(); });
    t.closest('.ptable').after(btn);
  }
  document.getElementById('big-caption').innerHTML = `Underenheter (bedrifter) med adresse i Narvik og minst ${B.min_employees} registrerte ansatte, hentet ${new Date(D.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}. Kommunen og andre store arbeidsgivere er registrert med én underenhet per sykehjem, skole og avdeling, så hver av dem står for seg. Enkeltpersonforetak er ikke med. Kilde: <a href="${h(B.source.query)}" target="_blank" rel="noopener">Brønnøysundregistrene, Enhetsregisteret</a>. Hvert navn lenker til oppføringen.`;
}

start();
