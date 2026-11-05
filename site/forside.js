// index.html: the front page. A small map of where people live with the population, key numbers from each area with a
// small line over the years, the fact sheets in «Utvalgte saker», and a chosen set of the numbers where Narvik stands
// out from the average it is compared with, drawn as bars from the average. Everything is read from the same
// data files as the area pages, so the front page changes when they do. Helpers are in common.js.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const load = f => fetch('data/' + f, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const dateText = iso => new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

(async () => {
  const [N, F, B, H, A, V, K, S] = await Promise.all(['narvik.json', 'finans.json', 'befolkning.json', 'bolig.json',
    'arbeid.json', 'naering.json', 'saker.json', 'sammenhenger.json'].map(load));
  hero(B);
  keyNumbers(N, F, B, H, A, V);
  cases(K);
  standOut(S);
  const dates = [N, F, B, H, A, V].filter(Boolean).map(d => d.generated.slice(0, 10)).sort();
  if (dates.length) document.getElementById('generated').textContent = dateText(dates.at(-1));
  heroMap(B);
})();

// The population on 1 January in the newest year, as the page's headline.
function hero(B) {
  if (!B) return;
  const y = B.last, n = [...B.pyramid[y].f, ...B.pyramid[y].m].reduce((s, v) => s + v, 0);
  document.getElementById('hero-when').textContent = `Narvik kommune 1. januar ${y}`;
  document.getElementById('hero-num').textContent = nb(n);
  document.getElementById('hero-what').textContent = 'innbyggere';
}

// A still version of the dot map on Befolkning (prikkart.js): one dot per 250 m cell where someone lives, its area
// following the residents, on the same Kartverket base map (sea, lakes, towns, roads, railway; without the dashed delområde lines, so the kommune's edge is just its shape). The whole map links to the full one. The map data
// (about 300 kB) loads after the rest of the page.
async function heroMap(B) {
  const [D, K] = await Promise.all([load('prikkart.json'), load('prikkart-kart.json')]);
  if (!D || !K || !B) return;
  const NS = 'http://www.w3.org/2000/svg', svg = document.getElementById('hero-map');
  const s = (tag, attrs, parent, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    parent.appendChild(n);
    return n;
  };
  const cells = D.cells, yi = 2 + D.years.length - 1, maxPop = Math.max(...cells.map(c => Math.max(c[2], c[3])));
  // The frame holds the whole kommune, so its shape stands on the page without being cut at the edges.
  const pts = K.kommune.flat(2), pad = 2;
  const x0 = Math.min(...pts.map(p => p[0])) - pad, x1 = Math.max(...pts.map(p => p[0])) + pad;
  const y0 = Math.min(...pts.map(p => p[1])) - pad, y1 = Math.max(...pts.map(p => p[1])) + pad;
  svg.setAttribute('viewBox', `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`);
  svg.setAttribute('aria-label', `Kart over Narvik kommune med én prikk for hvert sted der folk bodde 1. januar ${D.years.at(-1)}. Flest bor i Narvik by.`);
  const P = p => p[0] + ' ' + (-p[1]), ring = r => 'M' + r.map(P).join('L') + 'Z', line = l => 'M' + l.map(P).join('L');
  s('path', { class: 'dm-land', d: K.kommune.map(p => p.map(ring).join('')).join('') }, svg);
  s('path', { class: 'dm-town', d: K.town.map(p => p.map(ring).join('')).join('') }, svg);
  s('path', { class: 'dm-water', d: K.water.map(p => p.map(ring).join('')).join('') }, svg);
  s('path', { class: 'dm-rail', d: K.rail.map(line).join(''), 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, svg);
  const roads = s('path', { class: 'dm-road', d: K.roads.map(line).join(''), 'vector-effect': 'non-scaling-stroke' }, svg);
  const dots = s('g', { class: 'dm-dots' }, svg), labels = s('g', { class: 'dm-labels' }, svg);

  // Sizes in pixels are turned into map units from the drawn width, so dots and labels keep their size on a phone.
  const names = Object.fromEntries(B.areas.rows.map(r => [r.code, r.name]));
  const LABEL = { '180616': 'Kjøpsvik', '180612': 'Ankenes', '180613': 'Håkvik' };
  const TOWN = new Set(['180603', '180604', '180605', '180606', '180607', '180608', '180609', '180610']);
  const PLACES = [['Narvik by', c => TOWN.has(c)], ...['180612', '180601', '180615', '180616', '180614', '180611', '180613']
    .map(code => [LABEL[code] || names[code] || code, c => c === code])];
  const centre = test => {
    let x = 0, y = 0, n = 0;
    cells.forEach(c => { const v = c[yi]; if (v && test(c[4])) { x += (c[0] + 0.5) * v; y += (c[1] + 0.5) * v; n += v; } });
    return n ? [x / n, y / n] : null;
  };
  let lastWidth = 0;
  const draw = () => {
    const w = svg.getBoundingClientRect().width;
    if (!w || Math.abs(w - lastWidth) < 4) return;
    lastWidth = w;
    const k = w / (x1 - x0), px = n => n / k, R = Math.min(18, Math.max(11, k * 1.6));
    roads.setAttribute('stroke-width', k < 5 ? 1.5 : 2.5);
    dots.replaceChildren();
    cells.filter(c => c[yi] > 0).sort((a, b) => b[yi] - a[yi]).forEach(c => s('circle', {
      cx: c[0] + 0.5, cy: -(c[1] + 0.5), r: px(Math.max(1, Math.sqrt(c[yi] / maxPop) * R)).toFixed(3),
      'stroke-width': 0.5, 'vector-effect': 'non-scaling-stroke' }, dots));
    const fs = px(w < 420 ? 11 : 12.5);
    labels.setAttribute('style', `font-size:${fs}px;stroke-width:${px(3)}px`);
    labels.replaceChildren();
    const placed = [];
    PLACES.forEach(([name, test]) => {
      const p = centre(test);
      if (!p) return;
      const t = s('text', { x: p[0], y: -p[1] - fs * 0.9, 'text-anchor': 'middle' }, labels, name);
      const b = t.getBBox();
      if (placed.some(o => b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height)) t.remove();
      else placed.push(b);
    });
  };
  const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
  document.getElementById('hero-caption').innerHTML = `Kilde: ${link(B.sources['07459'].url, 'SSB, tabell 07459')} og ` +
    `${link(D.source.url, 'befolkning på rutenett')}. Kart: Kartverket, ${link(K.kilder.n50, 'N50 Kartdata')}.`;
  document.getElementById('hero-fig').hidden = false;
  draw();
  new ResizeObserver(draw).observe(svg);
}

// One number per area, each linking to its page, with a small line over the years the data has. The line runs from
// the lowest to the highest value in the series (not from zero), so the direction shows; the first and last period
// stand under it. The change is always in percent from the period before.
function keyNumbers(N, F, B, H, A, V) {
  const sum = a => a.reduce((s, v) => s + v, 0);
  const from = (now, before, when) => (before ? `${chgText(pct(now, before))} fra ${when}` : '');
  const tiles = [], src = [];
  if (B) {
    const ys = Object.keys(B.pyramid).filter(y => y <= B.last).sort(), y = B.last, p = ys.at(-2);
    const tot = k => sum(B.pyramid[k].f) + sum(B.pyramid[k].m);
    tiles.push(['befolkning', 'Befolkning', `Innbyggere 1.1.${y}`, nb(tot(y)), from(tot(y), tot(p), `1.1.${p}`), ys.map(k => [k, tot(k)])]);
    src.push(['SSB', '07459', B.sources['07459'].url]);
  }
  if (N) {
    const y = N.years.at(-1), p = N.years.at(-2), t = N.total_1000kr;
    tiles.push(['okonomi', 'Økonomi', `Kommunens netto driftsutgifter ${y}`, `${nb(t[y] / 1000)} mill. kr`, from(t[y], t[p], p), N.years.map(k => [k, t[k]])]);
    src.push(['SSB', '12362', N.source.url]);
  }
  if (F) {
    const c = F.per_capita.narvik.KG31, y = F.years.at(-1), p = F.years.at(-2);
    tiles.push(['gjeld', 'Gjeld', `Kommunens netto lånegjeld per innbygger ${y}`, `${nb(c[y])} kr`, from(c[y], c[p], p), F.years.filter(k => c[k] != null).map(k => [k, c[k]])]);
    src.push(['SSB', '12137', F.sources['12137'].url]);
  }
  if (H) {
    const tot = y => sum(Object.values(H.stock[y])), ys = Object.keys(H.stock).sort(), y = ys.at(-1), p = ys.at(-2);
    tiles.push(['bolig', 'Bolig', `Boliger i Narvik ${y}`, nb(tot(y)), from(tot(y), tot(p), p), ys.map(k => [k, tot(k)])]);
    src.push(['SSB', '06265', H.sources['06265'].url]);
  }
  if (A) {
    const L = A.nav.ledige.narvik, ms = Object.keys(L).sort(), m = ms.at(-1), prev = L[`${+m.slice(0, 4) - 1}${m.slice(4)}`];
    const month = `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
    const span = ms.slice(-24).map(k => [`${k.slice(5)}/${k.slice(2, 4)}`, L[k].pct]);
    tiles.push(['arbeid', 'Arbeid', `Helt ledige, andel av arbeidsstyrken, ${month}`, `${nb(L[m].pct, 1)} %`,
      `${nb(L[m].n)} personer${prev ? `, mot ${nb(prev.pct, 1)} % ett år før` : ''}`, span]);
    src.push(['Nav', 'helt ledige (HL060)', Object.values(A.nav.files.HL060).at(-1).page]);
  }
  if (V) {
    const U = V.units.narvik, ys = Object.keys(U).sort(), y = ys.at(-1), p = ys.at(-2), n = k => U[k]['00-99|99'];
    tiles.push(['naering', 'Næringsliv', `Bedrifter i Narvik 1.1.${y}`, nb(n(y)), from(n(y), n(p), `1.1.${p}`), ys.map(k => [k, n(k)])]);
    src.push(['SSB', '10309', V.sources['10309'].url]);
  }
  document.getElementById('key').innerHTML = tiles.map(([href, area, label, big, sub, series]) => `<a class="stat front-stat" href="${href}">
    <span class="eyebrow">${esc(area)}</span><span class="sub">${esc(label)}</span><span class="big num">${big}</span>${spark(series)}<span class="sub">${esc(sub)}</span></a>`).join('');
  const ssb = src.filter(s => s[0] === 'SSB').map(s => `<a href="${esc(s[2])}" target="_blank" rel="noopener">${s[1]}</a>`);
  const other = src.filter(s => s[0] !== 'SSB').map(s => `${s[0]}, <a href="${esc(s[2])}" target="_blank" rel="noopener">${esc(s[1])}</a>`);
  document.getElementById('key-src').innerHTML = `Kilder: SSB, tabell ${ssb.join(', ')}. ${other.join('. ')}. ` +
    'Linjene går fra laveste til høyeste verdi i perioden, ikke fra null. Driftsutgiftene og lånegjelden er i løpende kroner.';
}

// A small line over [period, value] pairs, with the first and last period under it. Decorative for screen readers:
// the number and change in the tile say the same in words.
function spark(series) {
  if (!series || series.length < 2) return '';
  const vs = series.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), W = 100, H = 28;
  const x = i => i / (vs.length - 1) * W, y = v => (hi === lo ? H / 2 : H - (v - lo) / (hi - lo) * H);
  const pts = vs.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return `<span class="spark" aria-hidden="true"><svg viewBox="0 -3 100 34" preserveAspectRatio="none">
    <polygon class="spark-area" points="0,${H + 3} ${pts} ${W},${H + 3}"></polygon><polyline class="spark-line" points="${pts}"></polyline>
  </svg><span class="spark-ends"><span>${esc(series[0][0])}</span><span>${esc(series.at(-1)[0])}</span></span></span>`;
}

// Every fact sheet, in the order of config/saker.json, with its first key number. The sources are on the sheet.
function cases(K) {
  if (!K) return;
  document.getElementById('saker').innerHTML = K.saker.map(s => {
    const n = s.nokkeltall?.[0];
    return `<a class="front-case" href="sak/${encodeURIComponent(s.id)}">
      <b>${esc(s.tittel)}</b>
      ${n ? `<span class="front-case-num"><span class="sub">${esc(n.navn)}</span><span class="num">${esc(n.verdi)}</span></span>` : ''}
      <span class="caption">Sist kontrollert ${dateText(s.kontrollert)}</span>
    </a>`;
  }).join('');
}

// The numbers from the pages' «Skiller seg ut» that the front page shows, chosen by Jan, as [page, start of the name].
// They follow the newest numbers in data/sammenhenger.json; one that no longer stands out drops off. Økonomi has no
// «Skiller seg ut» of its own (the comparison chart there shows the same areas, Jan 2026-11-05), so its numbers
// link to the chart.
const PICKS = [
  ['utgifter', 'Kommunens netto utgifter til administrasjon'], ['utgifter', 'Kommunens netto utgifter til helse og omsorg'],
  ['inntekter', 'Eiendomsskatt'], ['inntekter', 'Kommunens disposisjonsfond'],
  ['gjeld', 'Kommunens pensjonsforpliktelser'], ['gjeld', 'Kommunens netto lånegjeld'], ['gjeld', 'Renter og avdrag'],
  ['befolkning', 'Endring i antall innbyggere'], ['befolkning', 'Andel av innbyggerne som er 80'],
  ['bolig', 'Nye boliger fullført'], ['arbeid', 'Helt ledige'],
];
function standOut(S) {
  if (!S) return;
  const name = k => S.regioner[k] || k;
  const refName = k => (k === 'landet' || k === 'norge' ? name(k)[0].toLowerCase() + name(k).slice(1) : name(k));
  const val = (m, v) => (v == null ? '·' : nb(v, m.desimaler) + (m.enhet ? (m.enhet === '%' ? ' %' : ' ' + m.enhet) : ''));
  const usePoints = m => m.avvik.points != null && (m.enhet === '%' || m.avvik.share == null);
  const diff = m => (usePoints(m)
    ? `${nb(Math.abs(m.avvik.points), 1)} prosentpoeng ${m.avvik.points > 0 ? 'over' : 'under'} ${refName(m.mot)}`
    : `${nb(Math.abs(m.avvik.share))} % ${m.avvik.share > 0 ? 'over' : 'under'} ${refName(m.mot)}`);
  // ▲/▼ only, no red or green: whether above the average is good or bad is left to the reader.
  const arrow = m => `<span class="arrow" aria-hidden="true">${(usePoints(m) ? m.avvik.points : m.avvik.share) > 0 ? '▲' : '▼'}</span> `;
  const picks = PICKS.map(([k, start]) => [k, S.skiller_seg_ut?.[k]?.find(m => m.navn.startsWith(start))]).filter(p => p[1]);
  document.getElementById('out-lead').textContent = `Tall fra sidene der Narvik ligger minst ${S.grense.niva_prosent} % fra snittet det sammenlignes med, eller ${nb(S.grense.endring_poeng)} prosentpoeng for endringer og andeler. Trykk på et tall for å se det i sammenheng.`;
  const href = k => `${esc(S.sider[k].href)}#${k === 'utgifter' ? 'sammenligning' : 'skiller-seg-ut'}`;
  // Amounts are drawn as bars from the average, in percent of the average, on one scale like the comparison on
  // Økonomi. Shares and changes are in percentage points, which cannot share that scale, so they are listed below.
  const bars = picks.filter(([, m]) => !usePoints(m)).sort((a, b) => b[1].avvik.share - a[1].avvik.share);
  const max = Math.max(...bars.map(([, m]) => Math.abs(m.avvik.share)), 1);
  document.getElementById('out').innerHTML = bars.map(([k, m]) => {
    const v = m.avvik.share, w = Math.min(50, Math.abs(v) / max * 50);
    return `<a class="out-row" href="${href(k)}">
      <span class="out-name"><span class="eyebrow">${esc(S.sider[k].navn)} · ${esc(m.aar)}</span><span>${esc(m.navn)}${m.beregnet ? ' <span class="tag">beregnet</span>' : ''}</span>
        <small>Narvik ${val(m, m.verdier.narvik)}, ${esc(name(m.mot))} ${val(m, m.verdier[m.mot])}</small></span>
      <span class="dev" aria-hidden="true"><span class="${v > 0 ? 'more' : 'less'}" style="width:${w.toFixed(1)}%"></span></span>
      <span class="out-diff num"><span>${arrow(m)}${(v > 0 ? '+' : '−') + nb(Math.abs(v))} %</span><small>${v > 0 ? 'over' : 'under'} ${esc(refName(m.mot))}</small></span>
    </a>`;
  }).join('');
  document.getElementById('out-points').innerHTML = picks.filter(([, m]) => usePoints(m)).map(([k, m]) => `<li><a href="${href(k)}">
    <span class="eyebrow">${esc(S.sider[k].navn)} · ${esc(m.aar)}</span>
    <span class="so-name">${esc(m.navn)}</span>
    <span><b class="num">${val(m, m.verdier.narvik)}</b> <span class="so-diff">${arrow(m)}${esc(diff(m))}</span></span>
    <span class="caption">${esc(name(m.mot))}: ${val(m, m.verdier[m.mot])}.</span>
  </a></li>`).join('');
  const tables = new Map();
  picks.forEach(([, m]) => { const [org, tab] = m.kilde.tekst.split(', '); tables.set(m.kilde.url, { org, tab: tab.replace('tabell ', '') }); });
  const byOrg = {};
  tables.forEach((t, url) => (byOrg[t.org] ||= []).push(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(t.tab)}</a>`));
  const calc = picks.filter(([, m]) => m.beregnet).map(([, m]) => `${esc(m.navn)}: ${esc(m.kilde.tekst.split(', ').slice(2).join(', ') || 'regnet ut her')}`);
  document.getElementById('out-src').innerHTML = `Kilder: ${Object.entries(byOrg).map(([o, l]) => `${esc(o)}, tabell ${l.join(', ')}`).join('. ')}.`
    + (calc.length ? ` Beregnet: ${calc.join('. ')}.` : '');
}
