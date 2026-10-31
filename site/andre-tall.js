// andre-tall.html: «Andre tall», a timeline of numbers about Narvik kommune that are not shown elsewhere on the site.
// Everything comes from data/andre_tall.json, which scripts/build_andre_tall.py writes from config/andre_tall.json.
// The newest publication comes first. Cards published the same day by the same kind of source share one dot on the line.
// ?tema= keeps a filter in the address, and #<id> points to one card.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateText = iso => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const STEP = 10;

(async () => {
  const tl = document.getElementById('at-tl');
  let D;
  try { D = await fetch('data/andre_tall.json', { cache: 'no-cache' }).then(r => r.json()); } catch (e) {
    tl.outerHTML = '<p>Fant ikke tallene. Prøv å laste siden på nytt.</p>';
    return;
  }
  const ALL = D.tall; // already sorted newest first
  const params = new URLSearchParams(location.search);
  const state = { tema: params.get('tema') || 'Alle', shown: STEP };
  const more = document.getElementById('at-more'), empty = document.getElementById('at-empty');

  const filters = document.getElementById('at-filters');
  const row = (key, label, values) => `<div class="at-filter" role="group" aria-label="${label}"><span>${label}</span>${['Alle', ...values].map(v =>
    `<button type="button" data-key="${key}" data-v="${esc(v)}" aria-pressed="${state[key] === v}">${esc(v)}</button>`).join('')}</div>`;
  filters.innerHTML = row('tema', 'Tema', [...new Set(ALL.map(t => t.tema))].sort((a, b) => a.localeCompare(b, 'nb')));
  filters.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state[b.dataset.key] = b.dataset.v;
    state.shown = STEP;
    filters.querySelectorAll(`button[data-key="${b.dataset.key}"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const p = new URLSearchParams();
    if (state.tema !== 'Alle') p.set('tema', state.tema);
    history.replaceState(null, '', (p.toString() ? '?' + p : location.pathname));
    render();
  });

  const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
  const card = t => {
    const k = t.kilde;
    const link = `<a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.navn)}</a>${k.side ? ', ' + esc(k.side) : ''}`;
    return `<article class="at-card${t.nyere ? ' old' : ''}" id="${esc(t.id)}">
      <span class="at-gjelder">Gjelder ${esc(lower(t.gjelder))}</span>
      <div class="at-big">${esc(t.tall)}<span class="at-unit">${esc(t.enhet)}</span>${t.endring ? `<span class="at-chg">${esc(t.endring)}</span>` : ''}</div>
      <p>${esc(t.tekst)}</p>
      <div class="at-meta"><span class="at-tema">${esc(t.tema)}</span><span>Kilde: ${link}</span><a class="at-share" href="#${esc(t.id)}" aria-label="Lenke til dette tallet">Lenke</a></div>
      ${t.nyere ? `<p class="at-newer">Nyere tall finnes: <a href="#${esc(t.nyere.id)}">gjelder ${esc(lower(t.nyere.gjelder))}</a></p>` : ''}
    </article>`;
  };

  const match = t => state.tema === 'Alle' || t.tema === state.tema;
  function render() {
    const list = ALL.filter(match);
    const groups = [];
    list.slice(0, state.shown).forEach(t => {
      const g = groups[groups.length - 1];
      if (g && g.dato === t.dato && g.kildetype === t.kildetype && g.datotype === t.datotype) g.items.push(t);
      else groups.push({ dato: t.dato, datotype: t.datotype, kildetype: t.kildetype, items: [t] });
    });
    tl.innerHTML = groups.map(g => `<li${g.items.every(t => t.nyere) ? ' class="old"' : ''}>
      <div class="at-pub"><time datetime="${g.dato}">${dateText(g.dato)}</time><span>${g.datotype} · ${esc(g.kildetype)}</span></div>
      <div class="at-cards">${g.items.map(card).join('')}</div></li>`).join('');
    empty.hidden = list.length > 0;
    more.hidden = list.length <= state.shown;
    more.textContent = `Vis mer (${list.length - state.shown})`;
  }
  more.addEventListener('click', () => { state.shown += STEP; render(); });

  // A link to one card shows it even when it is behind «Vis mer» or outside the filter.
  function showTarget() {
    const id = decodeURIComponent(location.hash.slice(1));
    const t = ALL.find(x => x.id === id);
    if (!t) return;
    if (!match(t)) {
      state.tema = 'Alle';
      filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === 'Alle')));
    }
    const idx = ALL.filter(match).indexOf(t);
    if (idx >= state.shown) state.shown = idx + 1;
    render();
    document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }
  render();
  window.addEventListener('hashchange', showTarget);
  showTarget();
})();
