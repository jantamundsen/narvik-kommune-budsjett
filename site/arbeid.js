// arbeid.html: unemployment and new vacancies month by month from Nav, and from SSB how many have a job, who is
// outside work, where people work and commuting, each against the comparison regions. Renders site/data/arbeid.json
// (written by scripts/fetch_arbeid.py). Helpers are in common.js.
let A;

const pc = (v, d = 1) => (v == null ? '·' : nb(v, d) + ' %');
const num = v => (v == null ? '·' : nb(v));
const region = k => A.regions.find(r => r.key === k);
const KEYS = ['narvik', 'harstad', 'rana', 'alta', 'nordland', 'norge'];
const ssb = (t, text) => `<a href="${A.sources[t].query}&outputFormat=html" target="_blank" rel="noopener">${text || 'SSB tabell ' + t}</a>`;
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const month = m => `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const shortMonth = m => MONTHS[+m.slice(5) - 1].slice(0, 3);
const yearBefore = m => `${+m.slice(0, 4) - 1}${m.slice(4)}`;
// The months from a to b, both included, as "2025-10".
function monthsBetween(a, b) {
  const out = [];
  for (let y = +a.slice(0, 4), mo = +a.slice(5); `${y}-${String(mo).padStart(2, '0')}` <= b; mo === 12 ? (y++, mo = 1) : mo++) out.push(`${y}-${String(mo).padStart(2, '0')}`);
  return out;
}
// Nav's file for a table and year, as a link.
const nav = (code, y, text) => {
  const f = A.nav.files[code]?.[y] || Object.values(A.nav.files[code]).at(-1);
  return `<a href="${f.file}" target="_blank" rel="noopener">${text}</a>`;
};
const navPage = code => `<a href="${Object.values(A.nav.files[code]).at(-1).page}" target="_blank" rel="noopener">${code === 'HL060' ? 'Navs side om helt ledige' : 'Navs side om ledige stillinger'}</a>`;

async function start() {
  try {
    const res = await fetch('data/arbeid.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    A = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/arbeid.json. Kjør <code>python scripts/fetch_arbeid.py</code> og åpne siden via en webserver.';
    return;
  }
  document.getElementById('generated').textContent = new Date(A.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('sources').innerHTML = Object.values(A.sources).map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.table}</a>`).join(', ');

  const L = A.nav.ledige.narvik, last = Object.keys(L).at(-1), prev = L[yearBefore(last)];
  const vac = sum12('narvik', A.nav.stillinger.narvik ? Object.keys(A.nav.stillinger.narvik).at(-1) : last);
  const y = Object.keys(A.employment.narvik).at(-1), emp = A.employment.narvik[y]['15-74|0'];
  document.getElementById('lead').textContent = `${nb(L[last].n)} innbyggere i Narvik var helt ledige i ${month(last)}, ${pc(L[last].pct)} av arbeidsstyrken. Det ble registrert ${nb(vac.now)} nye ledige stillinger i kommunen de siste tolv månedene. I november ${y} hadde ${pc(emp)} av innbyggerne mellom 15 og 74 år arbeid.`;
  document.getElementById('summary').innerHTML = [
    ['Helt ledige', pc(L[last].pct), `${nb(L[last].n)} personer i ${month(last)}${prev ? `, mot ${pc(prev.pct)} ett år før` : ''}`],
    ['Nye ledige stillinger', nb(vac.now), `siste tolv måneder, ${chgText(pct(vac.now, vac.before))} fra tolv måneder før`],
    ['Har arbeid', pc(emp), `av innbyggerne 15–74 år, november ${y}`],
  ].map(([label, big, sub]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span></div>`).join('');

  drawUnemployment(last);
  drawVacancies();
  drawEmployment(y);
  drawStatus();
  drawIndustry();
  drawCommuting();
}

// New vacancies in the twelve months up to m, and in the twelve before.
function sum12(k, m) {
  const S = A.nav.stillinger[k] || {};
  const now = monthsBetween(yearBefore(m), m).slice(1), before = now.map(yearBefore);
  const s = ms => (ms.every(x => S[x] != null) ? ms.reduce((a, x) => a + S[x], 0) : null);
  return { now: s(now), before: s(before), from: now[0], to: m };
}

// One bar row per item: [label, value, right-hand text], scaled to the largest value.
function bars(rows, fmt = nb) {
  const max = Math.max(...rows.map(r => r[1]));
  return rows.map(([label, v, note]) => `<div class="hb ab"><span>${label}</span><span class="track"><i style="width:${v / max * 100}%"></i></span><span class="r">${fmt(v)}</span><span class="r muted">${note}</span></div>`).join('');
}

function table(id, cols, keys = KEYS) {
  const t = document.getElementById(id);
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${keys.map(k => region(k)).filter(Boolean).map(r =>
    `<tr${r.key === 'narvik' ? ' class="me"' : ''}><td>${r.name}</td>${cols.map(c => `<td>${c.get(r.key) ?? '·'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  stackable(t);
}

// Per cent unemployed every month for Narvik, Nordland and the country, as lines.
function drawUnemployment(last) {
  const series = [
    { key: 'narvik', cls: 'line', dot: 'dot' },
    { key: 'nordland', cls: 'line l2', dot: 'dot d2' },
    { key: 'norge', cls: 'line l3', dot: 'dot d3' },
  ];
  const months = Object.keys(A.nav.ledige.narvik);
  const val = (k, m) => A.nav.ledige[k]?.[m]?.pct ?? null;
  const W = 760, H = 240, x0 = 34, x1 = W - 118, top = 14, bottom = H - 26;
  const step = 2, hi = Math.ceil(Math.max(...series.flatMap(s => months.map(m => val(s.key, m) ?? 0))) / step) * step || step;
  const X = i => x0 + (x1 - x0) * i / (months.length - 1), Y = v => bottom - (bottom - top) * v / hi;
  const label = m => `${month(m)}: ${series.map(s => `${region(s.key).name} ${pc(val(s.key, m))}`).join(', ')}`;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Helt ledige i prosent av arbeidsstyrken, ${month(months[0])} til ${month(last)}. Tallene står i tabellen under.">`;
  for (let v = 0; v <= hi; v += step) svg += `<line class="grid" x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}"/><text x="0" y="${Y(v) + 4}">${v} %</text>`;
  months.forEach((m, i) => { if (m.endsWith('-01')) svg += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${m.slice(0, 4)}</text>`; });
  // The lines furthest back first, so Narvik is drawn on top.
  const ends = [];
  [...series].reverse().forEach(s => {
    const pts = months.map((m, i) => (val(s.key, m) == null ? null : `${X(i)},${Y(val(s.key, m))}`)).filter(Boolean);
    svg += `<polyline class="${s.cls}" points="${pts.join(' ')}"/>`;
    svg += `<circle class="${s.dot}" cx="${X(months.length - 1)}" cy="${Y(val(s.key, last))}" r="4"/>`;
    ends.push({ y: Y(val(s.key, last)), text: `${region(s.key).name} ${pc(val(s.key, last))}`, me: s.key === 'narvik' });
  });
  // End labels, pushed apart so they do not overlap.
  ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 15) e.y = arr[i - 1].y + 15; });
  ends.forEach(e => { svg += `<text class="${e.me ? 'v' : ''}" x="${x1 + 8}" y="${e.y + 4}">${e.text}</text>`; });
  // One invisible column per month, so hovering shows the month's numbers.
  const w = (x1 - x0) / (months.length - 1);
  months.forEach((m, i) => { svg += `<rect class="hit" x="${X(i) - w / 2}" y="${top}" width="${w}" height="${bottom - top}"><title>${label(m)}</title></rect>`; });
  document.getElementById('unemp-chart').innerHTML = svg + '</svg>';
  document.getElementById('unemp-legend').innerHTML = series.map((s, i) => `<span><i class="sw s${i + 1}"></i>${region(s.key).name}</span>`).join('');

  const L = A.nav.ledige, p = yearBefore(last);
  const avg = k => { const ms = monthsBetween(p, last).slice(1).map(m => L[k]?.[m]?.pct); return ms.every(v => v != null) ? ms.reduce((a, b) => a + b, 0) / ms.length : null; };
  const peak = months.reduce((a, m) => (val('narvik', m) > val('narvik', a) ? m : a), months[0]);
  document.getElementById('unemp-lead').textContent = `I ${month(last)} var ${pc(val('narvik', last))} av arbeidsstyrken i Narvik helt ledige, mot ${pc(val('nordland', last))} i Nordland og ${pc(val('norge', last))} i hele landet. Det høyeste siden ${months[0].slice(0, 4)} var ${pc(val('narvik', peak))} i ${month(peak)}.`;
  document.getElementById('unemp-caption').innerHTML = `Helt ledige ved utgangen av hver måned, prosent av arbeidsstyrken. Hold over grafen for å se tallene for en måned. Kilde: Nav, tabell HL060, ${nav('HL060', last.slice(0, 4), 'siste fil')}. Eldre måneder er fra Navs arkiv for hvert år. Se også ${navPage('HL060')}.`;
  table('unemp-cmp', [
    { label: `Helt ledige, ${month(last)}`, get: k => num(L[k]?.[last]?.n) },
    { label: 'Prosent av arbeidsstyrken', get: k => pc(L[k]?.[last]?.pct) },
    { label: `Samme måned året før`, get: k => pc(L[k]?.[p]?.pct) },
    { label: 'Snitt siste tolv måneder, beregnet', get: k => pc(avg(k)) },
  ]);
  document.getElementById('unemp-cmp-caption').innerHTML = `Snittet for de siste tolv månedene er regnet ut her fra Navs prosent for hver måned. Nav, tabell HL060, ${nav('HL060', last.slice(0, 4), 'siste fil')}.`;
}

function drawVacancies() {
  const S = A.nav.stillinger.narvik, ms = Object.keys(S), last = ms.at(-1);
  // Whole years only, from the first January Nav has for the kommune.
  const years = [...new Set(ms.map(m => m.slice(0, 4)))].filter(y => ms.includes(`${y}-01`) && ms.includes(`${y}-12`));
  const yearSum = y => monthsBetween(`${y}-01`, `${y}-12`).reduce((a, m) => a + (S[m] ?? 0), 0);
  document.getElementById('vac-year').innerHTML = columns(years.map(y => ({ y, v: yearSum(y) })), v => nb(v), years.at(-1));
  const twelve = monthsBetween(yearBefore(last), last).slice(1);
  document.getElementById('vac-month-h').textContent = `Per måned, ${month(twelve[0])} til ${month(last)}`;
  document.getElementById('vac-month').innerHTML = columns(twelve.map(m => ({ y: m, v: S[m] ?? null })), v => nb(v), last)
    .replace(/<small>(\d{4}-\d\d)<\/small>/g, (_, m) => `<small>${shortMonth(m)}</small>`);
  const s = sum12('narvik', last);
  const ytd = monthsBetween(`${last.slice(0, 4)}-01`, last), ytdPrev = ytd.map(yearBefore);
  const sumOf = list => list.reduce((a, m) => a + (S[m] ?? 0), 0);
  document.getElementById('vac-lead').textContent = `Fra ${month(s.from)} til ${month(last)} ble det registrert ${nb(s.now)} nye ledige stillinger i Narvik, ${chgText(pct(s.now, s.before))} fra de tolv månedene før. Hittil i ${last.slice(0, 4)} er det ${nb(sumOf(ytd))}, mot ${nb(sumOf(ytdPrev))} i de samme månedene i ${+last.slice(0, 4) - 1}.`;
  document.getElementById('vac-caption').innerHTML = `Tilgang på ledige stillinger registrert hos Nav i måneden. Nav har tall per kommune fra ${ms[0].slice(0, 4)}. Kilde: Nav, tabell STIL030, ${nav('STIL030', last.slice(0, 4), 'siste fil')}. Se også ${navPage('STIL030')}.`;
  table('vac-cmp', [
    { label: `Siste tolv måneder`, get: k => num(sum12(k, last).now) },
    { label: 'Tolv måneder før', get: k => num(sum12(k, last).before) },
    { label: 'Endring', get: k => { const x = sum12(k, last); return x.now != null && x.before ? chgText(pct(x.now, x.before)) : '·'; } },
  ]);
  document.getElementById('vac-cmp-caption').innerHTML = `Nye ledige stillinger fra ${month(s.from)} til ${month(last)}, summert her fra Navs tall for hver måned. Nav, tabell STIL030.`;
}

function drawEmployment(y) {
  const E = A.employment, ages = A.ages.filter(a => a.code !== '15-74');
  document.getElementById('emp-h').textContent = `Andel som har arbeid, etter alder, november ${y}`;
  document.getElementById('emp-bars').innerHTML = bars(ages.map(a => [a.name, E.narvik[y][`${a.code}|0`] ?? 0, `landet ${pc(E.norge?.[y]?.[`${a.code}|0`], 0)}`]), v => pc(v, 0));
  const first = Object.keys(E.narvik)[0], me = E.narvik[y];
  document.getElementById('emp-lead').textContent = `${pc(me['15-74|0'])} av innbyggerne i Narvik mellom 15 og 74 år hadde arbeid i november ${y}, mot ${pc(E.norge[y]['15-74|0'])} i hele landet og ${pc(E.narvik[first]['15-74|0'])} i Narvik i ${first}. Blant kvinnene var andelen ${pc(me['15-74|2'])}, blant mennene ${pc(me['15-74|1'])}.`;
  document.getElementById('emp-caption').innerHTML = `Sysselsatte i prosent av befolkningen i hver aldersgruppe, etter bosted. ${ssb('06445', 'Se tallene hos SSB')} (tabell 06445).`;
  table('emp-cmp', [
    { label: `15–74 år, ${first}`, get: k => pc(E[k]?.[first]?.['15-74|0']) },
    { label: `15–74 år, ${y}`, get: k => pc(E[k]?.[y]?.['15-74|0']) },
    { label: 'Kvinner', get: k => pc(E[k]?.[y]?.['15-74|2']) },
    { label: 'Menn', get: k => pc(E[k]?.[y]?.['15-74|1']) },
    { label: '20–24 år', get: k => pc(E[k]?.[y]?.['20-24|0']) },
    { label: '55–66 år', get: k => pc(E[k]?.[y]?.['55-66|0']) },
  ]);
  document.getElementById('emp-cmp-caption').innerHTML = `Sysselsatte i prosent av befolkningen, november. Kvinner og menn er 15–74 år, ${y}. ${ssb('06445')}.`;
}

// Labour force status in 13563 for 20–66 years; together they are everyone in that age group.
const STATUS = [
  { code: 'A.01', name: 'Har arbeid' },
  { code: 'A.09', name: 'Registrert ledig' },
  { code: 'U.01', name: 'På arbeidsrettet tiltak' },
  { code: 'U.03', name: 'Under utdanning' },
  { code: 'U.04-U.05', name: 'Arbeidsavklaringspenger eller uføretrygd' },
  { code: 'U.06-U.07', name: 'AFP eller alderspensjon' },
  { code: 'U.90A', name: 'Andre' },
];

function drawStatus() {
  const S = A.status, y = Object.keys(S.narvik).at(-1), first = Object.keys(S.narvik)[0];
  const share = (k, code, age = '20-66', yr = y) => { const s = S[k]?.[yr]; return s?.[`${age}|TOT`] ? (s[`${age}|${code}`] ?? 0) / s[`${age}|TOT`] * 100 : null; };
  const me = S.narvik[y], total = me['20-66|TOT'];
  const bar = document.getElementById('status-bar'), legend = document.getElementById('status-legend');
  bar.replaceChildren(); legend.replaceChildren();
  STATUS.forEach((s, i) => {
    const v = (me[`20-66|${s.code}`] ?? 0) / total * 100;
    const b = el('span', { title: `${s.name}: ${nb(v, 1)} %` });
    b.style.flex = `0 0 ${v}%`;
    b.style.background = i ? `color-mix(in srgb, var(--muted) ${Math.max(30, 100 - i * 12)}%, var(--surface))` : 'var(--accent)';
    if (v >= 9) b.appendChild(el('span', {}, nb(v) + ' %'));
    bar.appendChild(b);
    const li = el('li');
    li.append(el('span', { class: 'kr' }, nb(v, v < 10 ? 1 : 0) + ' %'), el('span', {}, `${s.name} (${nb(me[`20-66|${s.code}`] ?? 0)})`));
    legend.appendChild(li);
  });
  const aap = share('narvik', 'U.04-U.05'), neet = share('narvik', 'NEET2', '15-29');
  document.getElementById('status-lead').textContent = `Av de ${nb(total)} innbyggerne i Narvik mellom 20 og 66 år hadde ${pc(share('narvik', 'A.01'))} arbeid i november ${y}. ${pc(aap)} mottok arbeidsavklaringspenger eller uføretrygd, mot ${pc(share('norge', 'U.04-U.05'))} i hele landet og ${pc(share('narvik', 'U.04-U.05', '20-66', first))} i Narvik i ${first}. ${pc(neet)} av de unge mellom 15 og 29 år var verken i arbeid, utdanning eller på tiltak.`;
  document.getElementById('status-caption').innerHTML = `Innbyggere 20–66 år etter hva de hovedsakelig gjorde i november ${y}. Hver person telles bare én gang: den som både jobber og studerer, telles som i arbeid. Andelene er regnet ut her fra SSBs antall. ${ssb('13563', 'Se tallene hos SSB')} (tabell 13563).`;
  table('status-cmp', [
    { label: 'Har arbeid', get: k => pc(share(k, 'A.01')) },
    { label: 'Registrert ledig', get: k => pc(share(k, 'A.09')) },
    { label: 'AAP eller uføretrygd', get: k => pc(share(k, 'U.04-U.05')) },
    { label: `AAP eller uføretrygd, ${first}`, get: k => pc(share(k, 'U.04-U.05', '20-66', first)) },
    { label: 'Unge 15–29 utenfor arbeid og utdanning', get: k => pc(share(k, 'NEET2', '15-29')) },
  ]);
  document.getElementById('status-cmp-caption').innerHTML = `Prosent av innbyggerne 20–66 år, november ${y}, beregnet her fra SSBs antall. De unge utenfor arbeid og utdanning er prosent av innbyggerne 15–29 år som verken var i arbeid, under utdanning eller på arbeidsrettet tiltak. ${ssb('13563')}.`;
}

const SECTORS = [
  { code: 'A+B+D+E.0-1+9', name: 'Privat sektor' },
  { code: '6500.6', name: 'Kommunen' },
  { code: '6100', name: 'Staten', note: 'Helseforetakene er med' },
  { code: 'A+B+D+E.5-7', name: 'Offentlig eide foretak' },
  { code: '6500.7', name: 'Fylkeskommunen' },
];
const INDUSTRIES = [
  { code: '45-82', name: 'Handel, hotell, transport og annen næringsvirksomhet' },
  { code: '86-88', name: 'Helse og sosiale tjenester' },
  { code: '05-43', name: 'Industri, bygg, kraft og bergverk' },
  { code: '85', name: 'Undervisning' },
  { code: '84', name: 'Offentlig administrasjon og forsvar' },
  { code: '90-99', name: 'Personlig tjenesteyting' },
  { code: '01-03', name: 'Jordbruk, skogbruk og fiske' },
];

function drawIndustry() {
  const W = 'SysselEtterArbste', y = Object.keys(A.sector.narvik).at(-1);
  const sec = A.sector.narvik[y], ind = A.industry.narvik[y], total = sec[`${W}|ALLE`];
  const share = (src, k, code) => { const s = src[k]?.[y]; return s?.[`${W}|${src === A.sector ? 'ALLE' : '00-99'}`] ? (s[`${W}|${code}`] ?? 0) / s[`${W}|${src === A.sector ? 'ALLE' : '00-99'}`] * 100 : null; };
  document.getElementById('sector-h').textContent = `Jobber i Narvik etter sektor, ${y}`;
  document.getElementById('sector-bars').innerHTML = bars(SECTORS.map(s => [s.name, sec[`${W}|${s.code}`] ?? 0, pc(share(A.sector, 'narvik', s.code), 0)]));
  document.getElementById('ind-h').textContent = `Jobber i Narvik etter næring, ${y}`;
  document.getElementById('ind-bars').innerHTML = bars(INDUSTRIES.map(s => [s.name, ind[`${W}|${s.code}`] ?? 0, pc(share(A.industry, 'narvik', s.code), 0)]));
  const pub = 100 - share(A.sector, 'narvik', SECTORS[0].code), pubN = 100 - share(A.sector, 'norge', SECTORS[0].code);
  document.getElementById('ind-lead').textContent = `${nb(total)} personer hadde arbeidssted i Narvik i november ${y}. ${pc(pub)} av dem jobbet i offentlig forvaltning eller offentlig eide foretak, mot ${pc(pubN)} i hele landet. Kommunen hadde ${nb(sec[`${W}|6500.6`])} av jobbene, og staten ${nb(sec[`${W}|6100`])}.`;
  document.getElementById('ind-caption').innerHTML = `Sysselsatte etter arbeidssted, uansett hvor de bor. Staten omfatter også helseforetakene. Næringene er SSBs åtte grupper med forenklede navn; ${nb(ind[`${W}|00`] ?? 0)} har ukjent næring og er ikke med. ${ssb('13472', 'Se tallene hos SSB')} (tabell 13472).`;
  table('ind-cmp', [
    { label: 'Privat sektor', get: k => pc(share(A.sector, k, SECTORS[0].code), 0) },
    { label: 'Kommunen', get: k => pc(share(A.sector, k, '6500.6'), 0) },
    { label: 'Staten', get: k => pc(share(A.sector, k, '6100'), 0) },
    { label: 'Helse og sosiale tjenester', get: k => pc(share(A.industry, k, '86-88'), 0) },
    { label: 'Industri, bygg, kraft og bergverk', get: k => pc(share(A.industry, k, '05-43'), 0) },
  ]);
  document.getElementById('ind-cmp-caption').innerHTML = `Prosent av dem som har arbeidssted i kommunen eller regionen, november ${y}, beregnet her fra SSBs antall. ${ssb('13472')}.`;
}

function drawCommuting() {
  const C = A.commuting, y = A.flows.year, me = C.narvik[y], top = 6;
  document.getElementById('out-h').textContent = `Bor i Narvik, jobber i …, ${y}`;
  document.getElementById('in-h').textContent = `Jobber i Narvik, bor i …, ${y}`;
  document.getElementById('out-bars').innerHTML = bars(A.flows.ut.slice(0, top).map(f => [f.name, f.n, pc(f.n / me.Bosatt * 100, 1)]));
  document.getElementById('in-bars').innerHTML = bars(A.flows.inn.slice(0, top).map(f => [f.name, f.n, pc(f.n / me.Arbeidssted * 100, 1)]));
  document.getElementById('comm-lead').textContent = `I november ${y} jobbet ${nb(me.Utpendlere)} av de ${nb(me.Bosatt)} sysselsatte innbyggerne i Narvik i en annen kommune, og ${nb(me.Innpendlere)} som bor i andre kommuner, jobbet i Narvik. Flest pendlet til og fra ${A.flows.ut[0].name}.`;
  document.getElementById('comm-caption').innerHTML = `Sysselsatte 15–74 år etter bostedskommune og arbeidskommune. Prosenten er av de sysselsatte som bor i Narvik (til venstre) og av dem som har arbeidssted i Narvik (til høyre). Noen pendler langt og jobber bare deler av tiden der, for eksempel i turnus. ${ssb('03321', 'Se tallene hos SSB')} (tabell 03321).`;
  table('comm-cmp', [
    { label: 'Sysselsatte som bor der', get: k => num(C[k]?.[y]?.Bosatt) },
    { label: 'Jobber i en annen kommune', get: k => num(C[k]?.[y]?.Utpendlere) },
    { label: 'Andel, beregnet', get: k => (C[k]?.[y] ? pc(C[k][y].Utpendlere / C[k][y].Bosatt * 100, 0) : '·') },
    { label: 'Pendler inn', get: k => num(C[k]?.[y]?.Innpendlere) },
    { label: 'Jobber der', get: k => num(C[k]?.[y]?.Arbeidssted) },
  ], KEYS.filter(k => k !== 'norge'));
  document.getElementById('comm-cmp-caption').innerHTML = `Sysselsatte 15–74 år, november ${y}. For Nordland er det pendling inn og ut av fylket. Andelen er regnet ut her. ${ssb('11616', 'SSB tabell 11616')}.`;
}

start();
