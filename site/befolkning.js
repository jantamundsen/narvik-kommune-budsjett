// Befolkning: renders site/data/befolkning.json (written by scripts/fetch_befolkning.py) on befolkning.html. Helpers are in common.js.

// On narrow screens each row becomes a card: the first cell is its title
// and the others carry their column heading in data-label.
function stackable(table) {
  const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent);
  table.classList.add('stack');
  table.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
    if (i && heads[i]) td.dataset.label = heads[i];
    if (i && !td.textContent) td.classList.add('empty');
  }));
  return table;
}

async function startPopulation() {
  let B;
  try {
    const res = await fetch('data/befolkning.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    B = await res.json();
  } catch (e) {
    document.getElementById('lead').innerHTML = 'Fant ikke data/befolkning.json. Kjør <code>python scripts/fetch_befolkning.py</code> og åpne siden via en webserver.';
    return;
  }
  const S = B.sources, last = B.last, P = B.pyramid, years = Object.keys(P).sort();
  const sum = a => a.reduce((s, v) => s + v, 0);
  const total = y => sum(P[y].f) + sum(P[y].m);
  const pc = v => nb(v, 1) + ' %';
  const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + nb(Math.abs(v), d);
  const query = key => S[key].query + '&outputFormat=html';
  const src = (key, text) => el('a', { href: query(key), target: '_blank', rel: 'noopener', title: `Spørringen i SSBs tabell ${key}` }, text || `SSB ${key}`);
  const caption = (id, ...parts) => document.getElementById(id).replaceChildren(...parts);
  const tag = () => el('span', { class: 'tag' }, 'beregnet');
  const narvik = B.compare.rows.find(r => r.key === 'narvik'), landet = B.compare.rows.find(r => r.key === 'landet');
  const C = B.change, first = B.compare.first;
  const now = total(last), then = total(first);

  document.getElementById('lead').textContent =
    `${nb(now)} bodde i Narvik 1. januar ${last}, ${nb(Math.abs(now - then))} ${now < then ? 'færre' : 'flere'} enn i ${first}. ` +
    `Medianalderen er ${narvik.median} år, mot ${landet.median} i landet uten Oslo.`;

  // Key numbers.
  const stat = (label, big, sub, extra) => {
    const s = el('div', { class: 'stat' });
    s.append(el('div', { class: 'eyebrow' }, label), el('div', { class: 'big num' }, big));
    if (extra) s.append(extra);
    s.append(sub);
    return s;
  };
  const sub = (...parts) => { const d = el('div', { class: 'sub' }); d.append(...parts); return d; };
  const lastYear = Object.keys(C).filter(y => C[y].born != null).sort().at(-1);
  const L = C[lastYear], women = sum(P[last].f), men = sum(P[last].m);
  const born = Object.keys(C).filter(y => C[y].born != null).sort();
  const maxBorn = Math.max(...born.map(y => C[y].born));
  const bars = el('div', { class: 'mini-bars', role: 'img', 'aria-label': 'Fødte per år: ' + born.map(y => `${y} ${C[y].born}`).join(', ') });
  born.forEach(y => { const s = el('span'); s.append(el('i', { style: `height:${C[y].born / maxBorn * 28}px` }), String(y).slice(2)); bars.append(s); });
  document.getElementById('summary').replaceChildren(
    stat(`Innbyggere 1.1.${last}`, nb(now), sub(`${nb(women)} kvinner, ${nb(men)} menn`)),
    stat(`Endring i ${lastYear}`, signed(L.growth), sub(`Fødte minus døde ${signed(L.born - L.died)}, flytting ${signed(L.moved_in - L.moved_out)}`)),
    stat('Medianalder', `${narvik.median} år`, sub(`Landet uten Oslo: ${landet.median} år `, tag())),
    stat('Over 80 år', pc(narvik.over80), sub(`Landet uten Oslo: ${pc(landet.over80)}`)),
    stat('Menn per 100 kvinner, 20–39 år', String(narvik.men_per_100_women), sub(`Landet uten Oslo: ${landet.men_per_100_women} `, tag())),
    stat(`Fødte i ${lastYear}`, nb(L.born), sub(L.born === maxBorn ? `Flest siden ${born[0]}` : `${born[0]}–${lastYear}`), bars),
  );

  // Population pyramid, one year at a time.
  const pyr = document.getElementById('pyr'), range = document.getElementById('pyr-range'), play = document.getElementById('pyr-play');
  const maxN = Math.max(...years.flatMap(y => [...P[y].f, ...P[y].m])) * 1.1;
  const lastProj = years.at(-1);
  document.getElementById('pyr-lead').textContent =
    `Antall innbyggere per femårs aldersgruppe 1. januar, kvinner til venstre og menn til høyre. Dra i slideren for å se hvordan pyramiden endrer seg fra ${years[0]} til ${lastProj}. Fra ${+last + 1} er tallene SSBs framskriving.`;
  range.min = years[0]; range.max = lastProj;
  const tickAt = y => ((y - years[0]) / (lastProj - years[0]) * 100).toFixed(1) + '%';
  const ticks = [[years[0], ''], [last, 'now'], ...['2040'].filter(y => P[y]).map(y => [y, '']), [lastProj, '']];
  document.getElementById('pyr-ticks').replaceChildren(...ticks.map(([y, c]) =>
    el('span', { style: `left:${tickAt(y)}`, class: c }, c === 'now' ? `${y} · i dag` : y)));
  const head = el('div', { class: 'pyr-row head' });
  const hf = el('span', { class: 'f' }), hm = el('span', { class: 'm' });
  head.append(hf, el('span'), hm);
  const rows = B.groups.map((g, i) => {
    const r = el('div', { class: 'pyr-row' });
    const f = el('div', { class: 'pyr-side f' }), m = el('div', { class: 'pyr-side m' });
    f.append(el('i'), el('span')); m.append(el('i'), el('span'));
    r.append(f, el('span', { class: 'pyr-age' }, g), m);
    return { r, f, m, i };
  });
  pyr.replaceChildren(head, ...rows.slice().reverse().map(x => x.r));
  pyr.setAttribute('role', 'img');
  const show = y => {
    const D = P[y], proj = D.projected;
    document.getElementById('pyr-year').textContent = y;
    const kind = document.getElementById('pyr-kind');
    kind.textContent = proj ? 'framskrevet' : 'registrert';
    kind.className = 'pyr-kind' + (proj ? ' proj' : '');
    document.getElementById('pyr-total').replaceChildren('Totalt ', el('b', {}, nb(total(y))), ' innbyggere');
    hf.textContent = `Kvinner ${nb(sum(D.f))}`; hm.textContent = `Menn ${nb(sum(D.m))}`;
    pyr.classList.toggle('proj', proj);
    pyr.setAttribute('aria-label', `Befolkningspyramide ${y}${proj ? ', framskrevet' : ''}: ` + B.groups.map((g, i) => `${g} år ${D.f[i]} kvinner og ${D.m[i]} menn`).join(', '));
    rows.forEach(({ f, m, i }) => {
      f.firstChild.style.width = (D.f[i] / maxN * 100).toFixed(1) + '%'; f.lastChild.textContent = nb(D.f[i]);
      m.firstChild.style.width = (D.m[i] / maxN * 100).toFixed(1) + '%'; m.lastChild.textContent = nb(D.m[i]);
    });
    range.value = y;
    range.setAttribute('aria-valuetext', `${y}${proj ? ', framskrevet' : ''}`);
  };
  // ?aar= picks the year, like the other pages, so a year can be shared.
  const setYear = y => {
    show(y);
    const u = new URL(location.href);
    if (y === last) u.searchParams.delete('aar'); else u.searchParams.set('aar', y);
    history.replaceState(null, '', u);
  };
  const playIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>';
  const pauseIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/></svg>';
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; play.innerHTML = playIcon; play.setAttribute('aria-label', 'Spill av årene'); };
  play.innerHTML = playIcon;
  play.addEventListener('click', () => {
    if (timer) return stop();
    if (range.value === lastProj) setYear(years[0]);
    play.innerHTML = pauseIcon; play.setAttribute('aria-label', 'Pause');
    timer = setInterval(() => {
      const i = years.indexOf(range.value) + 1;
      if (i >= years.length) return stop();
      setYear(years[i]);
      if (i === years.length - 1) stop();
    }, 600);
  });
  range.addEventListener('input', () => { stop(); setYear(range.value); });
  show(P[urlYear()] ? urlYear() : last);
  const fc = S['14746'];
  caption('pyr-caption', `${years[0]}–${last}: `, src('07459'), ` (registrert). ${+last + 1}–${lastProj}: `, src('14746'), `, hovedalternativet. Lysere stolper betyr framskrevet.`);
  document.getElementById('pyramide').hidden = false;

  // Delområder, with their grunnkretser behind a button.
  const A = B.areas;
  const chgBar = (d, max) => {
    const b = el('span', { class: 'chg-bar', 'aria-hidden': 'true' });
    const l = el('span', { class: 'neg' }), r = el('span', { class: 'pos' });
    if (d < 0) l.append(el('i', { style: `width:${Math.min(100, -d / max * 100)}%` }));
    if (d > 0) r.append(el('i', { style: `width:${Math.min(100, d / max * 100)}%` }));
    b.append(l, r);
    return b;
  };
  const maxD = Math.max(...A.rows.map(a => Math.abs(a.pop[A.last] - a.pop[A.first])));
  const hiYoung = [...A.rows].sort((a, b) => b.under16 - a.under16).slice(0, 3).map(a => a.code);
  const hiOld = [...A.rows].sort((a, b) => b.over67 - a.over67).slice(0, 3).map(a => a.code);
  const grew = [...A.rows].sort((a, b) => (b.pop[A.last] - b.pop[A.first]) - (a.pop[A.last] - a.pop[A.first]));
  const name = c => A.rows.find(a => a.code === c).name;
  document.getElementById('areas-lead').textContent =
    `SSB deler Narvik i ${A.rows.length} delområder. Mest vekst siden ${A.first} har ${grew.slice(0, 3).map(a => a.name).join(', ')}, mens ${grew.slice(-3).reverse().map(a => a.name).join(', ')} har gått mest tilbake. ` +
    `Flest barn har ${hiYoung.map(name).join(', ')}, og høyest andel over 67 har ${hiOld.map(name).join(', ')}.`;
  const t = el('table');
  t.innerHTML = `<thead><tr><th scope="col">Delområde</th><th scope="col">${A.first}</th><th scope="col">${A.last}</th><th scope="col">Endring</th><th scope="col">Under 16 år</th><th scope="col">67 år og over</th></tr></thead>`;
  const tb = el('tbody');
  const changeCell = (a, b, bar) => {
    const td = el('td'), d = b - a;
    td.append(signed(d), ' ', el('span', { class: 'muted' }, `(${signed(d / a * 100, 1)} %)`));
    if (bar) td.append(chgBar(d, maxD));
    return td;
  };
  A.rows.forEach(a => {
    const tr = el('tr');
    const btn = el('button', { type: 'button', class: 'expand', 'aria-expanded': 'false' }, a.name);
    const th = el('td'); th.append(btn);
    const youngCls = hiYoung.includes(a.code) ? 'hi' : '', oldCls = hiOld.includes(a.code) ? 'hi-old' : '';
    tr.append(th, el('td', { class: 'muted' }, nb(a.pop[A.first])), el('td', {}, nb(a.pop[A.last])), changeCell(a.pop[A.first], a.pop[A.last], true),
      el('td', { class: youngCls }, pc(a.under16)), el('td', { class: oldCls }, pc(a.over67)));
    tb.append(tr);
    const kids = a.kretser.map(k => {
      const kr = el('tr', { class: 'krets', hidden: '' });
      const f = k.pop[A.first], l = k.pop[A.last];
      kr.append(el('td', {}, k.name), el('td', {}, f == null ? '–' : nb(f)), el('td', {}, l == null ? '–' : nb(l)),
        f && l != null ? changeCell(f, l, false) : el('td', {}, '–'), el('td'), el('td'));
      tb.append(kr);
      return kr;
    });
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open);
      kids.forEach(k => { k.hidden = !open; });
    });
  });
  const tot = el('tr', { class: 'total' });
  tot.append(el('td', {}, 'Hele kommunen'), el('td', { class: 'muted' }, nb(A.total.pop[A.first])), el('td', {}, nb(A.total.pop[A.last])),
    changeCell(A.total.pop[A.first], A.total.pop[A.last], false), el('td', {}, pc(A.total.under16)), el('td', {}, pc(A.total.over67)));
  tb.append(tot);
  t.append(tb);
  document.getElementById('areas-table').replaceChildren(stackable(t));
  caption('areas-caption', 'Trykk et delområde for å se grunnkretsene i det. Folketall: ', src('04317'), '. Andeler under 16 og over 67: ', src('04362'),
    `, summert over grunnkretsene. 04362 kan avvike med noen få personer fra 04317 fordi SSB justerer små tall.${A.unknown ? ` ${nb(A.unknown)} personer har ukjent delområde i ${A.last}.` : ''}`);
  document.getElementById('areas').hidden = false;

  // Population year by year, and what changed it («befolkningens regnskap»), on one time axis:
  // the population on 1 January sits on the year boundaries, and each year's column between two
  // boundaries shows who was added (born, moved in) above the line and who left (died, moved out) below.
  const popYears = Object.keys(C).filter(y => C[y].population != null).sort();
  const cy = Object.keys(C).filter(y => C[y].born != null).sort();
  const parts = {
    born: ['Fødte', 'var(--male)'], moved_in: ['Flyttet inn', 'var(--male-bar)'],
    died: ['Døde', 'var(--female)'], moved_out: ['Flyttet ut', 'var(--female-bar)'],
  };
  const allYears = k => sum(cy.map(y => C[y][k]));
  const p0 = C[popYears[0]].population, p1 = C[popYears.at(-1)].population;
  document.getElementById('ledger-lead').textContent =
    `Folketallet 1. januar øverst, og under det hva som endret det i løpet av hvert år: de som ble født eller flyttet til Narvik over streken, de som døde eller flyttet ut under streken. ` +
    `Tallet på linja og prikken i søylen under er endringen i året. Fra ${popYears[0]} til ${popYears.at(-1)} gikk folketallet fra ${nb(p0)} til ${nb(p1)}. I årene ${cy[0]}–${cy.at(-1)} ble ${nb(allYears('born'))} født og ${nb(allYears('died'))} døde, mens ${nb(allYears('moved_in'))} flyttet inn og ${nb(allYears('moved_out'))} flyttet ut.`;
  document.getElementById('ledger-title').textContent = `Innbyggere i Narvik og hva som endret tallet, ${popYears[0]}–${popYears.at(-1)}`;
  const lg = document.getElementById('ledger-legend');
  lg.innerHTML = '';
  const lgItem = (style, n) => { const s = el('span'); s.append(el('i', { style }), n); lg.append(s); };
  lgItem('background:var(--accent)', 'Innbyggere 1. januar');
  Object.values(parts).forEach(([n, c]) => lgItem(`background:${c};border-radius:2px`, n));
  lgItem('background:var(--surface);border:2px solid var(--ink);box-sizing:border-box', 'Endring i året');
  const ledgerBox = document.getElementById('ledger-chart');
  const pv = popYears.map(y => C[y].population);
  const lo = Math.floor((Math.min(...pv) - 100) / 100) * 100, hi = Math.ceil((Math.max(...pv) + 100) / 100) * 100;
  const maxUp = Math.max(...cy.map(y => C[y].born + C[y].moved_in)), maxDown = Math.max(...cy.map(y => C[y].died + C[y].moved_out));
  const step = 500, top = Math.ceil(Math.max(maxUp, maxDown) / step) * step;
  const drawLedger = () => {
    const W = Math.max(340, Math.round(ledgerBox.clientWidth)) || 760, narrow = W < 560;
    const lx = 52, rx = W - 22, cw = (rx - lx) / cy.length, bw = Math.min(56, cw * 0.56);
    // Top: population on 1 January, on the boundaries between the year columns. The change written on each
    // segment of the line is the same year's change as the dot in the column right below it.
    const pt = 36, pb = 128, PY = v => pb - (v - lo) / (hi - lo) * (pb - pt), PX = i => lx + cw * i;
    // Below: the year's ledger, on the same time axis.
    const ty = pb + 44, by = ty + 250, zero = (ty + by) / 2, H = by + 26, sc = (zero - ty) / top;
    let g = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Innbyggere 1. januar: ${popYears.map((y, i) => `${y} ${nb(pv[i])}`).join(', ')}. Hva som endret folketallet: ` +
      cy.map(y => `${y}: ${C[y].born} fødte, ${C[y].moved_in} flyttet inn, ${C[y].died} døde, ${C[y].moved_out} flyttet ut, endring ${signed(C[y].growth)}`).join('; ') + '">';
    // Year boundaries run through both parts, so each column sits between two 1 January dots.
    popYears.forEach((y, i) => { g += `<line class="year-edge" x1="${PX(i)}" x2="${PX(i)}" y1="${pt - 6}" y2="${by}"/>`; });
    [lo, hi].forEach(v => { g += `<line class="grid" x1="${lx}" x2="${rx}" y1="${PY(v)}" y2="${PY(v)}"/><text x="${lx - 8}" y="${PY(v) + 4}" text-anchor="end">${nb(v)}</text>`; });
    g += `<text x="${lx - 8}" y="${pt - 18}" text-anchor="end" class="unit">innbyggere</text>`;
    g += `<polyline class="pop-line" points="${pv.map((v, i) => `${PX(i)},${PY(v)}`).join(' ')}"/>`;
    const iMin = pv.indexOf(Math.min(...pv)), iLast = pv.length - 1;
    pv.forEach((v, i) => {
      g += `<circle class="pop-dot" cx="${PX(i)}" cy="${PY(v)}" r="${i === iLast ? 5 : 4}"><title>1. januar ${popYears[i]}: ${nb(v)} innbyggere</title></circle>`;
      if ((narrow ? [iMin, iLast] : [0, iMin, iLast]).includes(i)) g += `<text class="pv" x="${PX(i)}" y="${PY(v) + 20}" text-anchor="${i === 0 ? 'start' : i === iLast ? 'end' : 'middle'}" dx="${i === 0 ? -4 : i === iLast ? 4 : 0}">${nb(v)}</text>`;
    });
    cy.forEach((y, i) => {
      const a = popYears.indexOf(y), b2 = popYears.indexOf(String(+y + 1));
      if (a < 0 || b2 < 0) return;
      const mx = (PX(a) + PX(b2)) / 2, my = Math.min(PY(pv[a]), PY(pv[b2]));
      g += `<text class="v" x="${mx}" y="${my - 10}" text-anchor="middle">${signed(C[y].growth)}<title>Endring i ${y}: ${signed(C[y].growth)}</title></text>`;
    });
    for (let t = -top; t <= top; t += step) {
      const yy = zero - t * sc;
      g += `<line class="${t ? 'grid' : 'zero'}" x1="${lx}" x2="${rx}" y1="${yy}" y2="${yy}"/><text x="${lx - 8}" y="${yy + 4}" text-anchor="end">${t ? signed(t) : '0'}</text>`;
    }
    g += `<text x="${lx - 8}" y="${ty - 14}" text-anchor="end" class="unit">personer</text>`;
    cy.forEach((y, i) => {
      const c = C[y], cx = lx + cw * i + cw / 2, x = cx - bw / 2;
      let up = zero, down = zero;
      ['born', 'moved_in'].forEach(k => {
        const h = c[k] * sc; up -= h;
        g += `<rect x="${x}" y="${up + 1}" width="${bw}" height="${Math.max(h - 1, 1)}" rx="2" fill="${parts[k][1]}"><title>${y}: ${parts[k][0].toLowerCase()} ${nb(c[k])}</title></rect>`;
      });
      ['died', 'moved_out'].forEach(k => {
        const h = c[k] * sc;
        g += `<rect x="${x}" y="${down}" width="${bw}" height="${Math.max(h - 1, 1)}" rx="2" fill="${parts[k][1]}"><title>${y}: ${parts[k][0].toLowerCase()} ${nb(c[k])}</title></rect>`;
        down += h;
      });
      const gy = zero - c.growth * sc;
      g += `<line class="net" x1="${x - 4}" x2="${x + bw + 4}" y1="${gy}" y2="${gy}"/><circle class="net-dot" cx="${cx}" cy="${gy}" r="5.5"><title>${y}: endring ${signed(c.growth)}</title></circle>`;
      g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${y}</text>`;
    });
    ledgerBox.innerHTML = g + '</svg>';
  };
  drawLedger();
  let ledgerW = ledgerBox.clientWidth;
  new ResizeObserver(() => { if (Math.abs(ledgerBox.clientWidth - ledgerW) > 8) { ledgerW = ledgerBox.clientWidth; drawLedger(); } }).observe(ledgerBox);

  const tt = el('table');
  const lines = [['Fødte', 'born'], ['Døde', 'died'], ['Flyttet inn', 'moved_in'], ['Flyttet ut', 'moved_out']];
  tt.innerHTML = `<thead><tr><th scope="col">Hva endret folketallet</th>${cy.map(y => `<th scope="col">${y}</th>`).join('')}</tr></thead>`;
  const tb2 = el('tbody');
  lines.forEach(([n, k]) => { const tr = el('tr'); tr.append(el('td', {}, n), ...cy.map(y => el('td', {}, nb(C[y][k])))); tb2.append(tr); });
  const sub2 = (n, f) => { const tr = el('tr'); tr.append(el('td', {}, n), ...cy.map(y => el('td', {}, signed(f(C[y]))))); tb2.append(tr); };
  sub2('Fødte minus døde', c => c.born - c.died);
  sub2('Innflyttet minus utflyttet', c => c.moved_in - c.moved_out);
  const gr = el('tr', { class: 'total' });
  gr.append(el('td', {}, 'Endring i året'), ...cy.map(y => el('td', {}, signed(C[y].growth))));
  tb2.append(gr); tt.append(tb2);
  document.getElementById('trend-table').replaceChildren(stackable(tt));
  caption('ledger-caption', 'Folketallet er per 1. januar, og aksen øverst starter på ' + nb(lo) + ' for å vise endringene. Fødte, døde og flytting er antall personer i løpet av hvert år. Endringen i året er SSBs folketilvekst, og den summerer ikke alltid nøyaktig til fødte, døde og flytting fordi SSB etterregistrerer noen personer. Flytting gjelder flytting over kommunegrensen, også til og fra utlandet. Kilde: ', src('06913'), '.');
  document.getElementById('trend').hidden = false;

  // Narvik against the comparison regions.
  const R = B.compare.rows;
  const alta = R.find(r => r.key === 'alta');
  document.getElementById('cmp-lead').textContent =
    `De samme kommunene som på økonomisidene. Narvik har ${narvik.median > landet.median ? 'eldre' : 'yngre'} befolkning enn landet uten Oslo` +
    (alta ? `, mens Alta har lavest medianalder (${alta.median} år) og har vokst mest.` : '.');
  const ct = el('table');
  ct.innerHTML = `<thead><tr><th scope="col"></th><th scope="col">Innbyggere ${last}</th><th scope="col">Endring siden ${first}</th><th scope="col">Medianalder</th><th scope="col">Over 80 år</th><th scope="col">Under 16 år</th><th scope="col">Menn per 100 kvinner, 20–39 år</th></tr></thead>`;
  const tb3 = el('tbody');
  R.forEach(r => {
    const tr = el('tr', r.key === 'narvik' ? { class: 'me' } : {});
    tr.append(el('td', {}, r.name), el('td', {}, nb(r.population)), el('td', {}, r.change == null ? '–' : signed(r.change, 1) + ' %'),
      el('td', {}, `${r.median} år`), el('td', {}, pc(r.over80)), el('td', {}, pc(r.under16)), el('td', {}, r.men_per_100_women == null ? '–' : String(r.men_per_100_women)));
    tb3.append(tr);
  });
  ct.append(tb3);
  document.getElementById('cmp-table').replaceChildren(stackable(ct));
  caption('cmp-caption', 'Beregnet fra ', src('07459'), ` per 1. januar ${last}. Landet uten Oslo er hele landet minus Oslo, og KOSTRA-gruppen er summen av kommunene i gruppen, med kommunenumrene de hadde i ${first} for endringen. Medianalderen er alderen der halvparten av innbyggerne er yngre.`);
  document.getElementById('compare').hidden = false;

  // Immigrants and Norwegian-born to immigrant parents.
  const I = B.immigrants, IS = I.series, iy = Object.keys(IS).sort(), il = IS[I.last], i0 = IS[I.first];
  const ukr = I.countries.find(c => c.name === 'Ukraina');
  document.getElementById('imm-lead').textContent =
    `${nb(il.count)} personer, eller ${pc(il.share)} av innbyggerne, i ${I.last}. Andelen var ${pc(i0.share)} i ${I.first}. I landet er den ${pc(il.landet)}.` +
    (ukr && ukr.now - ukr.then > 100 ? ` Den største endringen er flyktninger fra Ukraina, fra ${nb(ukr.then)} til ${nb(ukr.now)}.` : '');
  const maxS = Math.max(...iy.map(y => IS[y].share)) * 1.15;
  const cc = document.getElementById('imm-chart');
  cc.setAttribute('aria-label', 'Andel innvandrere og norskfødte med innvandrerforeldre: ' + iy.map(y => `${y} ${pc(IS[y].share)}`).join(', '));
  cc.replaceChildren(...iy.map(y => { const s = el('span'); s.append(el('b', {}, nb(IS[y].share, 1)), el('i', { style: `height:${IS[y].share / maxS * 120}px` }), y); return s; }));
  document.getElementById('imm-note').textContent = `Landet: ${pc(i0.landet)} i ${I.first} og ${pc(il.landet)} i ${I.last}. ${nb(I.immigrants)} er selv innvandrere, og ${nb(I.born_here)} er født i Norge med to innvandrerforeldre.`;
  document.getElementById('imm-top-h').textContent = `Største landgrupper ${I.last}`;
  const maxC = Math.max(...I.countries.map(c => c.now));
  const hb = (cls, ...cells) => { const d = el('div', { class: 'hb ' + cls }); d.append(...cells); return d; };
  document.getElementById('imm-top').replaceChildren(
    hb('head', el('span'), el('span'), el('span', { class: 'r' }, 'Antall'), el('span', { class: 'r' }, `Siden ${I.first}`)),
    ...I.countries.map(c => {
      const tr = el('span', { class: 'track' }); tr.append(el('i', { style: `width:${c.now / maxC * 100}%` }));
      return hb('', el('span', {}, c.name), tr, el('span', { class: 'r' }, nb(c.now)), el('span', { class: 'r muted caption' }, signed(c.now - c.then)));
    }));
  caption('imm-caption', 'Kilde: ', src('09817'), ', innvandrere og norskfødte med innvandrerforeldre per 1. januar. Landbakgrunn er eget fødeland for innvandrere og foreldrenes fødeland for norskfødte.');
  document.getElementById('imm').hidden = false;

  // Households.
  const HH = B.households, alone = HH.rows.find(r => r.key === 'alene'), kids = HH.rows.find(r => r.key === 'parbarn');
  document.getElementById('hh-lead').textContent =
    `${nb(HH.total)} husholdninger i ${HH.year}. ${pc(alone.share)} bor alene, mot ${pc(alone.landet)} i landet, og ${pc(kids.share)} er par med barn under 18, mot ${pc(kids.landet)}.`;
  const maxH = Math.max(...HH.rows.flatMap(r => [r.share, r.landet])) * 1.05;
  const legend = el('span', { class: 'legend' });
  legend.innerHTML = '<span><i style="background:var(--accent);border-radius:2px"></i>Narvik</span><span><i style="background:none;border-left:2px solid var(--ink);border-radius:0;width:2px"></i>Landet</span>';
  document.getElementById('hh-bars').replaceChildren(
    hb('wide head', el('span'), legend, el('span', { class: 'r' }, 'Narvik'), el('span', { class: 'r' }, 'Landet')),
    ...HH.rows.map(r => {
      const tr = el('span', { class: 'track' });
      tr.append(el('i', { style: `width:${r.share / maxH * 100}%` }), el('u', { style: `left:${r.landet / maxH * 100}%` }));
      return hb('wide', el('span', {}, r.name), tr, el('b', { class: 'r' }, pc(r.share)), el('span', { class: 'r muted caption' }, pc(r.landet)));
    }));
  caption('hh-caption', `Andel av privathusholdningene 1. januar ${HH.year}. Folk som bor på institusjon er ikke med. Kilde: `, src('06070'), '.');
  document.getElementById('hh').hidden = false;

  const ids = Object.keys(S);
  document.getElementById('sources').replaceChildren(...ids.flatMap((k, i) => [i ? (i === ids.length - 1 ? ' og ' : ', ') : '',
    el('a', { href: S[k].url, target: '_blank', rel: 'noopener' }, k)]));
  document.getElementById('generated').textContent = new Date(B.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  // The sections are hidden until drawn, so the browser cannot jump to #pyramide by itself.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
startPopulation();
