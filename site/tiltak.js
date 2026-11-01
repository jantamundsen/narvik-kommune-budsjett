// Innsparinger: renders site/data/tiltak.json (written by scripts/fetch_tiltak.py) on tiltak.html. Helpers are in common.js.
const STATUS = {
  'gjennomfort': ['Gjennomført', 'good'],
  'i-arbeid': ['I arbeid', ''],
  'forsinket': ['Forsinket eller mindre effekt', 'bad'],
  'ikke-gjennomfort': ['Ikke gjennomført', 'bad'],
  'ikke-oppgitt': ['Nevnt uten status', 'none'],
  'reversert': ['Tatt ut av kommunestyret', ''],
  'ingen': ['Ingen status i rapportene', 'none'],
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mk = v => nb(v / 1000, 1);
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + mk(Math.abs(v));

async function startTiltak() {
  let T;
  try {
    const res = await fetch('data/tiltak.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    T = await res.json();
  } catch (e) {
    document.querySelector('.wrap header').insertAdjacentHTML('beforeend', '<p class="lead">Fant ikke data/tiltak.json. Kjør <code>python scripts/fetch_tiltak.py</code> og åpne siden via en webserver.</p>');
    return;
  }
  const areaName = Object.fromEntries(T.areas.map(a => [a.key, a.name]));
  const years = Object.keys(T.sources).sort();
  const link = (href, text, title) => `<a href="${esc(href)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</a>`;
  const cite = k => {
    if (k.url) return link(k.url, k.navn);
    const r = T.kilder[k.id];
    return k.side ? link(`${r.pdf}#page=${k.side}`, `${r.navn}, s. ${k.side}`, r.full) : link(r.pdf, r.navn, r.full);
  };
  const framsikt = (ln, y) => `${link(T.sources[y].page_url, T.sources[y].name)}, kategori «${esc(T.kategorier[ln.kategori])}» (${link(ln.data_url, 'data')})`;

  // One source line per area: the Framsikt page, with one data link per category the area's cuts come from.
  const areaSrc = (list, y) => {
    const cats = [...new Map(list.map(l => [l.kategori, l.data_url])).entries()];
    return `${link(T.sources[y].page_url, T.sources[y].name)}, ${cats.length > 1 ? 'kategoriene' : 'kategori'} `
      + cats.map(([c, u], i) => (i ? (i === cats.length - 1 ? ' og ' : ', ') : '') + `«${esc(T.kategorier[c])}» (${link(u, 'data')})`).join('');
  };

  // Sankey: from each area to what the reports say happened. Width is mill. kr, or the number of measures,
  // which is the only way to show the cuts the budget gives no amount for.
  const FLOW = [
    ['gjennomfort', 'rep'], ['i-arbeid', 'rep'], ['forsinket', 'rep'], ['ikke-gjennomfort', 'rep'],
    ['ikke-oppgitt', 'none'], ['ingen', 'none'], ['reversert', 'back'],
  ];
  let unit = 'kr', flowArgs = null;
  const unitEl = document.getElementById('flow-unit');
  unitEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    unit = b.dataset.unit;
    unitEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    if (flowArgs) drawFlow(...flowArgs);
  }));
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => flowArgs && drawFlow(...flowArgs), 150); });

  function drawFlow(y, list, f) {
    flowArgs = [y, list, f];
    const sec = document.getElementById('flow');
    const anyStatus = list.some(l => l.oppfolging || f.back(l) > 0);
    if (!list.length || !anyStatus) {
      sec.hidden = false;
      document.getElementById('flow-lead').textContent = f.proposal && !list.some(l => l.oppfolging)
        ? `Tallene for ${y} er kommunedirektørens forslag, og kommunen har ikke rapportert på tiltakene ennå. Diagrammet kommer når tertialrapportene for ${y} gjør det.`
        : `Kommunens rapporter sier ikke noe om tiltakene for ${y} ennå.`;
      ['flow-unit', 'sankey'].forEach(id => { document.getElementById(id).hidden = true; });
      sec.querySelector('details').hidden = true;
      document.getElementById('flow-uten').textContent = '';
      document.getElementById('flow-caption').textContent = '';
      return;
    }
    ['flow-unit', 'sankey'].forEach(id => { document.getElementById(id).hidden = false; });
    sec.querySelector('details').hidden = false;
    sec.hidden = false; // before measuring the width

    // One flow per measure and destination: a partly reversed cut splits between «Tatt ut» and its status.
    const parts = [];
    list.forEach(l => {
      const st = f.status(l), c = f.cut(l), b = f.back(l);
      if (unit === 'antall') { parts.push({ l, from: l.omrade, to: st, v: 1 }); return; }
      if (l.uten_belop) return;
      if (b > 0) parts.push({ l, from: l.omrade, to: 'reversert', v: b });
      if (c - b > 0) parts.push({ l, from: l.omrade, to: st === 'reversert' ? 'ingen' : st, v: c - b });
    });
    const links = [];
    parts.forEach(p => {
      let k = links.find(x => x.from === p.from && x.to === p.to);
      if (!k) links.push(k = { from: p.from, to: p.to, v: 0, items: [] });
      k.v += p.v; k.items.push(p);
    });
    const tot = (key, side) => links.filter(k => k[side] === key).reduce((s, k) => s + k.v, 0);
    const left = T.areas.map(a => ({ key: a.key, name: a.name, kind: 'area', v: tot(a.key, 'from') })).filter(n => n.v > 0).sort((a, b) => b.v - a.v);
    const right = FLOW.map(([key, kind]) => ({ key, name: STATUS[key][0], kind, v: tot(key, 'to') })).filter(n => n.v > 0);
    const total = left.reduce((s, n) => s + n.v, 0);
    const fmtV = v => (unit === 'kr' ? `${mk(v)} mill. kr` : `${v} ${v === 1 ? 'tiltak' : 'tiltak'}`);

    // Layout
    const box = document.getElementById('sankey');
    const W = Math.max(300, box.clientWidth - 24), narrow = W < 560;
    const NW = 10, GAP = 34, MINH = 3;
    const H = Math.max(left.length, right.length) * GAP + (narrow ? 260 : 300);
    const place = (nodes, x) => {
      const free = H - GAP * (nodes.length - 1);
      // Small nodes get a minimum height so they stay visible; the rest share what is left.
      const small = nodes.filter(n => n.v / total * free < MINH);
      const scale = (free - small.length * MINH) / nodes.filter(n => !small.includes(n)).reduce((s, n) => s + n.v, 0);
      let yy = 0;
      nodes.forEach(n => { n.x = x; n.y = yy; n.h = Math.max(MINH, n.v * scale); n.s = n.h / n.v; yy += n.h + GAP; n.out = n.y; n.in = n.y; });
      return yy - GAP;
    };
    const hl = place(left, 0), hr = place(right, W - NW);
    const Ht = Math.max(hl, hr);
    // Centre the shorter column.
    [[left, hl], [right, hr]].forEach(([ns, h]) => ns.forEach(n => { n.y += (Ht - h) / 2; n.out = n.in = n.y; }));
    const L0 = Object.fromEntries(left.map(n => [n.key, n])), R0 = Object.fromEntries(right.map(n => [n.key, n]));
    const ordR = Object.fromEntries(right.map((n, i) => [n.key, i])), ordL = Object.fromEntries(left.map((n, i) => [n.key, i]));
    links.sort((a, b) => ordL[a.from] - ordL[b.from] || ordR[a.to] - ordR[b.to]);
    links.forEach(k => { const s = L0[k.from]; k.h0 = k.v * s.s; k.y0 = s.out; s.out += k.h0; });
    [...links].sort((a, b) => ordR[a.to] - ordR[b.to] || ordL[a.from] - ordL[b.from])
      .forEach(k => { const t = R0[k.to]; k.h1 = k.v * t.s; k.y1 = t.in; t.in += k.h1; });
    const x0 = NW, x1 = W - NW, xm = (x0 + x1) / 2;
    const path = k => `M${x0},${k.y0}C${xm},${k.y0} ${xm},${k.y1} ${x1},${k.y1}L${x1},${k.y1 + k.h1}C${xm},${k.y1 + k.h1} ${xm},${k.y0 + k.h0} ${x0},${k.y0 + k.h0}Z`;
    const kindOf = key => FLOW.find(r => r[0] === key)[1];
    // Labels sit inside the chart. On a narrow screen a left and a right label can meet, so a left label
    // moves into the gap above or below its bar when its middle is taken.
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '500 12.5px "Public Sans", system-ui, sans-serif';
    const tw = n => Math.max(ctx.measureText(n.name).width, ctx.measureText(fmtV(n.v)).width) + 8;
    const taken = right.map(n => ({ cy: n.y + n.h / 2, w: tw(n), side: 'r' }));
    const free = (cy, w) => taken.every(b => Math.abs(b.cy - cy) >= 34 || (b.side === 'r' && w + b.w <= W - 2 * NW - 12));
    left.forEach(n => {
      const w = tw(n), mid = n.y + n.h / 2;
      n.cy = [mid, mid + 16, mid - 16, mid + 30, mid - 30, n.y - 22, n.y + n.h + 20].find(c => free(c, w)) ?? mid;
      taken.push({ cy: n.cy, w, side: 'l' });
    });
    const label = (n, side) => {
      const tx = side === 'l' ? n.x + NW + 6 : n.x - 6, anchor = side === 'l' ? 'start' : 'end', cy = n.cy ?? n.y + n.h / 2;
      return `<text x="${tx}" y="${cy - 3}" text-anchor="${anchor}">${esc(n.name)}<tspan class="v" x="${tx}" dy="15">${esc(fmtV(n.v))}</tspan></text>`;
    };
    const svg = `<svg viewBox="0 ${-14} ${W} ${Math.max(Ht, ...left.map(n => n.cy + 24)) + 28}" role="img" aria-label="${esc(`Innsparingene i budsjettet for ${y} fordelt fra tjenesteområde til status i kommunens rapporter, ${unit === 'kr' ? 'i mill. kr' : 'i antall tiltak'}. Tallene står i tabellen under.`)}">
      ${links.map((k, i) => `<path class="link k-${kindOf(k.to)}" data-i="${i}" d="${path(k)}"/>`).join('')}
      ${left.map(n => `<rect class="node k-area" x="${n.x}" y="${n.y}" width="${NW}" height="${n.h}" rx="2"/>`).join('')}
      ${right.map(n => `<rect class="node k-${n.kind}" x="${n.x}" y="${n.y}" width="${NW}" height="${n.h}" rx="2"/>`).join('')}
      ${left.map(n => label(n, 'l')).join('')}${right.map(n => label(n, 'r')).join('')}</svg>`;
    const tip = document.getElementById('sankey-tip');
    box.querySelector('svg')?.remove();
    box.insertAdjacentHTML('afterbegin', svg);
    const paths = [...box.querySelectorAll('.link')];
    const show = (el, ev) => {
      const k = links[+el.dataset.i];
      paths.forEach(p => p.classList.toggle('on', p === el));
      paths.forEach(p => p.classList.toggle('dim', p !== el));
      const items = k.items.sort((a, b) => b.v - a.v).map(p => `<li>${esc(p.l.navn)}${p.l.uten_belop ? ' (uten beløp)' : unit === 'kr' ? `: ${mk(p.v)} mill. kr` : ''}</li>`).join('');
      tip.innerHTML = `<b>${esc(L0[k.from].name)} → ${esc(R0[k.to].name)}: ${esc(fmtV(k.v))}</b><ul>${items}</ul>`;
      tip.hidden = false;
      const r = box.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(8, px - tw / 2), r.width - tw - 8) + 'px';
      tip.style.top = (py + 16) + 'px';
    };
    const hide = () => { tip.hidden = true; paths.forEach(p => p.classList.remove('on', 'dim')); };
    paths.forEach(p => { p.addEventListener('pointermove', e => show(p, e)); p.addEventListener('pointerleave', hide); p.addEventListener('click', e => show(p, e)); });

    const U = list.filter(l => l.uten_belop);
    const nKr = list.filter(l => !l.uten_belop).length;
    document.getElementById('flow-lead').textContent = unit === 'kr'
      ? `Hver innsparing går fra tjenesteområdet til det kommunens tertial- og årsrapporter sier skjedde med den. Bredden er beløpet for ${y}. Pek eller trykk på en strøm for å se tiltakene.`
      : `Hver innsparing går fra tjenesteområdet til det kommunens tertial- og årsrapporter sier skjedde med den. Bredden er antall tiltak, så kutt uten beløp i budsjettet er med. Pek eller trykk på en strøm for å se tiltakene.`;
    document.getElementById('flow-uten').innerHTML = U.length
      ? (unit === 'kr'
        ? `${U.length === 1 ? 'Ett kutt' : `${U.length} kutt`} står uten beløp i budsjettet og vises bare når du velger «Antall tiltak»: `
        : `${U.length === 1 ? 'Kuttet' : 'Kuttene'} uten beløp i budsjettet: `)
        + U.map(l => `<a href="#t-${l.action_id}-${l.omrade}">${esc(l.navn)}</a> (${esc(STATUS[f.status(l)][0].toLowerCase())})`).join(', ') + '.'
      : '';
    const partly = list.filter(l => f.back(l) > 0 && f.back(l) < f.cut(l));
    document.getElementById('flow-caption').textContent = (unit === 'kr'
      ? `${nKr} tiltak, ${mk(total)} mill. kr for ${y}.` + (partly.length ? ` Der kommunestyret bare tok ut en del av et kutt, er kuttet delt mellom «Tatt ut av kommunestyret» og status for resten.` : '')
      : `${list.length} tiltak. Et tiltak telles én gang, med status fra rapportene. Er det ikke omtalt og kommunestyret tok ut hele kuttet, står det under «Tatt ut av kommunestyret».`)
      + ` «Ingen status i rapportene» betyr at vi ikke har funnet tiltaket omtalt, ikke at kuttet ikke ble gjort. Kilder: beløpene fra Framsikt og statusene fra rapportene, med side, står ved hvert tiltak under.`;
    document.getElementById('flow-table').innerHTML = `<thead><tr><th>Område</th>${right.map(n => `<th>${esc(n.name)}</th>`).join('')}<th>Sum</th></tr></thead><tbody>`
      + left.map(a => `<tr><td>${esc(a.name)}</td>${right.map(r => { const k = links.find(x => x.from === a.key && x.to === r.key); return `<td>${k ? (unit === 'kr' ? mk(k.v) : k.v) : '–'}</td>`; }).join('')}<td>${unit === 'kr' ? mk(a.v) : a.v}</td></tr>`).join('')
      + `<tr class="sum"><td>Sum</td>${right.map(r => `<td>${unit === 'kr' ? mk(r.v) : r.v}</td>`).join('')}<td>${unit === 'kr' ? mk(total) : total}</td></tr></tbody>`;
    sec.hidden = false;
  }

  const draw = y => {
    const src = T.sources[y], L = T.lines.filter(l => l.aar === y);
    const cut = l => (l.uten_belop ? 0 : -l['1000kr'][y]), back = l => Math.min(cut(l), l.reversert?.[y] || 0);
    const status = l => l.oppfolging?.status || (back(l) > 0 && back(l) >= cut(l) ? 'reversert' : 'ingen');
    const S = L.filter(l => l.innsparing && !l.uten_belop), U = L.filter(l => l.uten_belop);
    const sum = (list, f) => list.reduce((s, l) => s + f(l), 0);
    const reported = S.filter(l => l.oppfolging && l.oppfolging.status !== 'ikke-oppgitt');
    const silent = S.filter(l => !reported.includes(l) && status(l) !== 'reversert');
    const kept = l => cut(l) - back(l);
    const proposal = src.status === 'forslag';

    // Summary
    document.getElementById('h-sum').textContent = `Innsparingene i budsjettet for ${y}`;
    document.getElementById('sum-lead').textContent = `${proposal ? 'Kommunedirektørens forslag' : 'Budsjettet kommunestyret vedtok'} for ${y} hadde ${S.length} innsparinger på til sammen ${mk(sum(S, cut))} mill. kr. `
      + (sum(S, back) ? `Kommunestyret tok ut ${mk(sum(S, back))} mill. kr av dem i samme vedtak. ` : '')
      + `For ${mk(sum(silent, kept))} mill. kr av det som sto igjen, har vi ikke funnet noen status i kommunens rapporter.`
      + (U.length ? ` I tillegg ${U.length === 1 ? 'står ett kutt' : `står ${U.length} kutt`} uten beløp i budsjettet.` : '');
    const st = document.getElementById('sum-status');
    st.textContent = proposal ? `Tallene for ${y} er kommunedirektørens forslag. Kommunestyrets endringer i desember finnes ikke på Framsikt, så kutt som ble tatt ut eller endret i vedtaket vises ikke her. Rapportene viser bare enkelte vedtatte beløp.` : '';
    st.hidden = !proposal;
    const stat = (label, v, sub) => `<div class="stat"><span class="eyebrow">${esc(label)}</span><span class="big num">${mk(v)} <small>mill. kr</small></span><span class="sub">${esc(sub)}</span></div>`;
    const done = reported.filter(l => l.oppfolging.status === 'gjennomfort');
    document.getElementById('summary').innerHTML =
      stat(proposal ? 'Foreslåtte kutt' : 'Vedtatte kutt', sum(S, cut), `${S.length} tiltak`)
      + (proposal ? '' : stat('Tatt ut av kommunestyret', sum(S, back), `${S.filter(l => back(l) > 0).length} tiltak, i samme vedtak`))
      + stat('Med status i rapportene', sum(reported, kept), `${reported.length} tiltak, ${done.length} av dem meldt gjennomført`)
      + stat('Uten status i rapportene', sum(silent, kept), `${silent.length} tiltak`);
    document.getElementById('sum-caption').innerHTML = `Mill. kr for ${y}, første år i økonomiplanen. Kilde: ${link(src.page_url, src.name)}, siden «Endring driftsbudsjett». Statusene er skrevet inn fra tertialrapport 2 og årsrapporten, med side.`;
    document.getElementById('sum').hidden = false;

    drawFlow(y, [...S, ...U], { cut, back, status, proposal });

    // Measure by measure, per area
    const card = (l, kind) => {
      const s = kind === 'fix' ? null : status(l), [label, tone] = s ? STATUS[s] : [];
      const amt = kind === 'fix' ? `+${mk(l['1000kr'][y])}` : l.uten_belop ? 'Uten beløp' : `−${mk(cut(l))}`;
      const plan = Object.entries(l['1000kr']).map(([yy, v]) => `${yy}: ${signed(v)}`).join(' · ');
      const notes = (l.oppfolging?.notater || []).map(n => `<li>${esc(n.tekst)} <span class="caption">Kilde: ${cite(n.kilde)}</span></li>`).join('');
      const rev = back(l) > 0 && kind !== 'fix'
        ? `<p>Kommunestyret tok ut ${back(l) >= cut(l) ? 'hele kuttet' : `${mk(back(l))} mill. kr av kuttet`} i budsjettvedtaket.</p>` : '';
      return `<li class="fact tiltak${tone ? ' t-' + tone : ''}" id="t-${l.action_id}-${l.omrade}">
        <div class="tiltak-top"><p class="tiltak-name">${esc(l.navn)}</p><span class="num tiltak-amt">${amt}</span></div>
        <p class="tiltak-meta"><span class="eyebrow">${esc(l.kode || 'Uten kode')} · ${esc(T.kategorier[l.kategori])}${kind === 'fix' ? ' · ' + esc(areaName[l.omrade]) : ''}</span>${label ? `<span class="badge${tone ? ' ' + tone : ''}">${esc(label)}</span>` : ''}</p>
        ${kind === 'fix' ? `<p>${esc(l.korreksjon)}</p>` : ''}${rev}
        ${notes ? `<ul class="tiltak-notes">${notes}</ul>` : ''}
        <details><summary>Beskrivelse i Framsikt</summary><p>${l.beskrivelse ? esc(l.beskrivelse) : 'Framsikt har ingen beskrivelse av tiltaket.'}</p><p class="caption">Beløp i økonomiplanen, mill. kr: ${plan}</p></details>
        ${kind === 'fix' ? `<p class="caption fact-src">Kilde: ${framsikt(l, y)}</p>` : ''}</li>`;
    };
    const areaNotes = T.omradenotater.filter(n => n.budsjett === y);
    // Largest cuts first, so the areas that carry the savings come before the small shares of the structural cut.
    const byCut = [...T.areas].sort((a, b) => sum(S.filter(l => l.omrade === b.key), cut) - sum(S.filter(l => l.omrade === a.key), cut));
    const groups = byCut.map(a => {
      const list = [...S, ...U].filter(l => l.omrade === a.key).sort((p, q) => cut(q) - cut(p));
      const notes = areaNotes.filter(n => n.omrade === a.key);
      if (!list.length && !notes.length) return '';
      return `<div class="fact-group" id="o-${a.key}"><h3>${esc(a.name)} <span class="caption">· ${mk(sum(list, cut))} mill. kr i kutt</span></h3>`
        + notes.map(n => `<p class="status-note">${esc(n.tekst)} <span class="caption">Kilde: ${cite(n.kilde)}</span></p>`).join('')
        + `<ul class="fact-list">${list.map(l => card(l)).join('')}</ul>`
        + (list.length ? `<p class="caption">Kilde for beløpene og beskrivelsene: ${areaSrc(list, y)}.</p>` : '') + '</div>';
    }).join('');
    document.getElementById('area-list').innerHTML = groups;
    document.getElementById('areas').hidden = !groups;

    // Money put back in a later budget for earlier cuts that didn't work
    const F = L.filter(l => l.korreksjon);
    document.getElementById('fix-list').innerHTML = F.map(l => card(l, 'fix')).join('');
    document.getElementById('fix-lead').textContent = `I budsjettet for ${y} ble ${mk(sum(F, l => l['1000kr'][y]))} mill. kr lagt inn igjen fordi tidligere vedtatte kutt ikke ga full effekt. Dette er linjene der navnet eller beskrivelsen sier det.`;
    document.getElementById('fix').hidden = !F.length;

    // Every change to every area's frame, as Framsikt lists it
    document.getElementById('h-bridge').textContent = `Hele endringen i rammene for ${y}`;
    document.getElementById('bridge-lead').textContent = `Alle linjene Framsikt bruker for å forklare hvordan rammen til hvert tjenesteområde endret seg fra ${+y - 1} til ${y}. Positive tall er penger lagt til, negative er penger tatt ut. Innsparingene over er markert.`;
    document.getElementById('bridge-list').innerHTML = T.areas.map(a => {
      const list = L.filter(l => l.omrade === a.key);
      if (!list.length) return '';
      const cats = [...new Set(list.map(l => l.kategori))].map(c => ({ c, rows: list.filter(l => l.kategori === c) }))
        .map(g => ({ ...g, total: sum(g.rows, l => l['1000kr'][y]) })).sort((p, q) => Math.abs(q.total) - Math.abs(p.total));
      const rows = cats.map(g => `<tr class="sum"><td>${esc(T.kategorier[g.c])}</td><td></td><td>${signed(g.total)}</td></tr>`
        + g.rows.sort((p, q) => p['1000kr'][y] - q['1000kr'][y]).map(l => `<tr${l.innsparing ? ' class="sel"' : ''}><td>${esc(l.navn)}${l.innsparing ? ' <span class="badge">Innsparing</span>' : ''}</td><td class="code">${esc(l.kode || '')}</td><td>${signed(l['1000kr'][y])}</td></tr>`).join('')).join('');
      return `<details class="all-numbers"><summary>${esc(a.name)}: ${signed(sum(list, l => l['1000kr'][y]))} mill. kr netto</summary>
        <div class="detail-scroll"><table class="num-table"><thead><tr><th>Tiltak</th><th class="code">Kode</th><th>Mill. kr ${y}</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
    }).join('');
    document.getElementById('bridge').hidden = false;
  };

  let y = years.includes(urlYear()) ? urlYear() : years.find(v => T.sources[v].status === 'vedtatt') || years.at(-1);
  const yearsEl = document.getElementById('years');
  years.forEach(v => {
    const b = el('button', { role: 'radio', type: 'button', 'aria-checked': String(v === y) }, v);
    b.title = T.sources[v].status === 'forslag' ? 'Kommunedirektørens forslag' : 'Vedtatt budsjett';
    b.addEventListener('click', () => {
      y = v;
      yearsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x.textContent === y)));
      try { history.replaceState(null, '', '?aar=' + y); } catch (e) {}
      draw(y);
    });
    yearsEl.appendChild(b);
  });
  yearsEl.hidden = false;
  draw(y);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

startTiltak();
