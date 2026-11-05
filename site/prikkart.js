// Prikkart on befolkning.html: SSB's population per 250 m grid cell (data/prikkart.json, from scripts/fetch_prikkart.py)
// on a base map from Kartverket's N50 (data/prikkart-kart.json, from scripts/build_prikkart_kart.py).
// One dot per cell where someone lives, the dot's area follows the number of residents. Helpers are in common.js.

async function startDotMap() {
  let D, K, B;
  try {
    [D, K, B] = await Promise.all(['prikkart', 'prikkart-kart', 'befolkning'].map(async f => {
      const res = await fetch(`data/${f}.json`);
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }));
  } catch (e) { return; }

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('dm-map'), info = document.getElementById('dm-info');
  const s = (tag, attrs, parent, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  };
  const names = Object.fromEntries(B.areas.rows.map(r => [r.code, r.name]));
  // SSB calls the delområde Tysfjord Nord; on the map it is the place people know, Kjøpsvik.
  const LABEL = { '180616': 'Kjøpsvik' };
  const nameOf = c => LABEL[c] || names[c] || c;
  // The delområder that make up Narvik by.
  const TOWN = new Set(['180603', '180604', '180605', '180606', '180607', '180608', '180609', '180610', '180612']);
  // Places named in the whole-kommune view; the town gets one label for all its delområder.
  // In order of priority: where labels would overlap (on a phone), the later ones are left out.
  const PLACES = ['180601', '180615', '180616', '180614', '180611', '180602', '180613'];
  const VIEWS = { alle: 'Hele kommunen', by: 'Narvik by' };
  const years = D.years, cells = D.cells;
  const state = { view: 'alle', yi: years.length - 1 };
  const maxPop = Math.max(...cells.map(c => Math.max(c[2], c[3])));

  // Extent of the inhabited cells in a view, in cell units, with a margin.
  const extent = view => {
    const cs = cells.filter(c => view === 'alle' || TOWN.has(c[4]));
    const pad = view === 'alle' ? 6 : 3;
    return [Math.min(...cs.map(c => c[0])) - pad, Math.min(...cs.map(c => c[1])) - pad,
      Math.max(...cs.map(c => c[0])) + 1 + pad, Math.max(...cs.map(c => c[1])) + 1 + pad];
  };
  // Dot radius in pixels: the area is proportional to the residents, the same scale in both years.
  const rmax = (view, ppu) => view === 'alle' ? 8 : Math.min(18, Math.max(8, ppu * 1.1));
  const radius = (v, R) => Math.max(1.2, Math.sqrt(v / maxPop) * R);

  const seg = (id, items, current, pick) => {
    const box = document.getElementById(id);
    box.replaceChildren(...items.map(([v, text]) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(v === current) }, text);
      b.addEventListener('click', () => {
        box.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        pick(v);
      });
      return b;
    }));
  };
  seg('dm-view', Object.entries(VIEWS), state.view, v => { state.view = v; draw(); });
  seg('dm-year', years.map((y, i) => [i, String(y)]), state.yi, v => { state.yi = v; draw(); });

  const intro = () => `Pek på eller trykk en prikk for å se hvor mange som bodde i ruten 1. januar ${years[state.yi]}.`;
  let shown = [], hit = null, lastWidth = 0;

  function draw() {
    const [x0, y0, x1, y1] = extent(state.view), W = x1 - x0, H = y1 - y0;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-label', `Kart over ${state.view === 'alle' ? 'Narvik kommune' : 'Narvik by'} med én prikk for hver rute på 250 × 250 meter der noen bodde 1. januar ${years[state.yi]}.`);
    svg.replaceChildren();
    const box = svg.getBoundingClientRect();
    lastWidth = box.width;
    const ppu = Math.min(box.width / W, (box.height || box.width * H / W) / H) || 2;  // pixels per cell
    const px = n => n / ppu;                                                            // pixels → cell units
    const X = x => +(x - x0).toFixed(2), Y = y => +(y1 - y).toFixed(2);
    const ring = r => 'M' + r.map(p => X(p[0]) + ' ' + Y(p[1])).join('L') + 'Z';
    const line = l => 'M' + l.map(p => X(p[0]) + ' ' + Y(p[1])).join('L');

    const base = s('g', {}, svg);
    s('path', { class: 'dm-land', d: K.kommune.map(p => p.map(ring).join('')).join('') }, base);
    s('path', { class: 'dm-town', d: K.town.map(p => p.map(ring).join('')).join('') }, base);
    s('path', { class: 'dm-water', d: K.water.map(p => p.map(ring).join('')).join('') }, base);
    s('path', { class: 'dm-del', d: Object.values(K.del).flatMap(d => d.map(p => ring(p[0]))).join(''), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, base);
    s('path', { class: 'dm-rail', d: K.rail.map(line).join(''), 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, base);
    s('path', { class: 'dm-road', d: K.roads.map(line).join(''), 'stroke-width': state.view === 'alle' ? 1.5 : 2.5, 'vector-effect': 'non-scaling-stroke' }, base);

    // Dots, biggest first so the small ones stay on top and can be reached.
    const R = rmax(state.view, ppu), k = 2 + state.yi;
    const dots = s('g', { class: 'dm-dots' }, svg);
    shown = cells.filter(c => c[k] > 0).sort((a, b) => b[k] - a[k]).map(c => {
      const r = px(radius(c[k], R));
      const node = s('circle', { cx: X(c[0] + 0.5), cy: Y(c[1] + 0.5), r: +r.toFixed(2), 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke' }, dots);
      return { c, node, x: c[0] + 0.5, y: c[1] + 0.5, r };
    });
    hit = null;

    // Labels at the population-weighted centre of each place, a little above it.
    const fs = px(13), labels = s('g', { class: 'dm-labels', style: `font-size:${fs}px;stroke-width:${px(3.5)}px` }, svg);
    const centre = test => {
      let x = 0, y = 0, n = 0;
      cells.forEach(c => { const v = c[3] || c[2]; if (v && test(c[4])) { x += (c[0] + 0.5) * v; y += (c[1] + 0.5) * v; n += v; } });
      return n ? [x / n, y / n] : null;
    };
    const places = state.view === 'alle'
      ? [['Narvik by', code => TOWN.has(code)], ...PLACES.map(code => [nameOf(code), c => c === code])]
      : [...TOWN].map(code => [nameOf(code), c => c === code]);
    const placed = [];
    places.forEach(([name, test]) => {
      const p = centre(test);
      if (!p) return;
      const t = s('text', { x: X(p[0]), y: Y(p[1]) - fs * 0.9, 'text-anchor': 'middle' }, labels, name);
      const b = t.getBBox();
      if (placed.some(o => b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height)) t.remove();
      else placed.push(b);
    });

    // Scale bar, bottom left. One cell is 250 m.
    const km = state.view === 'alle' ? 10 : 1, len = km * 1000 / K.cell, sx = px(14), sy = H - px(12);
    const sc = s('g', { class: 'dm-scale', style: `font-size:${px(12)}px;stroke-width:${px(3)}px` }, svg);
    s('line', { x1: sx, x2: sx + len, y1: sy, y2: sy, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, sc);
    s('text', { x: sx, y: sy - px(5) }, sc, `${km} km`);

    // Legend with dots on the same scale as the map.
    const sizes = [10, 100, Math.floor(maxPop / 100) * 100];
    const key = (attrs, text) => { const sp = el('span'); sp.append(el('i', attrs), text); return sp; };
    document.getElementById('dm-legend').replaceChildren(
      ...sizes.map(v => { const d = (2 * radius(v, R)).toFixed(1); return key({ style: `width:${d}px;height:${d}px` }, `${nb(v)} innbyggere`); }),
      key({ class: 'dm-key-town' }, 'Tettsted'),
      key({ class: 'dm-key-road' }, 'Europa- og riksvei'));
    info.textContent = intro();
  }

  // Pointer: the nearest dot within reach, so small dots can be tapped on a phone.
  const pick = ev => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    const [x0, , , y1] = extent(state.view);
    const ppu = m.a, reach = 12 / ppu;
    // Inside a dot: the one drawn on top (the smallest). Otherwise the nearest dot edge within reach.
    let best = null, bestD = Infinity;
    for (const d of shown) {
      const dist = Math.hypot(d.x - x0 - p.x, y1 - d.y - p.y), gap = Math.max(0, dist - d.r);
      if (gap <= reach && gap <= bestD) { best = d; bestD = gap; }
    }
    if (hit) hit.node.classList.remove('on');
    hit = best;
    if (!best) { info.textContent = intro(); return; }
    best.node.classList.add('on');
    best.node.parentNode.appendChild(best.node);
    const c = best.c, y = years[state.yi], other = state.yi ? 0 : years.length - 1, v = c[2 + state.yi], o = c[2 + other];
    info.textContent = `${nameOf(c[4])}: ${nb(v)} ${v === 1 ? 'innbygger' : 'innbyggere'} i denne ruten på 250 × 250 meter 1. januar ${y} ` +
      `(${o ? nb(o) : 'ingen'} i ${years[other]}).`;
  };
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { if (hit) hit.node.classList.remove('on'); hit = null; info.textContent = intro(); } });

  // Sources.
  const last = years[years.length - 1], sum = D.sum[D.sum.length - 1], folketall = B.areas.last == last ? B.areas.total.pop[last] : null;
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  document.getElementById('dm-caption').replaceChildren(
    'Kilde: ', link(D.source.url, 'SSB, befolkning på rutenett 250 m'), `, 1. januar ${years.join(' og ')}. `,
    `Rutene i kommunen summerer til ${nb(sum)} innbyggere i ${last}` +
    (folketall ? `, mens SSBs folketall er ${nb(folketall)}, fordi noen ikke har en adresse som kan plasseres på kartet. ` : '. ') +
    'Kart: Kartverket, ', link(K.kilder.n50, 'N50 Kartdata'), ' (sjø, vann, tettsteder, veier og jernbane) og ',
    link(K.kilder.grunnkretser, 'grunnkretser'), ' (stiplede grenser mellom SSBs delområder), CC BY 4.0. ' +
    'Delområdet SSB kaller Tysfjord Nord, er merket Kjøpsvik på kartet.');

  document.getElementById('dm').hidden = false;
  draw();
  new ResizeObserver(() => { if (Math.abs(svg.getBoundingClientRect().width - lastWidth) > 4) draw(); }).observe(svg);
}
startDotMap();
