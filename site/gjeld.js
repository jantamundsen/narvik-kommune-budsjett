// gjeld.html: the kommune's net debt, what interest and repayments cost each year, what the money was invested in,
// for one year (?aar=2025), and Narvik against the comparison regions. Renders site/data/finans.json (written by
// scripts/fetch_finans.py from SSB 12364, 12137 and 12143 and config/investeringer.json) and the «Lån og renter»
// facts in site/data/fakta.json. Helpers are in common.js.
let F, K, year;

const amt = (art, y = year) => F.amounts[art]?.[y] ?? null;
const mill = (v, d = 0) => nb(v / 1000, d);
const ssb = (k, text) => `<a href="${F.sources[k].query}&outputFormat=html" target="_blank" rel="noopener">${text}</a>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Net interest. SSB has «renter (netto)» (AGD97) from 2024; before that only interest net of dividends (AGD24),
// so the dividends (AD905) are added back and the number is marked as computed.
function interest(y) {
  if (amt('AGD97', y) != null) return { v: amt('AGD97', y), computed: false };
  if (amt('AGD24', y) != null && amt('AD905', y) != null) return { v: amt('AGD24', y) + amt('AD905', y), computed: true };
  return { v: null, computed: false };
}
const service = y => {
  const r = interest(y).v, a = amt('AGD21', y);
  return r == null || a == null ? null : r + a;
};

async function start() {
  try {
    const res = await fetch('data/finans.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    F = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/finans.json. Kjør <code>python scripts/fetch_finans.py</code> og åpne siden via en webserver.';
    return;
  }
  K = await fetch('data/fakta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
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
  const debt = amt('KG31'), cap = F.per_capita.narvik?.KG31?.[year], share = F.share.narvik?.KG31?.[year];
  const gcap = F.per_capita.gruppe?.KG31?.[year];
  const group = F.regions.find(r => r.key === 'gruppe');
  const s = service(year), inc = amt('AGD13');

  document.getElementById('lead').innerHTML = `Ved utgangen av ${year} hadde kommunen ${mill(debt)} millioner kroner i netto lånegjeld, ${nb(cap)} kr per innbygger. Det tilsvarer ${nb(share, 1)} % av ett års <a href="inntekter${year === F.years.at(-1) ? '' : '?aar=' + year}">driftsinntekter</a>. Lånene er tatt opp for å betale investeringer i bygg, veier og vann og avløp, og betales ned med avdrag fra driften.`;

  document.getElementById('summary').innerHTML = [
    ['Netto lånegjeld', `${mill(debt)} <small>mill. kr</small>`, prev ? `${chgText(pct(debt, amt('KG31', prev)))} fra ${prev}` : ''],
    ['Netto lånegjeld per innbygger', `${nb(cap)} <small>kr</small>`, gcap ? `${nb(Math.abs(cap / gcap - 1) * 100)} % ${cap >= gcap ? 'mer' : 'mindre'} enn snittet i ${group.name}` : ''],
    ['Renter og avdrag', s == null ? '·' : `${mill(s)} <small>mill. kr</small>`, s == null ? '' : `${nb(s / inc * 100, 1)} % av driftsinntektene`],
  ].map(([label, big, sub]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span></div>`).join('');

  const pension = amt('40');
  document.getElementById('pension').textContent = pension ? `${mill(pension)} millioner kroner ved utgangen av ${year}` : 'i tillegg';

  drawDebt();
  drawBridge();
  drawCost();
  drawInvestments();
  drawCompare();
}

function drawDebt() {
  const debt = F.years.map(y => ({ y, v: amt('KG31', y) }));
  const share = F.years.map(y => ({ y, v: F.share.narvik?.KG31?.[y] ?? null }));
  document.getElementById('debt-chart').innerHTML = columns(debt, v => mill(v), year);
  document.getElementById('debt-share-chart').innerHTML = columns(share, v => nb(v, 1) + ' %', year);
  const first = F.years[0];
  document.getElementById('debt-lead').textContent = `Netto lånegjeld har gått fra ${mill(amt('KG31', first))} millioner kroner i ${first} til ${mill(amt('KG31'))} millioner i ${year}, ${chgText(pct(amt('KG31'), amt('KG31', first)))}. Som andel av driftsinntektene gikk den fra ${nb(F.share.narvik.KG31[first], 1)} % til ${nb(F.share.narvik.KG31[year], 1)} %.`;
  document.getElementById('debt-caption').innerHTML = `Netto lånegjeld (art KG31), kommunekonsern. ${ssb('12364', 'Beløp hos SSB')} (tabell 12364), ${ssb('12143', 'prosent av driftsinntektene hos SSB')} (tabell 12143).`;
}

// «Hvorfor ser du ulike gjeldstall?»: from the kasse's loans in the årsregnskap, step by step to net debt, and then the
// same net debt for the consolidated accounts and the konsern used on the rest of the page. Shown for the selected
// year when config/gjeld_balanse.json has it, else for the newest year it has.
function drawBridge() {
  const B = F.gjeld_balanse || {}, years = Object.keys(B).sort();
  const sec = document.getElementById('bridge');
  if (!years.length) { sec.hidden = true; return; }
  const y = B[year] ? year : years.at(-1), b = B[y], O = F.omfang;
  const pdf = (page, text) => `<a href="${esc(b.kilde.pdf)}#page=${page}" target="_blank" rel="noopener">${text || 's. ' + page}</a>`;
  const share = v => (v == null ? '' : nb(v, 1) + ' %');
  const netto = b.lan - b.utlan - b.ubrukte;
  const rows = [
    ['Lån i banker og Husbanken, kommunekassen', mill(b.lan), '', ''],
    ...(b.formal || []).map(f => [f.navn, mill(f.belop), '', 'sub']),
    ['Minus utlån, mest startlån til innbyggere', '−' + mill(b.utlan), '', ''],
    ['Minus lånte penger som ikke er brukt ennå', '−' + mill(b.ubrukte), '', ''],
    ['Netto lånegjeld, kommunekassen', mill(netto), share(O.kasse.andel[y]), 'total'],
    ['Netto lånegjeld, kommunen med foretakene Narvik Vann KF og Narvik Havn KF', mill(O.konsolidert.belop[y]), share(O.konsolidert.andel[y]), ''],
    ['Netto lånegjeld, kommunekonsern (tallet ellers på denne siden)', mill(amt('KG31', y)), share(F.share.narvik?.KG31?.[y]), 'me'],
  ];
  const t = document.getElementById('bridge-table');
  t.innerHTML = `<thead><tr><th>${y}</th><th>Mill. kr</th><th>Av drifts&shy;inntektene</th></tr></thead><tbody>${rows.map(([n, v, p, c]) =>
    `<tr${c ? ` class="${c}"` : ''}><td>${c === 'sub' ? '<span class="indent">herav </span>' + esc(n.charAt(0).toLowerCase() + n.slice(1)) : esc(n)}</td><td>${v}</td><td>${p}</td></tr>`).join('')}</tbody>`;
  // Three short columns fit on a phone, so the table is not stacked into cards like the others.
  t.classList.add('bridge');
  const low = b.formal?.[0]?.belop ?? netto, high = b.lan + b.pensjon;
  document.getElementById('bridge-lead').textContent = `Gjelden kan regnes på flere måter, fra ${nb(low / 1e6, 1)} til ${nb(high / 1e6, 1)} milliarder kroner for ${y}, avhengig av hva som tas med. Tallene er riktige hver for seg. Tabellen viser hvordan de henger sammen, fra lånene i kommunens regnskap til netto lånegjeld.`;
  document.getElementById('bridge-note').innerHTML = `Regnes pensjonsforpliktelsene med, er den langsiktige gjelden for kommunekassen ${mill(high)} mill. kr. Mot forpliktelsene står pensjonsmidler på ${mill(b.pensjonsmidler)} mill. kr. Prosenten for konsernet er lavere enn for kommunen med foretakene, selv om beløpet er høyere, fordi konsernet også har større driftsinntekter.`;
  document.getElementById('bridge-caption').innerHTML = `Lån, utlån, ubrukte lånemidler og pensjon fra balansen i <a href="${esc(b.kilde.pdf)}" target="_blank" rel="noopener" title="${esc(b.kilde.full)}">${esc(b.kilde.navn)}</a> (${pdf(b.side)})`
    + (b.formal ? `, lånene fordelt på formål fra note 9 (${pdf(b.formal_side)})` : '')
    + `. Netto lånegjeld for kommunekassen og for kommunen med foretakene: ${ssb('13566', 'SSB tabell 13566')}. Kommunekonsern: SSB tabell 12364 og 12143. Kommunekonsernet tar i tillegg med kommunens andel av interkommunale selskaper.`
    + (y !== year ? ` Regnskapet er skrevet inn for ${years.join(' og ')}, så tabellen viser ${y}.` : '');
  sec.hidden = false;
}

function drawCost() {
  const rows = F.years.map(y => {
    const r = interest(y), a = amt('AGD21', y), s = service(y), inc = amt('AGD13', y);
    return { y, r, a, s, share: s == null || !inc ? null : s / inc * 100 };
  });
  const t = document.getElementById('cost-table');
  t.innerHTML = `<thead><tr><th>År</th><th>Renter, netto</th><th>Avdrag</th><th>Renter og avdrag</th><th>Andel av driftsinntektene</th></tr></thead><tbody>${rows.map(x =>
    `<tr${x.y === year ? ' class="me"' : ''}><td>${x.y}</td><td>${x.r.v == null ? '·' : mill(x.r.v)}${x.r.computed ? ' <span class="muted">beregnet</span>' : ''}</td><td>${x.a == null ? '·' : mill(x.a)}</td><td>${x.s == null ? '·' : mill(x.s)}</td><td>${x.share == null ? '·' : nb(x.share, 1) + ' %'}</td></tr>`).join('')}</tbody>`;
  stackable(t);
  const cur = rows.find(x => x.y === year), first = rows[0];
  document.getElementById('cost-lead').textContent = cur.s == null ? '' : `I ${year} gikk ${mill(cur.s)} millioner kroner til renter og avdrag, ${nb(cur.share, 1)} % av driftsinntektene.${first.y !== year && first.s != null ? ` I ${first.y} var det ${mill(first.s)} millioner kroner, ${nb(first.share, 1)} %.` : ''}`;
  document.getElementById('cost-caption').innerHTML = `Millioner kroner, kommunekonsern. Renter netto er renteutgifter minus renteinntekter (art AGD97). SSB har den bare fra 2024; for årene før er den beregnet som renter netto inkludert utbytte (AGD24) pluss utbytte (AD905). Utbytte, for eksempel fra Nordkraft, er holdt utenfor. Avdrag er art AGD21. ${ssb('12364', 'Se tallene hos SSB')} (tabell 12364). Andelen øverst på siden er SSBs netto finansutgifter (art AGD86, tabell 12143), der også utbytte og andre finansinntekter er trukket fra, så den er lavere enn andelen her.`;

  const facts = (K?.fakta || []).filter(f => f.tema === 'Lån og renter' && f.aar === year);
  document.getElementById('loan-facts').hidden = !facts.length;
  document.getElementById('loan-fact-list').innerHTML = facts.length ? factItems(K, facts, false) : '';
}

function drawInvestments() {
  const I = F.investeringer?.[year];
  const box = document.getElementById('inv-list');
  if (!I) {
    box.innerHTML = '';
    document.getElementById('inv-lead').textContent = `Årsrapporten for ${year} er ikke lagt inn ennå.`;
    document.getElementById('inv-caption').textContent = '';
    return;
  }
  const page = p => `${esc(I.kilde.pdf)}#page=${p}`;
  const listed = I.prosjekter.reduce((s, p) => s + p.belop, 0);
  const rows = [...I.prosjekter.map(p => ({
    name: p.navn, sub: p.merknad, v: p.belop,
    note: `<a href="${page(p.sider[0])}" target="_blank" rel="noopener">s. ${p.sider.join('–')}</a>`,
  })), { name: 'Andre prosjekter, aksjer og utlån', v: I.total - listed, note: '', rest: true }];
  const max = Math.max(...rows.map(r => r.v));
  box.innerHTML = rows.map(r => `<div class="rank-row${r.rest ? ' rest' : ''}"><span class="rank-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="rank-track"><span class="rank-fill" style="width:${Math.max(0, r.v / max * 100)}%"></span></span><span class="rank-amt num">${mill(r.v, r.v < 10000 ? 1 : 0)}</span><span class="rank-note">${r.note}</span><span></span></div>`).join('')
    + `<div class="rank-row total"><span class="rank-name">Investeringer i alt</span><span></span><span class="rank-amt num">${mill(I.total)}</span><span class="rank-note"><a href="${page(I.total_side)}" target="_blank" rel="noopener">s. ${I.total_side}</a></span><span></span></div>`;

  const [a, b] = I.prosjekter;
  const gross = amt('AGI1'), loans = amt('AGI29');
  document.getElementById('inv-lead').textContent = `I ${year} brukte kommunen ${mill(I.total)} millioner kroner på investeringer. De største var «${a.navn}» (${mill(a.belop)} mill. kr) og «${b.navn}» (${mill(b.belop)} mill. kr).`
    + (gross && loans ? ` For hele kommunekonsernet var investeringene ${mill(gross)} millioner kroner, og ${mill(loans)} millioner av dem var betalt med lån.` : '');
  document.getElementById('inv-caption').innerHTML = `Millioner kroner. Kommunens egen bevilgningsoversikt for investeringer (§ 5-5 andre ledd) i <a href="${esc(I.kilde.pdf)}" target="_blank" rel="noopener" title="${esc(I.kilde.full)}">${esc(I.kilde.navn)}</a>, regnskap for kommunekassen. Et prosjekt som står både som egen investering og som tilskudd, er slått sammen. Vannprosjektene bygges av Narvik Vann KF og står som tilskudd i kommunens oversikt. Tallene for hele konsernet er brutto investeringsutgifter (art AGI1) og bruk av lån (AGI29) fra ${ssb('12364', 'SSB tabell 12364')}, og blir ikke helt like kommunens egen oversikt.`;
}

function drawCompare() {
  const cols = [
    { label: 'Netto lånegjeld per innb.', get: k => F.per_capita[k]?.KG31?.[year], fmt: v => nb(v) },
    { label: 'Netto lånegjeld, % av inntektene', get: k => F.share[k]?.KG31?.[year], fmt: v => nb(v, 1) + ' %' },
    { label: 'Renter netto, % av inntektene', get: k => F.share[k]?.AGD97?.[year], fmt: v => nb(v, 1) + ' %' },
    { label: 'Avdrag, % av inntektene', get: k => F.share[k]?.AGD21?.[year], fmt: v => nb(v, 1) + ' %' },
    { label: 'Investeringer, % av inntektene', get: k => F.share[k]?.AGI1?.[year], fmt: v => nb(v, 1) + ' %' },
  ];
  const order = ['narvik', 'harstad', 'rana', 'alta', 'gruppe', 'nordland', 'landet'];
  const regions = order.map(k => F.regions.find(r => r.key === k)).filter(Boolean);
  const t = document.getElementById('fin-cmp');
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${regions.map(r => `<tr${r.key === 'narvik' ? ' class="me"' : ''}><td>${r.name}</td>${cols.map(c => { const v = c.get(r.key); return `<td>${v == null ? '·' : c.fmt(v)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  stackable(t);
  const me = F.per_capita.narvik?.KG31?.[year], g = F.per_capita.gruppe?.KG31?.[year];
  const ms = F.share.narvik?.KG31?.[year], gs = F.share.gruppe?.KG31?.[year];
  const group = F.regions.find(r => r.key === 'gruppe');
  document.getElementById('cmp-lead').textContent = me && g
    ? `Narvik hadde ${nb(me)} kr i netto lånegjeld per innbygger i ${year}, mot ${nb(g)} kr i snitt i ${group.name}. Som andel av driftsinntektene var det ${nb(ms, 1)} % i Narvik og ${nb(gs, 1)} % i ${group.name}.`
    : '';
  document.getElementById('cmp-caption').innerHTML = `Kommunekonsern, ${year}. ${group.name}: snitt av ${F.kostra_group_size} kommuner. Landet uten Oslo og Nordland er snitt av kommunene. Beløp per innbygger fra ${ssb('12137', 'SSB tabell 12137')}, prosent av brutto driftsinntekter fra ${ssb('12143', 'SSB tabell 12143')}. SSB har renter netto bare fra 2024. · betyr at SSB ikke har tallet.`;
}

start();
