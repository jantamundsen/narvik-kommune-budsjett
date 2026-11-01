// Budsjett mot regnskap: renders site/data/budsjett.json (written by scripts/fetch_budget.py) on budsjett.html. Helpers are in common.js.
async function startBudget() {
  let B;
  try {
    const res = await fetch('data/budsjett.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    B = await res.json();
  } catch (e) {
    document.querySelector('.wrap header').insertAdjacentHTML('beforeend', '<p class="lead">Fant ikke data/budsjett.json. Kjør <code>python scripts/fetch_budget.py</code> og åpne siden via en webserver.</p>');
    return;
  }
  const find = (kind, year) => B.series.find(x => x.kind === kind && (!year || x.year === year));
  const src = x => B.sources[x.source];
  const mk = v => nb(v / 1000, Math.abs(v) < 10000 ? 1 : 0);
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + mk(Math.abs(v));
  // One citation per document; series from the same document share it and list their columns together.
  const cite = (x, cols = [x.column]) => {
    const a = el('a', { href: src(x).url, target: '_blank', rel: 'noopener' }, src(x).name);
    const span = el('span');
    span.append(a, `, ${B.table}, ${cols.length > 1 ? 'kolonnene' : 'kolonne'} ${cols.map(c => `«${c}»`).join(' og ')} (`);
    const links = [];
    if (x.data_url !== src(x).pdf) links.push(el('a', { href: x.data_url, target: '_blank', rel: 'noopener' }, 'data'));
    if (src(x).pdf) links.push(el('a', { href: src(x).pdf, target: '_blank', rel: 'noopener' }, `PDF s. ${src(x).pdf_page}`));
    links.forEach((a, i) => span.append(...(i ? [', ', a] : [a])));
    span.append(')');
    return span;
  };
  const caption = (id, list, extra) => {
    const c = document.getElementById(id); c.replaceChildren('Mill. kr, netto per tjenesteområde. Kilder: ');
    const bySource = new Map();
    [...new Map(list.map(x => [x.id, x])).values()].forEach(x => {
      const k = x.source + '|' + x.data_url;
      if (!bySource.has(k)) bySource.set(k, { x, cols: [] });
      bySource.get(k).cols.push(x.column);
    });
    [...bySource.values()].forEach(({ x, cols }, i) => { if (i) c.append('; '); c.append(cite(x, cols)); });
    c.append('. ' + (extra || ''));
  };
  const head = (cols) => {
    const h = el('div', { class: 'ledger-head' });
    cols.forEach((t, i) => h.appendChild(el('span', i > 1 ? { class: 'r' } : {}, t)));
    return h;
  };
  const row = (area, bar, a, aLabel, b, chg, chgCls, total) => {
    const r = el('div', { class: 'budget-row' + (total ? ' total' : '') });
    const y1 = el('span', { class: 'r num c-y1' }); y1.append(el('span', { class: 'm-label' }, aLabel + ' '), a);
    const nm = el('span', { class: 'c-name row-name' });
    nm.append(typeof area === 'string' ? area : area.name);
    if (area.description) nm.appendChild(el('small', {}, area.description));
    r.append(nm, bar || el('span', { class: 'c-share' }), y1, el('span', { class: 'r num c-amt' }, b), el('span', { class: 'r chg c-chg ' + chgCls }, chg));
    return r;
  };

  // Planned against spent, for each year with both an adopted budget and accounts. The year can come from the address (?aar=2024).
  const pairYears = B.series.filter(x => x.kind === 'budsjett' && find('regnskap', x.year)).map(x => x.year);
  const drawActual = y => {
    const bud = find('budsjett', y), act = find('regnskap', y);
    const diffs = B.areas.map(a => act['1000kr'][a.key] - bud['1000kr'][a.key]);
    const maxDiff = Math.max(...diffs.map(Math.abs));
    const led = document.getElementById('budget-actual');
    led.replaceChildren(head(['Tjenesteområde', 'Avvik', `Budsjett ${y}`, `Regnskap ${y}`, 'Avvik']));
    B.areas.forEach((a, i) => {
      const d = diffs[i], bar = el('span', { class: 'c-share' }), dev = el('span', { class: 'dev', title: `${signed(d)} mill. kr` });
      const fill = el('span', { class: d > 0 ? 'over' : 'under' }); fill.style.width = (Math.abs(d) / maxDiff * 50) + '%';
      dev.appendChild(fill); bar.appendChild(dev);
      led.appendChild(row(a, bar, mk(bud['1000kr'][a.key]), 'Budsjett', mk(act['1000kr'][a.key]), signed(d), d > 500 ? 'up' : d < -500 ? 'down' : ''));
    });
    const dt = act.total_1000kr - bud.total_1000kr;
    led.appendChild(row('Sum', null, mk(bud.total_1000kr), 'Budsjett', mk(act.total_1000kr), signed(dt), dt > 0 ? 'up' : 'down', true));
    const top = B.areas.map((a, i) => ({ a, d: diffs[i] })).sort((p, q) => q.d - p.d)[0];
    document.getElementById('budget-lead').textContent = `Kommunestyret vedtok ${mk(bud.total_1000kr)} mill. kr til driften av tjenesteområdene i ${y}. Regnskapet endte på ${mk(act.total_1000kr)} mill. kr, ${mk(Math.abs(dt))} mill. kr ${dt >= 0 ? 'mer' : 'mindre'}. ${top.d > 0 ? `Største avvik var ${top.a.name.toLowerCase()}, ${signed(top.d)} mill. kr.` : ''}`;
    caption('budget-actual-caption', [bud, act], `Budsjettet er det opprinnelige, slik det ble vedtatt i desember året før. Rammene justeres i løpet av året, for eksempel når lønnsoppgjøret fordeles fra fellesposten til tjenesteområdene, så avviket her er ikke det samme som et merforbruk.`);
    document.getElementById('budget').hidden = false;
    const back = document.getElementById('accounts-link');
    back.href = 'okonomi?aar=' + y; back.textContent = `Se hele regnskapet for ${y} →`;
  };
  if (pairYears.length) {
    let y = pairYears.includes(urlYear()) ? urlYear() : pairYears.at(-1);
    const yearsEl = document.getElementById('years');
    const pick = v => {
      y = v;
      yearsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.textContent === y)));
      try { history.replaceState(null, '', '?aar=' + y); } catch (e) {}
      drawActual(y);
    };
    pairYears.forEach(v => {
      const b = el('button', { role: 'radio', type: 'button', 'aria-checked': String(v === y) }, v);
      b.addEventListener('click', () => pick(v));
      yearsEl.appendChild(b);
    });
    yearsEl.hidden = false;
    drawActual(y);
  }

  // The newest budget year: the adopted budget if there is one, else the proposal, against the year before.
  const ny = B.series.filter(x => x.kind === 'budsjett' || x.kind === 'forslag').map(x => x.year).sort().at(-1);
  const cur = ny && (find('budsjett', ny) || find('forslag', ny)), prop = ny && find('forslag', ny);
  const base = cur && find('budsjett', String(+ny - 1));
  if (cur && base) {
    const adopted = cur.kind === 'budsjett', curLabel = `${adopted ? 'Vedtatt' : 'Forslag'} ${cur.year}`;
    const led = document.getElementById('plan-ledger');
    led.replaceChildren(head(['Tjenesteområde', 'Andel', `Vedtatt ${base.year}`, curLabel, 'Endring']));
    const maxShare = Math.max(...B.areas.map(a => cur['1000kr'][a.key] / cur.total_1000kr));
    B.areas.forEach(a => {
      const v = cur['1000kr'][a.key], p = pct(v, base['1000kr'][a.key]);
      const bar = el('span', { class: 'share c-share' }), track = el('span', { class: 'share-track' }), fill = el('span', { class: 'share-fill' });
      fill.style.display = 'block'; fill.style.width = Math.max(0, v / cur.total_1000kr / maxShare * 100) + '%';
      track.appendChild(fill); bar.append(track, el('small', {}, nb(v / cur.total_1000kr * 100, 1) + ' %'));
      led.appendChild(row(a, bar, mk(base['1000kr'][a.key]), `Vedtatt ${base.year}`, mk(v), chgText(p), ''));
    });
    const p = pct(cur.total_1000kr, base.total_1000kr);
    led.appendChild(row('Sum', null, mk(base.total_1000kr), `Vedtatt ${base.year}`, mk(cur.total_1000kr), chgText(p), '', true));
    document.getElementById('h-plan').textContent = `Budsjettet for ${cur.year}`;
    document.getElementById('plan-lead').textContent = adopted
      ? `Kommunestyret ga tjenesteområdene ${mk(cur.total_1000kr)} mill. kr for ${cur.year}, mot ${mk(base.total_1000kr)} mill. kr for ${base.year}.` + (prop ? ` Kommunedirektøren hadde foreslått ${mk(prop.total_1000kr)} mill. kr.` : '')
      : `Forslaget gir tjenesteområdene ${mk(cur.total_1000kr)} mill. kr i ${cur.year}, mot ${mk(base.total_1000kr)} mill. kr vedtatt for ${base.year}.`;
    const status = document.getElementById('plan-status');
    status.textContent = adopted ? '' : `Tallene for ${cur.year} er kommunedirektørens forslag, ikke kommunestyrets vedtak. Kommunestyrets vedtak kan avvike fra forslaget.`;
    status.hidden = adopted;
    const extra = adopted
      ? `Budsjettet for ${cur.year} er det opprinnelige, slik kommunestyret vedtok det.`
      : '';
    caption('plan-caption', adopted && prop ? [base, cur, prop] : [base, cur], `Endring er fra vedtatt ${base.year} til ${adopted ? 'vedtatt' : 'forslaget for'} ${cur.year}, i løpende kroner. ${extra}`);
    document.getElementById('plan').hidden = false;
  }
}

startBudget();
