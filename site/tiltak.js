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

  const draw = y => {
    const src = T.sources[y], L = T.lines.filter(l => l.aar === y);
    const cut = l => -l['1000kr'][y], back = l => Math.min(cut(l), l.reversert?.[y] || 0);
    const status = l => l.oppfolging?.status || (back(l) >= cut(l) ? 'reversert' : 'ingen');
    const S = L.filter(l => l.innsparing);
    const sum = (list, f) => list.reduce((s, l) => s + f(l), 0);
    const reported = S.filter(l => l.oppfolging && l.oppfolging.status !== 'ikke-oppgitt');
    const silent = S.filter(l => !reported.includes(l) && status(l) !== 'reversert');
    const kept = l => cut(l) - back(l);
    const proposal = src.status === 'forslag';

    // Summary
    document.getElementById('h-sum').textContent = `Innsparingene i budsjettet for ${y}`;
    document.getElementById('sum-lead').textContent = `${proposal ? 'Kommunedirektørens forslag' : 'Budsjettet kommunestyret vedtok'} for ${y} hadde ${S.length} innsparinger på til sammen ${mk(sum(S, cut))} mill. kr. `
      + (sum(S, back) ? `Kommunestyret tok ut ${mk(sum(S, back))} mill. kr av dem i samme vedtak. ` : '')
      + `For ${mk(sum(silent, kept))} mill. kr av det som sto igjen, har vi ikke funnet noen status i kommunens rapporter.`;
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

    // Measure by measure, per area
    const card = (l, kind) => {
      const s = kind === 'fix' ? null : status(l), [label, tone] = s ? STATUS[s] : [];
      const amt = kind === 'fix' ? `+${mk(l['1000kr'][y])}` : `−${mk(cut(l))}`;
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
        <p class="caption fact-src">Kilde: ${framsikt(l, y)}</p></li>`;
    };
    const areaNotes = T.omradenotater.filter(n => n.budsjett === y);
    // Largest cuts first, so the areas that carry the savings come before the small shares of the structural cut.
    const byCut = [...T.areas].sort((a, b) => sum(S.filter(l => l.omrade === b.key), cut) - sum(S.filter(l => l.omrade === a.key), cut));
    const groups = byCut.map(a => {
      const list = S.filter(l => l.omrade === a.key).sort((p, q) => cut(q) - cut(p));
      const notes = areaNotes.filter(n => n.omrade === a.key);
      if (!list.length && !notes.length) return '';
      return `<div class="fact-group" id="o-${a.key}"><h3>${esc(a.name)} <span class="caption">· ${mk(sum(list, cut))} mill. kr i kutt</span></h3>`
        + notes.map(n => `<p class="status-note">${esc(n.tekst)} <span class="caption">Kilde: ${cite(n.kilde)}</span></p>`).join('')
        + `<ul class="fact-list">${list.map(l => card(l)).join('')}</ul></div>`;
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
