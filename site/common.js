// Helpers shared by app.js (okonomi.html), forside.js (index.html), budsjett.js (budsjett.html), omrade.js and lopende.js.
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
// Utgifter, Inntekter and Gjeld show the same accounting years, so their links in .sub-nav keep the year
// selected on the page the reader is on (?aar=2023). Read at click time, since the pages change it in place.
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[data-aar]');
  const y = urlYear();
  if (a && y) a.href = new URL(a.href).pathname + '?aar=' + encodeURIComponent(y);
});

// «Skiller seg ut» and «Henger sammen med», from data/sammenhenger.json (scripts/build_sammenhenger.py).
// «Skiller seg ut» lists this page's numbers where Narvik is clearly off the average; «Henger sammen med» shows
// numbers on other pages that can affect this page's, or be affected by them. A page opts in with
// <section id="skiller-seg-ut" data-side="…" hidden> and <section id="sammenhenger" data-side="…" hidden>;
// on omrade.html the side is the area in the address.
(async () => {
  const outSec = document.getElementById('skiller-seg-ut'), sec = document.getElementById('sammenhenger');
  if (!outSec && !sec) return;
  const sideOf = el => (el.dataset.side === 'omrade' ? 'omrade:' + new URLSearchParams(location.search).get('omrade') : el.dataset.side);
  let S;
  try { S = await fetch('data/sammenhenger.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)); } catch (e) { return; }
  if (!S) return;
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const name = k => S.regioner[k] || k;
  const refName = k => (k === 'landet' || k === 'norge' ? name(k)[0].toLowerCase() + name(k).slice(1) : name(k));
  const val = (m, v) => (v == null ? '·' : nb(v, m.desimaler) + (m.enhet ? (m.enhet === '%' ? ' %' : ' ' + m.enhet) : ''));
  const diff = m => {
    const a = m.avvik;
    if (!a) return '';
    if (a.points != null && (m.enhet === '%' || a.share == null)) {
      return a.points === 0 ? `Likt med ${refName(m.mot)}` : `${nb(Math.abs(a.points), 1)} prosentpoeng ${a.points > 0 ? 'over' : 'under'} ${refName(m.mot)}`;
    }
    return a.share === 0 ? `Likt med ${refName(m.mot)}` : `${nb(Math.abs(a.share))} % ${a.share > 0 ? 'over' : 'under'} ${refName(m.mot)}`;
  };
  // Over or under the average as an arrow next to the text. No red or green: whether a number above the
  // average is good or bad is a judgement, and the site leaves that to the reader.
  const arrow = m => {
    const a = m.avvik, v = a && (a.points != null && (m.enhet === '%' || a.share == null) ? a.points : a.share);
    return v ? `<span class="arrow" aria-hidden="true">${v > 0 ? '▲' : '▼'}</span> ` : '';
  };
  // One source line per section instead of one per number: the tables, each linked once, and how the numbers
  // marked «beregnet» were worked out.
  const sources = ms => {
    const tables = new Map();
    ms.forEach(m => { const [org, tab] = m.kilde.tekst.split(', '); tables.set(m.kilde.url, { org, tab: tab.replace('tabell ', '') }); });
    const byOrg = {};
    tables.forEach((t, url) => (byOrg[t.org] ||= []).push(`<a href="${h(url)}" target="_blank" rel="noopener">${h(t.tab)}</a>`));
    const calc = [...new Map(ms.filter(m => m.beregnet).map(m => [m.navn, m])).values()]
      .map(m => `${h(m.navn)}: ${h(m.kilde.tekst.split(', ').slice(2).join(', ') || 'regnet ut her')}`);
    return `<p class="caption">Kilder: ${Object.entries(byOrg).map(([o, l]) => `${h(o)}, tabell ${l.join(', ')}`).join('. ')}.`
      + (calc.length ? ` Beregnet: ${calc.join('. ')}.` : '') + '</p>';
  };

  // On pages with a year selector the list follows the chosen year; the pages change ?aar= in place, so check
  // after each click whether it changed.
  const drawOut = () => {
    const side = sideOf(outSec), byYear = S.skiller_seg_ut_aar?.[side], y = urlYear();
    const list = byYear && byYear[y] ? byYear[y] : S.skiller_seg_ut?.[side];
    outSec.hidden = !list?.length;
    if (!list?.length) return;
    outSec.innerHTML = `<div class="section-head"><h2 id="h-out">Skiller seg ut</h2>
      <p class="lead">Tallene her der Narvik ligger minst ${S.grense.niva_prosent} % fra snittet det sammenlignes med, eller ${nb(S.grense.endring_poeng)} prosentpoeng for endringer og resultat. Størst forskjell først.</p></div>
      <ul class="so-list">${list.map(m => `<li class="so">
        <span class="so-name">${h(m.navn)} <span class="caption">${h(m.aar)}</span>${m.beregnet ? ' <span class="tag">beregnet</span>' : ''}</span>
        <b class="so-me num">${val(m, m.verdier.narvik)}</b>
        <span class="so-diff">${arrow(m)}${h(diff(m))}</span>
        <span class="caption">${h(name(m.mot))}: ${val(m, m.verdier[m.mot])}.</span>
      </li>`).join('')}</ul>${sources(list)}`;
    outSec.setAttribute('aria-labelledby', 'h-out');
  };
  if (outSec) {
    drawOut();
    if (S.skiller_seg_ut_aar?.[sideOf(outSec)]) {
      let shown = urlYear();
      document.addEventListener('click', () => setTimeout(() => { if (urlYear() !== shown) { shown = urlYear(); drawOut(); } }));
    }
  }

  if (!sec) return;
  const side = sideOf(sec);
  const from = S.lenker.filter(l => l.fra === side);
  const to = S.lenker.filter(l => l.til.includes(side));
  if (!from.length && !to.length) return;
  const measure = m => {
    const others = Object.keys(m.verdier).filter(k => k !== 'narvik' && k !== m.mot).map(k => `${h(name(k))} ${val(m, m.verdier[k])}`).join(' · ');
    const d = diff(m);
    return `<li class="lm">
      <div class="lm-name">${h(m.navn)} <span class="caption">${h(m.aar)}</span>${m.beregnet ? ' <span class="tag">beregnet</span>' : ''}</div>
      <div class="lm-vals num"><span><small>Narvik</small><b>${val(m, m.verdier.narvik)}</b></span><span><small>${h(name(m.mot))}</small><b>${val(m, m.verdier[m.mot])}</b></span>${d ? `<span class="lm-diff">${arrow(m)}${h(d)}</span>` : ''}</div>
      ${others ? `<p class="caption">${h(others)}.</p>` : ''}
    </li>`;
  };
  // Each link is one short row: what it is about, one key number from the other page and a link there. The full
  // numbers open on demand, so the section stays short on pages that have many links (Jan, 2026-11-01).
  const keyLine = m => `${h(m.navn)}${m.aar ? ` ${h(m.aar)}` : ''}: <b class="num">${val(m, m.verdier.narvik)}</b>${diff(m) ? `, ${arrow(m)}${h(diff(m))}` : ''}`;
  const row = (l, dir) => {
    const other = S.sider[dir === 'ut' ? l.til[0] : l.fra];
    // The number shown in the row is one from the other page: the link's first number when the other page affects
    // this one, its last when this page affects the other.
    const key = dir === 'inn' ? l.maal[0] : l.maal.at(-1);
    return `<li class="link-row">
      <div class="link-head">
        <span class="eyebrow">${h(S.sider[l.fra].navn)} → ${h(S.sider[l.til[0]].navn)}</span>
        <h4>${h(l.tittel)}</h4>
        <p class="link-key">${keyLine(key)}</p>
      </div>
      <a class="cross-link" href="${h(other.href)}">${h(other.navn)} →</a>
      <details class="link-more"><summary>Vis alle tallene og hvorfor de henger sammen</summary>
        <p>${h(l.tekst)}</p>
        <ul class="lm-list">${l.maal.map(measure).join('')}</ul>
        ${l.merknad ? `<p class="caption">${h(l.merknad)}</p>` : ''}
      </details>
    </li>`;
  };
  const group = (title, list, dir) => (list.length ? `<div class="link-group"><h3>${title}</h3><ul class="link-rows">${list.map(l => row(l, dir)).join('')}</ul></div>` : '');
  sec.innerHTML = `<div class="section-head"><h2 id="h-links">Henger sammen med</h2>
    <p class="lead">Tall på andre sider som kan påvirke tallene her, eller som tallene her kan påvirke. Viser alltid de nyeste tallene.</p></div>
    ${group('Kan påvirke', from, 'ut')}${group('Kan påvirkes av', to, 'inn')}${sources([...from, ...to].flatMap(l => l.maal))}`;
  sec.setAttribute('aria-labelledby', 'h-links');
  sec.hidden = false;
})();

// saker.html and omrade.html draw many pages from one file, so they set their own canonical address once they know
// which page they show. Only the parameters that pick the page are kept (not year, scope or «Sammenlign per»),
// so search engines see one address per case or area and not the same file under many addresses.
function setCanonical(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const url = 'https://narviktall.no/' + path + (qs ? '?' + qs : '');
  for (const [sel, make] of [['link[rel="canonical"]', () => el('link', { rel: 'canonical' })], ['meta[property="og:url"]', () => el('meta', { property: 'og:url' })]]) {
    const node = document.head.querySelector(sel) || document.head.appendChild(make());
    node.setAttribute(sel.startsWith('link') ? 'href' : 'content', url);
  }
}
