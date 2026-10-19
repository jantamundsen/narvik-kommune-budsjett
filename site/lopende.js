// Året så langt: renders site/data/lopende.json (written by scripts/fetch_lopende.py) on lopende.html. Helpers are in common.js.
async function startRunning() {
  let L;
  try {
    const res = await fetch('data/lopende.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    L = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/lopende.json. Kjør <code>python scripts/fetch_lopende.py</code> og åpne siden via en webserver.';
    return;
  }
  const R = L.reports.at(-1), A = R.areas, T = A.total;
  const mk = v => nb(v / 1000, Math.abs(v) < 10000 ? 1 : 0);
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + mk(Math.abs(v));
  // The reports write avvik as budget minus accounts. The site shows overspending as a positive, red number, like budsjett.html.
  const over = v => -v;
  const cls = v => (v > 500 ? 'up' : v < -500 ? 'down' : '');
  const pdfLink = (page, text) => el('a', { href: R.pdf + '#page=' + page, target: '_blank', rel: 'noopener' }, text || `PDF s. ${page}`);
  const cite = (id, page, table, extra) => {
    const c = document.getElementById(id);
    c.replaceChildren('Mill. kr. Kilde: ', el('a', { href: R.url, target: '_blank', rel: 'noopener' }, R.name), `, tabell «${table}» (`, pdfLink(page), '). ' + (extra || ''));
  };
  const head = cols => {
    const h = el('div', { class: 'ledger-head' });
    cols.forEach((t, i) => h.appendChild(el('span', i > 1 ? { class: 'r' } : {}, t)));
    return h;
  };
  const row = (name, bar, a, aLabel, b, chg, chgCls, total) => {
    const r = el('div', { class: 'budget-row' + (total ? ' total' : '') });
    const y1 = el('span', { class: 'r num c-y1' }); y1.append(el('span', { class: 'm-label' }, aLabel + ' '), a);
    // On phones the column heads are hidden, so the amount and change carry their own labels.
    const amt = el('span', { class: 'r num c-amt' }), ch = el('span', { class: 'r chg c-chg ' + chgCls });
    if (labels[0]) amt.append(el('span', { class: 'm-label' }, labels[0] + ' '));
    if (labels[1]) ch.append(el('span', { class: 'm-label' }, labels[1] + ' '));
    amt.append(b); ch.append(chg);
    r.append(el('span', { class: 'c-name row-name' }, name), bar || el('span', { class: 'c-share' }), y1, amt, ch);
    return r;
  };
  let labels = [];
  const months = R.months, monthsShare = months / 12;
  const name = key => L.areas.find(a => a.key === key).name;

  document.title = `${L.year} så langt · Åpen økonomi i Narvik`;
  document.getElementById('title').textContent = `${L.year} så langt`;
  document.getElementById('eyebrow').textContent = `Narvik kommune · budsjett og forbruk i ${L.year}, oppdatert med ${R.name.split(',')[0].toLowerCase()}`;
  const overNow = over(T.avvik_hia), overYear = over(T.prognose_aarsavvik);
  document.getElementById('lead').textContent =
    `Fra ${R.period} brukte kommunen ${mk(T.regnskap_hia)} mill. kr på tjenesteområdene, ${mk(Math.abs(overNow))} mill. kr ${overNow >= 0 ? 'mer' : 'mindre'} enn budsjettert for de samme månedene. ` +
    `Kommunedirektøren venter ${overYear > 0 ? `et merforbruk på ${mk(overYear)} mill. kr` : overYear < 0 ? `et mindreforbruk på ${mk(-overYear)} mill. kr` : 'balanse'} for hele året.`;

  // Key numbers.
  const stat = (label, big, unit, sub) => {
    const s = el('div', { class: 'stat' });
    const b = el('div', { class: 'big num' }, big); b.append(' ', el('small', {}, unit));
    s.append(el('div', { class: 'eyebrow' }, label), b, el('div', { class: 'sub' }, sub));
    return s;
  };
  const F = R.fund;
  document.getElementById('summary').replaceChildren(
    stat('Vedtatt budsjett', mk(T.opprinnelig), 'mill. kr', `Justert til ${mk(T.revidert)} mill. kr i løpet av året.`),
    stat(`Brukt ${R.period}`, mk(T.regnskap_hia), 'mill. kr', `${nb(T.regnskap_hia / T.revidert * 100)} % av årets budsjett etter ${months} av 12 måneder (${nb(monthsShare * 100)} %).`),
    stat('Prognose for året', signed(overYear), 'mill. kr', overYear > 0 ? 'Merforbruk mot budsjettet, ifølge kommunedirektøren.' : 'Avvik mot budsjettet, ifølge kommunedirektøren.'),
    stat('Disposisjonsfond', nb(F.saldo_naa_mill), 'mill. kr', `Ned til ${nb(F.saldo_prognose_mill)} mill. kr per ${F.saldo_prognose_dato} hvis prognosen slår til.`),
  );
  document.getElementById('summary').hidden = false;
  const st = document.getElementById('status');
  st.replaceChildren(`Siste tall er fra ${R.name} (`, pdfLink(6, 's. 6'), `). Neste tall per tjenesteområde kommer med årsregnskapet for ${L.year}, tidlig i ${+L.year + 1}. ` + (L.missing ? L.missing + ' ' : '') + 'Skattetallene lenger ned oppdateres hver måned.');
  st.hidden = false;

  // Per area: spent so far against the year's budget, the gap so far and the forecast.
  labels = ['Årsbudsjett', 'Prognose året'];
  const led = document.getElementById('areas-ledger');
  led.replaceChildren(head(['Tjenesteområde', 'Brukt av årsbudsjettet', 'Avvik hittil', 'Årsbudsjett', 'Prognose året']));
  L.areas.forEach(a => {
    const r = A.rows[a.key], o = over(r.avvik_hia);
    const bar = el('span', { class: 'c-share used' });
    const track = el('span', { class: 'used-track' }), fill = el('span', { class: 'used-fill ' + (o > 500 ? 'over' : 'under') }), tick = el('i');
    fill.style.width = Math.min(100, r.regnskap_hia / r.revidert * 100) + '%';
    tick.style.left = Math.min(100, r.budsjett_hia / r.revidert * 100) + '%';
    tick.title = `Budsjett hittil: ${mk(r.budsjett_hia)} mill. kr`;
    track.append(fill, tick);
    bar.append(track, el('small', {}, `${mk(r.regnskap_hia)} av ${mk(r.revidert)} · ${nb(r.regnskap_hia / r.revidert * 100)} %`));
    bar.title = `Brukt ${mk(r.regnskap_hia)} mill. kr, budsjett hittil ${mk(r.budsjett_hia)} mill. kr, årsbudsjett ${mk(r.revidert)} mill. kr`;
    led.appendChild(row(a.name, bar, signed(o), 'Avvik hittil', mk(r.revidert), signed(over(r.prognose_aarsavvik)), cls(over(r.prognose_aarsavvik))));
  });
  led.appendChild(row('Sum', null, signed(overNow), 'Avvik hittil', mk(T.revidert), signed(overYear), cls(overYear), true));
  document.getElementById('h-areas').textContent = 'Per tjenesteområde';
  const worst = L.areas.map(a => ({ a, o: over(A.rows[a.key].prognose_aarsavvik) })).sort((p, q) => q.o - p.o)[0];
  document.getElementById('areas-lead').textContent = worst.o > 0
    ? `${worst.a.name} står for ${mk(worst.o)} av de ${mk(overYear)} millionene kommunedirektøren venter i merforbruk. Streken i hver stolpe viser hvor mye som var budsjettert brukt per ${R.period.split('–').at(-1)}.`
    : `Streken i hver stolpe viser hvor mye som var budsjettert brukt per ${R.period.split('–').at(-1)}.`;
  cite('areas-caption', A.pdf_page, A.table, `Pluss betyr merforbruk, minus mindreforbruk. Årsbudsjettet er revidert budsjett per ${R.period.split('–').at(-1)}, før reguleringene rapporten foreslår (se rapportens s. 46 for budsjettet etter dem). «Avvik hittil» måles mot budsjettet for de samme månedene. Kommunedirektør og stab heter «Kommunedirektøren» i rapporten.`);
  document.getElementById('areas').hidden = false;
  showFacts(L, worst.a.key);

  // How the budget has changed since it was adopted.
  labels = ['Nå', 'Endring'];
  const cl = document.getElementById('changes-ledger');
  cl.replaceChildren(head(['Tjenesteområde', '', 'Vedtatt', 'Nå', 'Endring']));
  L.areas.forEach(a => {
    const r = A.rows[a.key], d = r.revidert - r.opprinnelig;
    cl.appendChild(row(a.name, null, mk(r.opprinnelig), 'Vedtatt', mk(r.revidert), signed(d), ''));
  });
  cl.appendChild(row('Sum', null, mk(T.opprinnelig), 'Vedtatt', mk(T.revidert), signed(T.revidert - T.opprinnelig), '', true));
  document.getElementById('changes-lead').textContent = `Kommunestyret vedtok ${mk(T.opprinnelig)} mill. kr til tjenesteområdene i desember. Per ${R.period.split('–').at(-1)} er rammene ${mk(T.revidert)} mill. kr. Mye av økningen er lønnsoppgjøret, som budsjetteres på fellesposten og fordeles når det er klart. ${R.name.split(',')[0]} foreslår i tillegg disse endringene:`;
  document.getElementById('reg-list').replaceChildren(...R.regulations.items.map(t => el('li', {}, t)));
  cite('changes-caption', A.pdf_page, A.table, '');
  document.getElementById('changes-caption').append('Forslagene er fra ', pdfLink(R.regulations.pdf_page, `s. ${R.regulations.pdf_page}`), '.');
  document.getElementById('changes').hidden = false;

  // Central income. The report writes income as negative numbers; here it is shown as positive, and a positive gap is more income than budgeted.
  labels = ['Inntekt hittil', 'Avvik'];
  const I = R.income, il = document.getElementById('income-ledger');
  il.replaceChildren(head(['Inntekt', '', 'Budsjett hittil', 'Inntekt hittil', 'Avvik']));
  for (const [n, r] of Object.entries(I.rows)) {
    il.appendChild(row(n, null, mk(-r.budsjett_hia), 'Budsjett hittil', mk(-r.regnskap_hia), signed(r.avvik_hia), r.avvik_hia < -500 ? 'up' : r.avvik_hia > 500 ? 'down' : ''));
  }
  il.appendChild(row('Sum', null, mk(-I.total.budsjett_hia), 'Budsjett hittil', mk(-I.total.regnskap_hia), signed(I.total.avvik_hia), '', true));
  document.getElementById('income-lead').textContent = `Skatt, rammetilskudd og eiendomsskatt betaler for det meste av driften. Per ${R.period.split('–').at(-1)} hadde kommunen fått inn ${mk(-I.total.regnskap_hia)} mill. kr av ${mk(-I.total.revidert)} mill. kr budsjettert for året.`;
  cite('income-caption', I.pdf_page, I.table, 'Pluss betyr mer inntekt enn budsjettert.');
  document.getElementById('income').hidden = false;

  drawTax(L.tax, L.year, I.rows['Inntekts- og formuesskatt']);
}

// «Bak tallene»: what the kommune's own reports say behind this year's numbers, per area, from data/fakta.json.
// The area with the largest expected overspending comes first, after the facts about the whole kommune. Each area
// shows two facts, and the rest behind a tap, so the page stays short.
async function showFacts(L, first) {
  const F = await fetch('data/fakta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const facts = (F?.fakta || []).filter(f => f.aar === L.year);
  if (!facts.length) return;
  const keys = ['hele', first, ...L.areas.map(a => a.key).filter(k => k !== first)];
  const groups = keys.map(k => [k, facts.filter(f => f.rammeomrade === k)]).filter(([, list]) => list.length);
  document.getElementById('facts-groups').innerHTML = groups.map(([k, list]) =>
    `<div class="fact-group"><h3>${k === 'hele' ? 'Hele kommunen' : F.rammeomrader[k]}</h3><ul class="fact-list">${factItems(F, list.slice(0, 2), false)}</ul>`
    + (list.length > 2 ? `<details class="all-numbers"><summary>Vis ${list.length - 2} til</summary><ul class="fact-list">${factItems(F, list.slice(2), false)}</ul></details>` : '') + '</div>').join('');
  document.getElementById('facts-lead').textContent = `Tallene over sier hvor mye som er brukt, men ikke hvorfor. Dette er noe av det kommunens egne rapporter forteller om ${L.year}: sykefravær, vikarer, investeringer og kommunens egne forklaringer.`;
  document.getElementById('facts').hidden = false;
}

// Paid-in tax, accumulated per month: this year against last year, with this year's budget as a reference.
function drawTax(X, year, budgetRow) {
  const prev = String(+year - 1), cur = X.months[year], old = X.months[prev];
  const last = cur.reduce((m, v, i) => (v === null ? m : i), -1);
  if (last < 0) return;
  const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const budget = budgetRow ? -budgetRow.revidert / 1000 : null;
  const W = 720, H = 300, m = { l: 48, r: 92, t: 16, b: 32 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.ceil(Math.max(...old.filter(v => v !== null), ...cur.filter(v => v !== null), budget || 0) / 100) * 100;
  const x = i => m.l + i / 11 * iw, y = v => m.t + ih - v / max * ih;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Skatt til Narvik kommune, akkumulert per måned, ${prev} og ${year}` });
  for (let v = 0; v <= max; v += 200) {
    svg.append(s('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: 'var(--rule)', 'stroke-width': 1 }));
    svg.append(s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, nb(v)));
  }
  MON.forEach((t, i) => svg.append(s('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, t)));
  if (budget) {
    svg.append(s('line', { x1: m.l, x2: m.l + iw, y1: y(budget), y2: y(budget), stroke: 'var(--ink-2)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.append(s('text', { x: m.l + iw + 6, y: y(budget) + 4, 'font-size': 12, fill: 'var(--ink-2)' }, `Budsjett ${year}`));
  }
  const path = (vals, color) => {
    const pts = vals.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean);
    svg.append(s('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    pts.forEach(p => svg.append(s('circle', { cx: p[0], cy: p[1], r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 })));
    return pts.at(-1);
  };
  const endOld = path(old, 'var(--muted)'), endCur = path(cur, 'var(--accent)');
  svg.append(s('text', { x: endOld[0] + 8, y: endOld[1] + 4, 'font-size': 12, fill: 'var(--ink-2)' }, prev));
  svg.append(s('text', { x: endCur[0] + 8, y: endCur[1] + 4, 'font-size': 12, 'font-weight': 700, fill: 'var(--ink)' }, year));
  // Hover: a crosshair and a tooltip for the month under the pointer.
  const hair = s('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--ink-2)', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(hair);
  const box = document.getElementById('tax-chart');
  box.replaceChildren(svg);
  const tip = el('div', { class: 'chart-tip', hidden: '' });
  box.append(tip);
  const fmt = v => (v === null ? '–' : nb(v, 1));
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(11, Math.round((px - m.l) / iw * 11)));
    hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i)); hair.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('b', {}, MONTHS[i]), el('span', {}, `${year}: ${fmt(cur[i])} mill. kr`), el('span', {}, `${prev}: ${fmt(old[i])} mill. kr`));
    tip.hidden = false;
    const bx = box.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - bx.left + 12, bx.width - 170) + 'px';
    tip.style.top = (e.clientY - bx.top + 12) + 'px';
  });
  svg.addEventListener('pointerleave', () => { hair.setAttribute('visibility', 'hidden'); tip.hidden = true; });

  document.getElementById('tax-legend').replaceChildren(
    ...[[year, 'var(--accent)'], [prev, 'var(--muted)']].map(([t, c]) => { const sp = el('span'); const i = el('i'); i.style.background = c; sp.append(i, t); return sp; }),
    ...(budget ? [el('span', {}, `Stiplet: budsjettert skatt for ${year}`)] : []));
  const now = cur[last], then = old[last];
  document.getElementById('tax-lead').textContent =
    `Til og med ${MONTHS[last]} er det betalt inn ${nb(now, 1)} mill. kr i skatt til kommunen, mot ${nb(then, 1)} mill. kr på samme tid i fjor. ` +
    `Sammenligningen er likevel skjev: et nytt skattesystem fra ${year} fordeler innbetalingene jevnere over året, så tallene per måned kan ikke sammenlignes direkte med tidligere år.`;
  const tbl = document.getElementById('tax-table');
  const hr = el('tr'); ['Måned', year, prev].forEach(t => hr.appendChild(el('th', {}, t)));
  tbl.replaceChildren(hr, ...MONTHS.map((t, i) => { const tr = el('tr'); [t, fmt(cur[i]), fmt(old[i])].forEach(v => tr.appendChild(el('td', {}, v))); return tr; }));
  const c = document.getElementById('tax-caption');
  c.replaceChildren(`Mill. kr, akkumulert fra januar. «${X.label}» i `, el('a', { href: X.url, target: '_blank', rel: 'noopener' }, X.name), ' (', el('a', { href: X.data_url, target: '_blank', rel: 'noopener' }, 'spørringen'), `), sist oppdatert av SSB ${new Date(X.updated).toLocaleDateString('nb-NO')}. SSB teller skatten når den betales inn, mens kommuneregnskapet fører den når den gjelder, så tallene skiller seg noe fra regnskapet. ` +
    (budget ? `Budsjettlinjen er «Inntekts- og formuesskatt», revidert budsjett, fra tertialrapportens s. 7.` : ''));
  document.getElementById('tax').hidden = false;
}

startRunning();
