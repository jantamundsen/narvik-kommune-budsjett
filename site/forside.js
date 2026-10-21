// index.html: the front page. Key numbers from each area, the fact sheets in «Utvalgte saker», and a chosen
// set of the numbers where Narvik stands out from the average it is compared with. Everything is read from the same
// data files as the area pages, so the front page changes when they do. Helpers are in common.js.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const load = f => fetch('data/' + f, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const dateText = iso => new Date(iso + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

(async () => {
  const [N, F, B, H, A, V, K, S] = await Promise.all(['narvik.json', 'finans.json', 'befolkning.json', 'bolig.json',
    'arbeid.json', 'naering.json', 'saker.json', 'sammenhenger.json'].map(load));
  keyNumbers(N, F, B, H, A, V);
  cases(K);
  standOut(S);
  const dates = [N, F, B, H, A, V].filter(Boolean).map(d => d.generated.slice(0, 10)).sort();
  if (dates.length) document.getElementById('generated').textContent = dateText(dates.at(-1));
})();

// One number per area, each linking to its page. The change is always in percent from the period before.
function keyNumbers(N, F, B, H, A, V) {
  const sum = a => a.reduce((s, v) => s + v, 0);
  const from = (now, before, when) => (before ? `${chgText(pct(now, before))} fra ${when}` : '');
  const tiles = [], src = [];
  if (B) {
    const ys = Object.keys(B.pyramid).filter(y => y <= B.last).sort(), y = B.last, p = ys.at(-2);
    const tot = k => sum(B.pyramid[k].f) + sum(B.pyramid[k].m);
    tiles.push(['befolkning', 'Befolkning', `Innbyggere 1.1.${y}`, nb(tot(y)), from(tot(y), tot(p), `1.1.${p}`)]);
    src.push(['SSB', '07459', B.sources['07459'].url]);
  }
  if (N) {
    const y = N.years.at(-1), p = N.years.at(-2), t = N.total_1000kr;
    tiles.push(['okonomi', 'Økonomi', `Kommunens netto driftsutgifter ${y}`, `${nb(t[y] / 1000)} mill. kr`, from(t[y], t[p], p)]);
    src.push(['SSB', '12362', N.source.url]);
  }
  if (F) {
    const c = F.per_capita.narvik.KG31, y = F.years.at(-1), p = F.years.at(-2);
    tiles.push(['gjeld', 'Gjeld', `Kommunens netto lånegjeld per innbygger ${y}`, `${nb(c[y])} kr`, from(c[y], c[p], p)]);
    src.push(['SSB', '12137', F.sources['12137'].url]);
  }
  if (H) {
    const tot = y => sum(Object.values(H.stock[y])), ys = Object.keys(H.stock).sort(), y = ys.at(-1), p = ys.at(-2);
    tiles.push(['bolig', 'Bolig', `Boliger i Narvik ${y}`, nb(tot(y)), from(tot(y), tot(p), p)]);
    src.push(['SSB', '06265', H.sources['06265'].url]);
  }
  if (A) {
    const L = A.nav.ledige.narvik, m = Object.keys(L).at(-1), prev = L[`${+m.slice(0, 4) - 1}${m.slice(4)}`];
    const month = `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
    tiles.push(['arbeid', 'Arbeid', `Helt ledige, andel av arbeidsstyrken, ${month}`, `${nb(L[m].pct, 1)} %`,
      `${nb(L[m].n)} personer${prev ? `, mot ${nb(prev.pct, 1)} % ett år før` : ''}`]);
    src.push(['Nav', 'helt ledige (HL060)', Object.values(A.nav.files.HL060).at(-1).page]);
  }
  if (V) {
    const U = V.units.narvik, ys = Object.keys(U).sort(), y = ys.at(-1), p = ys.at(-2), n = k => U[k]['00-99|99'];
    tiles.push(['naering', 'Næringsliv', `Bedrifter i Narvik 1.1.${y}`, nb(n(y)), from(n(y), n(p), `1.1.${p}`)]);
    src.push(['SSB', '10309', V.sources['10309'].url]);
  }
  document.getElementById('key').innerHTML = tiles.map(([href, area, label, big, sub]) => `<a class="stat front-stat" href="${href}">
    <span class="eyebrow">${esc(area)}</span><span class="sub">${esc(label)}</span><span class="big num">${big}</span><span class="sub">${esc(sub)}</span></a>`).join('');
  const ssb = src.filter(s => s[0] === 'SSB').map(s => `<a href="${esc(s[2])}" target="_blank" rel="noopener">${s[1]}</a>`);
  const other = src.filter(s => s[0] !== 'SSB').map(s => `${s[0]}, <a href="${esc(s[2])}" target="_blank" rel="noopener">${esc(s[1])}</a>`);
  document.getElementById('key-src').innerHTML = `Kilder: SSB, tabell ${ssb.join(', ')}. ${other.join('. ')}.`;
}

// Every fact sheet, in the order of config/saker.json, with its first key number. The sources are on the sheet.
function cases(K) {
  if (!K) return;
  document.getElementById('saker').innerHTML = K.saker.map(s => {
    const n = s.nokkeltall?.[0];
    return `<a class="front-case" href="saker?sak=${encodeURIComponent(s.id)}">
      <b>${esc(s.tittel)}</b>
      ${n ? `<span class="front-case-num"><span class="sub">${esc(n.navn)}</span><span class="num">${esc(n.verdi)}</span></span>` : ''}
      <span class="caption">Sist kontrollert ${dateText(s.kontrollert)}</span>
    </a>`;
  }).join('');
}

// The numbers from the pages' «Skiller seg ut» that the front page shows, chosen by Jan, as [page, start of the name].
// They follow the newest numbers in data/sammenhenger.json; one that no longer stands out drops off.
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
  document.getElementById('out').innerHTML = picks.map(([k, m]) => `<li><a class="so so-link" href="${esc(S.sider[k].href)}#skiller-seg-ut">
    <span class="eyebrow">${esc(S.sider[k].navn)} · ${esc(m.aar)}</span>
    <span class="so-name">${esc(m.navn)}${m.beregnet ? ' <span class="tag">beregnet</span>' : ''}</span>
    <b class="so-me num">${val(m, m.verdier.narvik)}</b>
    <span class="so-diff">${arrow(m)}${esc(diff(m))}</span>
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
