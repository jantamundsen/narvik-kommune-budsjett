// inntekter.html: where the kommune's operating income comes from, the operating result and the disposisjonsfond,
// for one year (?aar=2025), and Narvik against the comparison regions. Renders site/data/finans.json (written by
// scripts/fetch_finans.py from SSB 12364, 12137 and 12143). Helpers are in common.js.
let F, year;
// The parts of brutto driftsinntekter (AGD13) in 12364, largest first in a normal year, with a plain name.
const SOURCES = [
  { art: 'AG12', name: 'Skatt på inntekt og formue', note: 'Inkludert naturressursskatt' },
  { art: 'A800', name: 'Rammetilskudd fra staten' },
  { art: 'AGD16', name: 'Gebyrer, salg og leie', note: 'Blant annet vann, avløp, renovasjon, SFO, barnehage og husleie' },
  { art: 'AGD62', name: 'Refusjoner og andre overføringer', note: 'Blant annet sykelønnsrefusjon og refusjoner fra andre kommuner og Nav' },
  { art: 'A810', name: 'Andre statlige tilskudd', note: 'Øremerkede tilskudd og andre overføringer fra staten' },
  { art: 'AG10', name: 'Eiendomsskatt' },
  { art: 'AD729', name: 'Momskompensasjon', note: 'Merverdiavgift kommunen får tilbake for driften' },
];

const amt = (art, y = year) => F.amounts[art]?.[y] ?? null;
const mill = (v, d = 0) => nb(v / 1000, d);
const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + nb(Math.abs(v), d);
const ssb = (k, text) => `<a href="${F.sources[k].query}&outputFormat=html" target="_blank" rel="noopener">${text}</a>`;

async function start() {
  try {
    const res = await fetch('data/finans.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    F = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/finans.json. Kjør <code>python scripts/fetch_finans.py</code> og åpne siden via en webserver.';
    return;
  }
  year = F.years.includes(urlYear()) ? urlYear() : F.years.at(-1);
  document.getElementById('generated').textContent = new Date(F.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const yearsEl = document.getElementById('years');
  F.years.forEach(y => {
    const b = el('button', { role: 'radio', type: 'button', 'aria-checked': String(y === year) }, y);
    b.addEventListener('click', () => {
      year = y;
      try { history.replaceState(null, '', y === F.years.at(-1) ? location.pathname : '?aar=' + y); } catch (e) {}
      render();
    });
    yearsEl.appendChild(b);
  });
  render();
}

function render() {
  document.querySelectorAll('#years button').forEach(b => b.setAttribute('aria-checked', String(b.textContent === year)));
  const prev = F.years[F.years.indexOf(year) - 1];
  const total = amt('AGD13'), free = amt('AG11');
  const cap = (k, a) => F.per_capita[k]?.[a]?.[year];
  const share = (k, a) => F.share[k]?.[a]?.[year];
  const group = F.regions.find(r => r.key === 'gruppe');

  document.getElementById('lead').textContent = `Kommunen hadde ${mill(total)} millioner kroner i driftsinntekter i ${year}. ${nb(free / total * 100)} % var frie inntekter, altså skatt og rammetilskudd, som kommunen selv bestemmer bruken av. Resten er gebyrer, refusjoner, statlige tilskudd, eiendomsskatt og momskompensasjon.`;

  const fc = cap('narvik', 'AG11'), gc = cap('gruppe', 'AG11');
  const ndr = amt('AGD23'), ndrPct = share('narvik', 'AGD23');
  document.getElementById('summary').innerHTML = [
    ['Driftsinntekter', `${mill(total)} <small>mill. kr</small>`, prev ? `${chgText(pct(total, amt('AGD13', prev)))} fra ${prev}` : ''],
    ['Frie inntekter per innbygger', `${nb(fc)} <small>kr</small>`, gc ? `${nb(Math.abs(fc / gc - 1) * 100)} % ${fc >= gc ? 'mer' : 'mindre'} enn snittet i ${group.name}` : ''],
    ['Netto driftsresultat', `${signed(ndr / 1000, 1)} <small>mill. kr</small>`, ndrPct != null ? `${nb(ndrPct, 1)} % av driftsinntektene` : ''],
  ].map(([label, big, sub]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span></div>`).join('');

  drawSources(total, prev);
  drawResult();
  drawCompare();
}

function drawSources(total, prev) {
  const rows = SOURCES.map(s => ({ ...s, v: amt(s.art) })).filter(s => s.v != null).sort((a, b) => b.v - a.v);
  const bar = document.getElementById('note-bar'), legend = document.getElementById('note-legend');
  bar.replaceChildren(); legend.replaceChildren();
  rows.forEach((r, i) => {
    const kr = r.v / total * 100;
    const b = el('span', { title: `${r.name}: ${nb(kr, 1)} kr av 100` });
    b.style.flex = `0 0 ${kr}%`;
    b.style.background = `color-mix(in srgb, var(--good) ${Math.round(Math.max(0.22, 1 - i * 0.12) * 100)}%, var(--surface))`;
    if (kr >= 9) b.appendChild(el('span', {}, nb(kr) + ' kr'));
    bar.appendChild(b);
    const li = el('li');
    li.append(el('span', { class: 'kr' }, nb(kr, kr < 1 ? 1 : 0) + ' kr'), el('span', {}, r.name));
    legend.appendChild(li);
  });
  const top = rows.slice(0, 2);
  document.getElementById('note-lead').textContent = `Av hver 100 kroner kommunen fikk inn til driften i ${year}, kom ${nb(top[0].v / total * 100)} kroner fra ${top[0].name.toLowerCase()} og ${nb(top[1].v / total * 100)} fra ${top[1].name.toLowerCase()}.`;

  const t = document.getElementById('inc-table');
  t.innerHTML = `<thead><tr><th>Inntekt</th><th>SSB-art</th><th>Mill. kr</th><th>Andel</th><th>Endring fra ${prev || 'året før'}</th></tr></thead><tbody>${rows.map(r => {
    const p = prev ? pct(r.v, amt(r.art, prev)) : null;
    return `<tr><td>${r.name}${r.note ? `<br><span class="muted">${r.note}</span>` : ''}</td><td class="muted">${r.art}</td><td>${mill(r.v)}</td><td>${nb(r.v / total * 100, 1)} %</td><td>${chgText(p)}</td></tr>`;
  }).join('')}<tr class="total"><td>Driftsinntekter i alt</td><td class="muted">AGD13</td><td>${mill(total)}</td><td>100 %</td><td>${prev ? chgText(pct(total, amt('AGD13', prev))) : '–'}</td></tr></tbody>`;
  stackable(t);
  document.getElementById('inc-caption').innerHTML = `Brutto driftsinntekter i ${year}, kommunekonsern, løpende kroner. Navnene er forenklet; SSB-arten viser hva hver linje er hos SSB. ${ssb('12364', 'Se tallene hos SSB')} (tabell 12364).`;
}

function drawResult() {
  const ndr = F.years.map(y => ({ y, v: F.share.narvik?.AGD23?.[y] ?? null }));
  const fond = F.years.map(y => ({ y, v: F.amounts['56']?.[y] ?? null }));
  document.getElementById('ndr-chart').innerHTML = columns(ndr, v => signed(v, 1) + ' %', year);
  document.getElementById('fond-chart').innerHTML = columns(fond, v => mill(v), year);
  const d = amt('56'), dp = F.share.narvik?.['56']?.[year];
  const r = amt('AGD23');
  document.getElementById('result-lead').textContent = `I ${year} var netto driftsresultat ${signed(r / 1000, 1)} millioner kroner, ${nb(F.share.narvik.AGD23[year], 1)} % av driftsinntektene. Ved utgangen av året hadde kommunen ${mill(d)} millioner kroner på disposisjonsfond, ${nb(dp, 1)} % av driftsinntektene.`;
  document.getElementById('result-caption').innerHTML = `Netto driftsresultat (art AGD23) og disposisjonsfond (art 56), kommunekonsern. ${ssb('12143', 'Prosent av driftsinntektene hos SSB')} (tabell 12143), ${ssb('12364', 'beløp hos SSB')} (tabell 12364).`;
}

function drawCompare() {
  const cols = [
    { label: 'Driftsinntekter per innb.', get: k => F.per_capita[k]?.AGD13?.[year], fmt: v => nb(v) },
    { label: 'Frie inntekter per innb.', get: k => F.per_capita[k]?.AG11?.[year], fmt: v => nb(v) },
    { label: 'Eiendomsskatt per innb.', get: k => F.per_capita[k]?.AG10?.[year], fmt: v => nb(v) },
    { label: 'Netto driftsresultat, % av inntektene', get: k => F.share[k]?.AGD23?.[year], fmt: v => nb(v, 1) + ' %' },
    { label: 'Disposisjonsfond, % av inntektene', get: k => F.share[k]?.['56']?.[year], fmt: v => nb(v, 1) + ' %' },
  ];
  const order = ['narvik', 'harstad', 'rana', 'alta', 'gruppe', 'nordland', 'landet'];
  const regions = order.map(k => F.regions.find(r => r.key === k)).filter(Boolean);
  const t = document.getElementById('fin-cmp');
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${regions.map(r => `<tr${r.key === 'narvik' ? ' class="me"' : ''}><td>${r.name}</td>${cols.map(c => { const v = c.get(r.key); return `<td>${v == null ? '·' : c.fmt(v)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  stackable(t);
  const fc = F.per_capita.narvik?.AG11?.[year], gc = F.per_capita.gruppe?.AG11?.[year];
  const group = F.regions.find(r => r.key === 'gruppe');
  const pop = F.amounts.AG11?.[year] && fc ? F.amounts.AG11[year] * 1000 / fc : null;
  document.getElementById('cmp-lead').textContent = fc && gc
    ? `Narvik hadde ${nb(fc)} kr i frie inntekter per innbygger i ${year}, ${nb(Math.abs(fc - gc))} kr ${fc >= gc ? 'mer' : 'mindre'} enn snittet i ${group.name}${pop ? `. Med ${nb(Math.round(pop))} innbyggere tilsvarer det ${nb(Math.abs(fc - gc) * pop / 1e6)} millioner kroner` : ''}.`
    : '';
  document.getElementById('cmp-caption').innerHTML = `Kommunekonsern, ${year}. ${group.name}: snitt av ${F.kostra_group_size} kommuner. Landet uten Oslo og Nordland er snitt av kommunene. Beløp per innbygger fra ${ssb('12137', 'SSB tabell 12137')}, prosent av brutto driftsinntekter fra ${ssb('12143', 'SSB tabell 12143')}. · betyr at SSB ikke har tallet.`;
}

start();
