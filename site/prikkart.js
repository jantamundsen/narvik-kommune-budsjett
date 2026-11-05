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
  // Dot radius in pixels: the area is proportional to the residents, the same scale in both years. The largest
  // dot grows as you zoom in, up to 18 pixels.
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
  seg('dm-year', years.map((y, i) => [i, String(y)]), state.yi, v => { state.yi = v; redraw(); });

  const intro = () => `Pek på eller trykk en prikk for å se hvor mange som bodde i ruten 1. januar ${years[state.yi]}. ` +
    'Zoom med knappene, dobbeltklikk, Ctrl og musehjulet eller to fingre, og dra for å flytte kartet.';
  const box = document.querySelector('#dm .dm-box'), scaleEl = document.getElementById('dm-scale');

  // Map coordinates are cell units with y flipped, so north is up: (x, -y). The frame is the selected view; it
  // sets the map's shape. vb is the part of the map in view, with the frame's shape, smaller when zoomed in.
  let frame, vb, shown = [], hit = null, lastWidth = 0;
  const ALL = extent('alle');
  const MIN_W = 10;  // cells, about 2.5 km across
  const zoomed = () => vb.w < frame[2] - frame[0] - 0.01;
  const ppu = () => (svg.getBoundingClientRect().width || 300) / vb.w;  // pixels per cell
  const setView = view => {
    frame = extent(view);
    vb = { x: frame[0], y: -frame[3], w: frame[2] - frame[0], h: frame[3] - frame[1] };
  };
  // Keep the view inside the whole kommune, and never wider than the frame.
  const clamp = () => {
    const fw = frame[2] - frame[0], fh = frame[3] - frame[1];
    const w = Math.min(fw, Math.max(MIN_W, vb.w)), h = w * fh / fw;
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    const bx0 = Math.min(ALL[0], frame[0]), bx1 = Math.max(ALL[2], frame[2]), by0 = -Math.max(ALL[3], frame[3]), by1 = -Math.min(ALL[1], frame[1]);
    const x = Math.min(Math.max(cx - w / 2, bx0), bx1 - w), y = Math.min(Math.max(cy - h / 2, by0), by1 - h);
    vb = { x, y, w, h };
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x.toFixed(3)} ${vb.y.toFixed(3)} ${vb.w.toFixed(3)} ${vb.h.toFixed(3)}`);
    svg.style.touchAction = zoomed() ? 'none' : 'pan-y';
    document.getElementById('dm-out').disabled = !zoomed();
    document.getElementById('dm-reset').disabled = !zoomed();
    document.getElementById('dm-in').disabled = vb.w <= MIN_W + 0.01;
  };
  // Zoom by a factor around a point in map coordinates (the centre when none is given).
  const zoomAt = (f, mx = vb.x + vb.w / 2, my = vb.y + vb.h / 2) => {
    const w = vb.w / f, h = vb.h / f;
    vb = { x: mx - (mx - vb.x) * (w / vb.w), y: my - (my - vb.y) * (h / vb.h), w, h };
    clamp(); apply(); redraw();
  };
  const toMap = (cx, cy) => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(m.inverse());
  };

  // The base map is drawn once; the dots, labels, scale and legend follow the zoom.
  const P = p => p[0] + ' ' + (-p[1]);
  const ring = r => 'M' + r.map(P).join('L') + 'Z';
  const line = l => 'M' + l.map(P).join('L');
  const base = s('g', {}, svg);
  s('path', { class: 'dm-land', d: K.kommune.map(p => p.map(ring).join('')).join('') }, base);
  s('path', { class: 'dm-town', d: K.town.map(p => p.map(ring).join('')).join('') }, base);
  s('path', { class: 'dm-water', d: K.water.map(p => p.map(ring).join('')).join('') }, base);
  s('path', { class: 'dm-del', d: Object.values(K.del).flatMap(d => d.map(p => ring(p[0]))).join(''), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, base);
  s('path', { class: 'dm-rail', d: K.rail.map(line).join(''), 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, base);
  const roads = s('path', { class: 'dm-road', d: K.roads.map(line).join(''), 'vector-effect': 'non-scaling-stroke' }, base);
  const dots = s('g', { class: 'dm-dots' }, svg);
  const mark = s('circle', { class: 'dm-mark', r: 0, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, svg);
  const labels = s('g', { class: 'dm-labels' }, svg);

  const centre = test => {
    let x = 0, y = 0, n = 0;
    cells.forEach(c => { const v = c[3] || c[2]; if (v && test(c[4])) { x += (c[0] + 0.5) * v; y += (c[1] + 0.5) * v; n += v; } });
    return n ? [x / n, y / n] : null;
  };
  const OVERVIEW = [['Narvik by', code => TOWN.has(code)], ...PLACES.map(code => [nameOf(code), c => c === code])];
  const DETAIL = [...TOWN, ...PLACES].map(code => [nameOf(code), c => c === code]);

  let pending = false;
  function redraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; drawLayers(); });
  }
  function drawLayers() {
    const k = ppu(), px = n => n / k, R = Math.min(18, Math.max(8, k * 1.1)), yi = 2 + state.yi;
    lastWidth = svg.getBoundingClientRect().width;
    roads.setAttribute('stroke-width', k < 5 ? 1.5 : 2.5);
    svg.setAttribute('aria-label', `Kart over ${state.view === 'alle' ? 'Narvik kommune' : 'Narvik by'} med én prikk for hver rute på 250 × 250 meter der noen bodde 1. januar ${years[state.yi]}.`);

    // Dots, biggest first so the small ones stay on top and can be reached.
    dots.replaceChildren();
    shown = cells.filter(c => c[yi] > 0).sort((a, b) => b[yi] - a[yi]).map(c => {
      const r = px(radius(c[yi], R)), x = c[0] + 0.5, y = -(c[1] + 0.5);
      s('circle', { cx: x, cy: y, r: +r.toFixed(3), 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke' }, dots);
      return { c, x, y, r };
    });
    hit = null;
    showMark();

    // Labels at the population-weighted centre of each place, a little above it. Zoomed out, the town is one
    // label; zoomed in, each delområde has its own. Where labels would overlap, the later ones are left out.
    const fs = px(13);
    labels.setAttribute('style', `font-size:${fs}px;stroke-width:${px(3.5)}px`);
    labels.replaceChildren();
    const placed = [];
    (k < 6 ? OVERVIEW : DETAIL).forEach(([name, test]) => {
      const p = centre(test);
      if (!p || p[0] < vb.x || p[0] > vb.x + vb.w || -p[1] < vb.y || -p[1] > vb.y + vb.h) return;
      const t = s('text', { x: p[0], y: -p[1] - fs * 0.9, 'text-anchor': 'middle' }, labels, name);
      const b = t.getBBox();
      if (placed.some(o => b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height)) t.remove();
      else placed.push(b);
    });

    // Scale bar, about 60–150 pixels long. One cell is 250 m.
    const km = [0.5, 1, 2, 5, 10, 20].find(v => v * 1000 / K.cell * k >= 60) || 20;
    scaleEl.style.width = `${km * 1000 / K.cell * k}px`;
    scaleEl.textContent = km < 1 ? `${km * 1000} m` : `${nb(km)} km`;

    // Legend with dots on the same scale as the map.
    const sizes = [10, 100, Math.floor(maxPop / 100) * 100];
    const key = (attrs, text) => { const sp = el('span'); sp.append(el('i', attrs), text); return sp; };
    document.getElementById('dm-legend').replaceChildren(
      ...sizes.map(v => { const d = (2 * radius(v, R)).toFixed(1); return key({ style: `width:${d}px;height:${d}px` }, `${nb(v)} innbyggere`); }),
      key({ class: 'dm-key-town' }, 'Tettsted'),
      key({ class: 'dm-key-road' }, 'Europa- og riksvei'));
    info.textContent = intro();
  }
  function draw() { setView(state.view); apply(); drawLayers(); }

  // The picked dot is drawn again on top, so the dots under the pointer stay put (a double click needs that).
  const showMark = () => {
    mark.setAttribute('r', hit ? hit.r : 0);
    if (hit) { mark.setAttribute('cx', hit.x); mark.setAttribute('cy', hit.y); }
  };

  // The nearest dot within reach, so small dots can be tapped on a phone.
  const pick = (cx, cy) => {
    const p = toMap(cx, cy);
    if (!p) return;
    const reach = 12 / ppu();
    // Inside a dot: the one drawn on top (the smallest). Otherwise the nearest dot edge within reach.
    let best = null, bestD = Infinity;
    for (const d of shown) {
      const gap = Math.max(0, Math.hypot(d.x - p.x, d.y - p.y) - d.r);
      if (gap <= reach && gap <= bestD) { best = d; bestD = gap; }
    }
    hit = best;
    showMark();
    if (!best) { info.textContent = intro(); return; }
    const c = best.c, y = years[state.yi], other = state.yi ? 0 : years.length - 1, v = c[2 + state.yi], o = c[2 + other];
    info.textContent = `${nameOf(c[4])}: ${nb(v)} ${v === 1 ? 'innbygger' : 'innbyggere'} i denne ruten på 250 × 250 meter 1. januar ${y} ` +
      `(${o ? nb(o) : 'ingen'} i ${years[other]}).`;
  };

  // Pointers: one drags the map when zoomed in (or with the mouse), two pinch to zoom; a tap or a still click picks a dot.
  const down = new Map();
  let start = null, pinch = null;
  svg.addEventListener('pointerdown', ev => {
    down.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (down.size === 1) start = { x: ev.clientX, y: ev.clientY, vb: { ...vb }, moved: false };
    if (down.size === 2) {
      const [a, b] = [...down.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w };
      start = null;
    }
    if (ev.pointerType !== 'mouse' || zoomed()) svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', ev => {
    if (!down.has(ev.pointerId)) { if (ev.pointerType === 'mouse') pick(ev.clientX, ev.clientY); return; }
    down.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && down.size === 2) {
      const [a, b] = [...down.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (d > 0 && m) zoomAt(vb.w / (pinch.w * pinch.d / d), m.x, m.y);
      return;
    }
    if (!start) return;
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (Math.hypot(dx, dy) > 5) start.moved = true;
    if (start.moved && zoomed()) {
      const k = ppu();
      vb = { ...start.vb, x: start.vb.x - dx / k, y: start.vb.y - dy / k };
      clamp(); apply();
      svg.classList.add('dragging');
    }
  });
  const up = ev => {
    if (!down.has(ev.pointerId)) return;
    down.delete(ev.pointerId);
    if (start && !start.moved && ev.type === 'pointerup') pick(ev.clientX, ev.clientY);
    if (start && start.moved) redraw();
    if (down.size < 2) pinch = null;
    if (!down.size) { start = null; svg.classList.remove('dragging'); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', ev => {
    if (ev.pointerType === 'mouse' && !down.size) { hit = null; showMark(); info.textContent = intro(); }
  });
  svg.addEventListener('dblclick', ev => { const p = toMap(ev.clientX, ev.clientY); if (p) zoomAt(2, p.x, p.y); });
  // The mouse wheel scrolls the page; with Ctrl (or a trackpad pinch, which sends Ctrl) it zooms the map.
  svg.addEventListener('wheel', ev => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const p = toMap(ev.clientX, ev.clientY);
    if (p) zoomAt(Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.002)), p.x, p.y);
  }, { passive: false });
  document.getElementById('dm-in').addEventListener('click', () => zoomAt(2));
  document.getElementById('dm-out').addEventListener('click', () => zoomAt(0.5));
  document.getElementById('dm-reset').addEventListener('click', () => { setView(state.view); apply(); redraw(); });

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
  new ResizeObserver(() => { if (Math.abs(svg.getBoundingClientRect().width - lastWidth) > 4) redraw(); }).observe(svg);
}
startDotMap();
