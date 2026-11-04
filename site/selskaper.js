// selskaper/ (the list of companies Narvik kommune owns) and selskaper/<id> (one company). Renders
// site/data/selskaper.json from scripts/fetch_selskaper.py: the kommune's share and book value typed in from note 5
// of the årsregnskap (config/selskaper.json), and each company's own accounts from Brønnøysundregistrene.
// The company pages are copies of selskap.html made by scripts/build_pages.py, with the id in data-selskap.
let D;

const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Amounts in kroner: millions with one decimal, small amounts in whole kroner.
const kr = v => (v == null ? '·' : Math.abs(v) >= 100000 ? `${v < 0 ? '−' : ''}${nb(Math.abs(v) / 1e6, 1)} mill. kr` : `${v < 0 ? '−' : ''}${nb(Math.abs(v))} kr`);
const mill = v => (v == null ? '·' : (v < 0 ? '−' : '') + nb(Math.abs(v) / 1e6, 1));
const share = v => (v == null ? 'ikke oppgitt' : v.toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' %');
const FORMS = { AS: 'aksjeselskap', IKS: 'interkommunalt selskap', KF: 'kommunalt foretak', SA: 'samvirkeforetak', GFS: 'gjensidig forsikringsselskap' };
const rs = (side, text) => {
  const k = D.kilder[D.kilde];
  return `<a href="${h(k.pdf)}#page=${side}" target="_blank" rel="noopener" title="${h(k.full)}">${h(text || k.navn)}, s. ${side}</a>`;
};
const em = side => {
  const k = D.kilder['em-2022'];
  return `<a href="${h(k.pdf)}#page=${side}" target="_blank" rel="noopener" title="${h(k.full)}">${h(k.navn)}, s. ${side}</a>`;
};
const brregPage = o => `https://virksomhet.brreg.no/nb/oppslag/enheter/${o}`;
const brregAcc = o => D.kilder_brreg.regnskap + o;
// The accounts shown for a company: the group's where the company is a parent, otherwise the company's own.
const accType = s => (s.regnskap?.konsern ? 'konsern' : s.regnskap?.selskap ? 'selskap' : null);
function latest(s, typ = accType(s)) {
  const ys = typ ? s.regnskap[typ] : null;
  if (!ys) return null;
  const y = Object.keys(ys).sort().at(-1);
  return { typ, y, r: ys[y] };
}
const page = s => (s.orgnr ? `selskaper/${s.id}` : null);
// The kommune's share of the equity, worked out here: its share of the company times the equity in the company's
// latest accounts (the group's where there is one). Not a number anyone has published, so it is marked «beregnet».
function ownEquity(s) {
  const L = latest(s);
  if (!L || s.eierandel == null || L.r.egenkapital == null) return null;
  return { v: s.eierandel / 100 * L.r.egenkapital, L };
}
const calcTag = ' <span class="tag">beregnet</span>';
const law = k => `<a href="${h(D.lover[k].url)}" target="_blank" rel="noopener">${h(D.lover[k].navn)}</a>`;

async function start() {
  try {
    const res = await fetch('data/selskaper.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
  } catch (e) {
    const t = document.getElementById('lead') || document.getElementById('selskap');
    t.innerHTML = 'Fant ikke data/selskaper.json. Kjør <code>python scripts/fetch_selskaper.py</code> og åpne siden via en webserver.';
    return;
  }
  document.getElementById('generated').textContent = new Date(D.generated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const main = document.getElementById('selskap');
  if (main) drawCompany(main);
  else drawList();
}

// --- The list ---------------------------------------------------------------------------------------------

function drawList() {
  const S = D.selskaper, T = D.totaler, N = D.noter, y = D.aar;
  const owned = S.filter(s => s.form !== 'GFS');
  const full = owned.filter(s => s.eierandel === 100);
  document.getElementById('lead').textContent = `Narvik kommune eier aksjer eller andeler i ${owned.length} selskaper, og ${full.length} av dem eier kommunen alene. `
    + `Aksjene og andelene står med ${kr(T.bokfort.belop)} i kommunens balanse ved utgangen av ${y}. Hvert selskap har en egen side med eierskapet og selskapets eget regnskap.`;

  const ownGuar = S.flatMap(s => s.garantier || []).concat(D.andre_garantier || []);
  const eq = S.map(ownEquity).filter(Boolean);
  const eqSum = eq.reduce((a, x) => a + x.v, 0);
  const eqYears = [...new Set(eq.map(x => x.L.y))].sort();
  document.getElementById('summary').innerHTML = [
    ['Aksjer og andeler i kommunens balanse', kr(T.bokfort.belop), `bokført verdi 31.12.${y}`, rs(T.bokfort.side)],
    ['Utbytte til kommunen', kr(T.utbytte.belop), `i ${y}, mot ${kr(T.utbytte.forrige)} i ${y - 1}`, rs(T.utbytte.side)],
    [`Kommunens andel av selskapenes egenkapital${calcTag}`, kr(eqSum), `eierandel ganger egenkapital, ${eq.length} selskaper`, 'eierandel fra årsregnskapet, egenkapital fra Regnskapsregisteret'],
  ].map(([label, big, sub, src]) => `<div class="stat"><span class="sub">${label}</span><span class="big num">${big}</span><span class="sub">${sub}</span><span class="caption">Kilde: ${src}</span></div>`).join('');
  document.getElementById('summary-caption').textContent = `Årsregnskapet viser ikke hvilke selskaper utbyttet kom fra. Andelen av egenkapitalen er regnet ut her for selskapene som har både oppgitt eierandel og regnskap i Regnskapsregisteret, med siste regnskapsår (${eqYears.join(', ')}). Der selskapet er morselskap, er konsernets egenkapital brukt, og den kan inneholde andeler som tilhører andre eiere av datterselskapene.`;

  const withAcc = S.filter(s => latest(s));
  document.getElementById('list-lead').textContent = `Eierandel og bokført verdi fra kommunens årsregnskap for ${y}. Inntekter, resultat og egenkapital er selskapenes egne tall fra Regnskapsregisteret, for det siste året selskapet har levert, og for hele konsernet der selskapet eier datterselskaper. ${withAcc.length} av selskapene har regnskap der.`;

  const picks = [['alle', 'Alle'], ['hel', 'Helt eid'], ['del', 'Delvis eid']];
  let pick = new URLSearchParams(location.search).get('vis') || 'alle';
  const pickEl = document.getElementById('pick');
  const drawPick = () => {
    pickEl.innerHTML = picks.map(([k, t]) => `<a href="selskaper/${k === 'alle' ? '' : '?vis=' + k}" data-k="${k}"${k === pick ? ' aria-current="true"' : ''}>${t}</a>`).join('');
  };
  pickEl.addEventListener('click', e => {
    const a = e.target.closest('a[data-k]');
    if (!a) return;
    e.preventDefault();
    pick = a.dataset.k;
    history.replaceState(null, '', a.getAttribute('href'));
    drawPick();
    drawTable();
  });
  // Largest equity first; companies without accounts in the register after them, largest book value first.
  const order = [...S].sort((a, b) => {
    const ea = latest(a)?.r.egenkapital, eb = latest(b)?.r.egenkapital;
    if (ea != null && eb != null) return eb - ea;
    if (ea != null || eb != null) return ea != null ? -1 : 1;
    return b.bokfort - a.bokfort;
  });
  const table = document.getElementById('list');
  const drawTable = () => {
    const rows = order.filter(s => pick === 'alle' || (pick === 'hel' ? s.eierandel === 100 : s.eierandel !== 100));
    table.innerHTML = `<thead><tr><th>Selskap</th><th>Kommunens eierandel</th><th>Bokført verdi i kommunens balanse</th><th>Driftsinntekter</th><th>Årsresultat</th><th>Egenkapital</th><th>Kommunens andel av egenkapitalen (beregnet)</th></tr></thead><tbody>`
      + rows.map(s => {
        const L = latest(s), p = page(s);
        const what = L ? `${s.form} · ${L.typ === 'konsern' ? 'konsern, ' : ''}${L.y}` : `${s.form} · ${s.ingen_regnskap ? 'ikke et vanlig selskapsregnskap' : s.orgnr ? 'ikke i Regnskapsregisteret' : 'ikke funnet i Enhetsregisteret'}`;
        const v = k => (L ? kr(L.r[k]) : '');
        return `<tr><td>${p ? `<a href="${p}">${h(s.navn)}</a>` : h(s.navn)}<br><span class="muted">${h(what)}</span></td>`
          + `<td class="num">${share(s.eierandel)}</td><td class="num">${kr(s.bokfort)}</td>`
          + ['driftsinntekter', 'aarsresultat', 'egenkapital'].map(k => `<td class="num${L ? '' : ' empty'}">${v(k)}</td>`).join('')
          + (E => `<td class="num${E ? '' : ' empty'}">${E ? kr(E.v) : ''}</td>`)(ownEquity(s)) + '</tr>';
      }).join('') + '</tbody>';
    stackable(table);
  };
  drawPick();
  drawTable();
  const gone = (D.borte || []).map(b => `${h(b.navn)} ble ${h(b.tekst)}`).join(', og ');
  document.getElementById('list-caption').innerHTML = `Kilder: eierandel og bokført verdi fra ${rs(N.aksjer_side, D.kilder[D.kilde].navn + ', note 5')}–${N.andeler_side}. `
    + `Regnskapstall fra <a href="https://www.brreg.no/om-oss/registrene-vare/om-regnskapsregisteret/" target="_blank" rel="noopener">Regnskapsregisteret</a>, Brønnøysundregistrene, lenket fra hver selskapsside. `
    + `Eierandelen er ikke oppgitt i årsregnskapet for noen av samvirkeforetakene. ${gone ? gone + '.' : ''}`;

  drawMoney(ownGuar);
  document.getElementById('sources').innerHTML = `${rs(N.aksjer_side, D.kilder[D.kilde].full)}; Regnskapsregisteret og Enhetsregisteret, Brønnøysundregistrene (<a href="https://data.brreg.no/" target="_blank" rel="noopener">data.brreg.no</a>, NLOD).`;
}

// What the kommune answers for in a KF or IKS: all of a KF's debt, an IKS's debt times the share. For Narvik Vann KF
// the loans are taken up by the kommune and listed in its own note on loans. An IKS's share is worked out here from
// the company's own accounts (not the group's: the IKS answers only for its own debt).
function debtShare(s) {
  if (s.kf_lan) return { v: s.kf_lan.belop, text: `${h(s.kf_lan.tekst)}: ${kr(s.kf_lan.belop)} 31.12.${D.aar} (${rs(D.noter.lan_side)}). Lånene er med i kommunens egen gjeld.`, src: rs(D.noter.lan_side) };
  if (s.form === 'KF') return { v: null, text: 'Gjelden står i foretakets eget årsregnskap, som ikke er lagt inn her.' };
  const L = latest(s, s.regnskap?.selskap ? 'selskap' : null);
  if (!L || L.r.gjeld == null) return { v: null, text: 'Selskapet har ikke regnskap i Regnskapsregisteret, så gjelden er ikke lagt inn her.' };
  const v = s.eierandel / 100 * L.r.gjeld;
  return { v, gjeld: L.r.gjeld, y: L.y, text: `${share(s.eierandel)} av ${kr(L.r.gjeld)} gjeld i selskapet 31.12.${L.y} er ${kr(v)} (beregnet).` };
}

function drawDebt() {
  // Foretakene first, where the kommune answers for all of it, then the IKS by share.
  const list = D.selskaper.filter(s => s.gjeldsansvar).sort((a, b) => (b.form === 'KF') - (a.form === 'KF') || (b.kf_lan ? 1 : 0) - (a.kf_lan ? 1 : 0) || b.eierandel - a.eierandel);
  const cite = k => `${h(D.lover[k].tekst.replace(/\.$/, ''))} (${law(k)}).`;
  document.getElementById('debt-lead').innerHTML = `${cite('kf')} ${cite('iks')}`;
  const t = document.getElementById('debt');
  t.innerHTML = '<thead><tr><th>Selskap</th><th>Kommunen svarer for</th><th>Selskapets gjeld</th><th>Kommunens del</th></tr></thead><tbody>'
    + list.map(s => {
      const g = debtShare(s);
      const own = s.kf_lan ? `Lån tatt opp av kommunen<br><span class="muted">${rs(D.noter.lan_side)}</span>` : g.gjeld != null ? `${kr(g.gjeld)}<br><span class="muted">${g.y}, <a href="${brregAcc(s.orgnr)}" target="_blank" rel="noopener">Regnskapsregisteret</a></span>` : '<span class="muted">ikke lagt inn</span>';
      return `<tr><td><a href="${page(s)}">${h(s.navn)}</a></td><td>${s.form === 'KF' ? 'All gjeld' : `${share(s.eierandel)} av gjelden`}</td><td class="num">${own}</td><td class="num">${g.v != null ? kr(g.v) + (s.kf_lan ? '' : calcTag) : '<span class="muted">·</span>'}</td></tr>`;
    }).join('') + '</tbody>';
  stackable(t);
  document.getElementById('debt-caption').innerHTML = `Kilder: listen over gjeldsansvar i ${rs(D.noter.gjeldsansvar_side, D.kilder[D.kilde].navn)}, ${law('kf')} og ${law('iks')}. `
    + 'Narvik Havn KF, Ofoten brann og redning IKS, KomRev Nord IKS og K-Sekretariatet IKS har ikke regnskap i Regnskapsregisteret, så gjelden deres er ikke lagt inn ennå. For interkommunale selskaper er selskapets egen gjeld brukt, ikke konsernets.';
}

function drawMoney(guar) {
  const T = D.totaler, y = +D.aar;
  const rows = [
    ['Utbytte fra selskaper', T.utbytte, 'Inntekt i driftsregnskapet'],
    ['Kjøp av aksjer og andeler', T.aksjekjop, 'Utgift i investeringsregnskapet'],
    ['Aksjer og andeler, bokført verdi ved årets slutt', T.bokfort, 'Balansen'],
  ];
  document.getElementById('money-lead').textContent = `Det som går mellom kommunen og selskapene i kommunens eget regnskap for ${y - 1} og ${y}.`;
  const t = document.getElementById('money');
  t.innerHTML = `<thead><tr><th>Post</th><th>${y - 1}</th><th>${y}</th><th>Endring</th><th>Kilde</th></tr></thead><tbody>`
    + rows.map(([name, x, where]) => `<tr><td>${name}<br><span class="muted">${where}</span></td><td class="num">${kr(x.forrige)}</td><td class="num">${kr(x.belop)}</td><td class="num">${chgText(pct(x.belop, x.forrige))}</td><td>${rs(x.side, D.kilder[D.kilde].navn)}</td></tr>`).join('')
    + '</tbody>';
  stackable(t);
  document.getElementById('money-caption').textContent = 'Kolonnen for ' + (y - 1) + ' er tallene slik de står i årsregnskapet for ' + y + '.';

  drawDebt();
  document.getElementById('guarantees-lead').textContent = 'En garanti betyr at kommunen betaler hvis selskapet ikke klarer å betale lånet. Garantiene kommer i tillegg til gjeldsansvaret over, og gjelder selskaper der kommunen ellers ikke svarer for gjelden.';
  const g = document.getElementById('guarantees');
  g.innerHTML = '<thead><tr><th>Garantien gjelder</th><th>Formål</th><th>Garantiramme</th><th>Garantert beløp 31.12.' + y + '</th><th>Utløper</th></tr></thead><tbody>'
    + guar.map(x => {
      const s = D.selskaper.find(s => (s.garantier || []).includes(x));
      const name = s ? `<a href="${page(s)}">${h(x.navn)}</a>` : h(x.navn);
      return `<tr><td>${name}${x.type ? `<br><span class="muted">${h(x.type)}</span>` : ''}${x.merknad ? `<br><span class="muted">${h(x.merknad)}</span>` : ''}</td><td>${h(x.formal)}</td><td class="num${x.ramme ? '' : ' empty'}">${x.ramme ? kr(x.ramme) : ''}</td><td class="num">${kr(x.saldo)}</td><td class="num">${h(x.utloper || '')}</td></tr>`;
    }).join('') + '</tbody>';
  stackable(g);
  document.getElementById('guarantees-caption').innerHTML = `Kilde: ${rs(D.noter.garantier_side, D.kilder[D.kilde].navn + ', note 10')}. `
    + `Resten av garantiene i noten gjelder selskaper og lag kommunen ikke eier, som bompengeselskap, borettslag og barnehager. Kommunen måtte ikke betale på noen garanti i ${y}.`;
}

// --- One company ------------------------------------------------------------------------------------------

function drawCompany(main) {
  const id = main.dataset.selskap || new URLSearchParams(location.search).get('selskap');
  const s = D.selskaper.find(x => x.id === id);
  if (!s) {
    main.innerHTML = '<header><h1>Fant ikke selskapet</h1><p class="lead"><a href="selskaper/">Se alle selskapene kommunen eier</a>.</p></header>';
    return;
  }
  setCanonical('selskaper/' + s.id);
  const b = s.brreg || {}, y = D.aar, L = latest(s), E = ownEquity(s);
  const formText = FORMS[s.form] || s.form;
  const lead = `${s.navn} er et ${formText}${b.kommune ? ` med forretningsadresse i ${b.kommune}` : ''}. `
    + (s.eierandel == null ? 'Narvik kommune har andeler i selskapet, men årsregnskapet oppgir ikke hvor stor andel.' : s.eierandel === 100 ? 'Narvik kommune eier hele selskapet.' : `Narvik kommune eier ${share(s.eierandel)}.`);
  const stats = [
    ['Kommunens eierandel', share(s.eierandel), `31.12.${y}`, rs(D.noter[s.note + '_side'])],
    ['Bokført verdi i kommunens balanse', kr(s.bokfort), `31.12.${y}`, rs(D.noter[s.note + '_side'])],
    E ? [`Kommunens andel av egenkapitalen${calcTag}`, kr(E.v), `${share(s.eierandel)} av ${kr(L.r.egenkapital)} egenkapital i ${L.typ === 'konsern' ? 'konsernet' : 'selskapet'} 31.12.${L.y}`, `<a href="${brregAcc(s.orgnr)}" target="_blank" rel="noopener">Regnskapsregisteret</a> og årsregnskapet`]
    : L ? [`Egenkapital${L.typ === 'konsern' ? ', konsern' : ''}`, kr(L.r.egenkapital), `31.12.${L.y}, selskapets eget regnskap`, `<a href="${brregAcc(s.orgnr)}" target="_blank" rel="noopener">Regnskapsregisteret</a>`]
      : ['Ansatte', b.ansatte != null ? nb(b.ansatte) : '·', 'registrert i Enhetsregisteret', `<a href="${brregPage(s.orgnr)}" target="_blank" rel="noopener">Enhetsregisteret</a>`],
  ];
  main.innerHTML = `<header><nav class="crumbs" aria-label="Brødsmuler"><a href="selskaper/">Kommunalt eide selskaper</a><span aria-hidden="true">›</span><span aria-current="page">${h(s.navn)}</span></nav>
      <div class="eyebrow">${h(b.form || formText)} · org.nr. ${h(s.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'))}</div>
      <h1>${h(s.navn)}</h1><p class="lead">${h(lead)}</p>
      ${b.under_avvikling ? '<p class="status-note">Selskapet er registrert som under avvikling i Enhetsregisteret.</p>' : ''}${b.konkurs ? '<p class="status-note">Selskapet er registrert som konkurs i Enhetsregisteret.</p>' : ''}</header>
    <section aria-label="Nøkkeltall"><div class="stats3">${stats.map(([l, big, sub, src]) => `<div class="stat"><span class="sub">${l}</span><span class="big num">${big}</span><span class="sub">${sub}</span><span class="caption">Kilde: ${src}</span></div>`).join('')}</div></section>
    <section aria-labelledby="h-acc" id="regnskap"></section>
    <section aria-labelledby="h-own" id="eierskap"></section>
    <section aria-labelledby="h-about" id="om"></section>`;
  drawAccounts(s, accType(s));
  drawOwnership(s);
  drawAbout(s);
  document.getElementById('sources').innerHTML = `${rs(D.noter[s.note + '_side'], D.kilder[D.kilde].full)}`
    + (s.em_side ? `; ${em(s.em_side)}` : '')
    + `; <a href="${brregPage(s.orgnr)}" target="_blank" rel="noopener">Enhetsregisteret</a>${s.regnskap && Object.keys(s.regnskap).length ? ` og <a href="${brregAcc(s.orgnr)}" target="_blank" rel="noopener">Regnskapsregisteret</a>` : ''}, Brønnøysundregistrene (NLOD).`;
}

const LINES = [
  ['driftsinntekter', 'Driftsinntekter'], ['driftskostnader', 'Driftskostnader'], ['lonn', 'Herav lønnskostnader', true],
  ['driftsresultat', 'Driftsresultat'], ['finans', 'Netto finansposter'], ['aarsresultat', 'Årsresultat'],
  ['eiendeler', 'Sum eiendeler'], ['egenkapital', 'Egenkapital'], ['gjeld', 'Gjeld'], ['langsiktig_gjeld', 'Herav langsiktig gjeld', true],
];

function drawAccounts(s, typ) {
  const sec = document.getElementById('regnskap');
  const head = '<div class="section-head"><h2 id="h-acc">Selskapets regnskap</h2>';
  if (!typ) {
    const why = s.form === 'KF'
      ? 'Et kommunalt foretak er en del av kommunen og leverer ikke regnskap til Regnskapsregisteret. Regnskapet og årsberetningen behandles av kontrollutvalget og vedtas av kommunestyret.'
      : s.ingen_regnskap ? 'Dette er et innskudd i et pensjonsselskap, ikke et selskap kommunen har valgt å eie, så selskapets regnskap vises ikke her.'
        : 'Selskapet har ikke regnskap i Regnskapsregisteret. Interkommunale selskaper og samvirkeforetak som fører regnskap etter kommunale regler eller er små, leverer ikke alltid dit.';
    sec.innerHTML = `${head}<p class="lead">${why}</p></div><p class="savner-linje">Regnskapstallene for dette selskapet er ikke lagt inn ennå.</p>`;
    return;
  }
  const A = s.regnskap[typ], ys = Object.keys(A).sort();
  const both = s.regnskap.konsern && s.regnskap.selskap;
  const last = ys.at(-1);
  const old = +last < +D.aar - 1;
  sec.innerHTML = `${head}<p class="lead">${typ === 'konsern' ? `Tallene gjelder hele konsernet, det vil si ${h(s.navn)} med datterselskapene.` : `Tallene gjelder ${h(s.navn)} alene.`} Beløp i millioner kroner, fra selskapets årsregnskap slik det står i Regnskapsregisteret.${old ? ` Det siste regnskapet i registeret er for ${last}.` : ''}</p></div>
    ${both ? `<div class="seg cmp-pick" role="group" aria-label="Vis regnskap for">${[['konsern', 'Konsern'], ['selskap', 'Bare morselskapet']].map(([k, t]) => `<a href="#regnskap" data-typ="${k}"${k === typ ? ' aria-current="true"' : ''}>${t}</a>`).join('')}</div>` : ''}
    <div class="two">${[['driftsinntekter', 'Driftsinntekter'], ['aarsresultat', 'Årsresultat'], ['egenkapital', 'Egenkapital'], ['gjeld', 'Gjeld']].map(([k, t]) =>
      `<div class="chart-box"><h3>${t}, mill. kr</h3><div class="mini-chart">${columns(ys.map(y => ({ y, v: A[y][k] == null ? null : A[y][k] / 1e6 })), v => nb(v, Math.abs(v) < 10 ? 1 : 0), last)}</div></div>`).join('')}</div>
    <div class="ptable"><table id="acc-table"><thead><tr><th>Mill. kr</th>${ys.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
      ${LINES.filter(([k]) => ys.some(y => A[y][k] != null)).map(([k, t, sub]) => `<tr><td>${sub ? `<span class="muted">${t}</span>` : t}</td>${ys.map(y => `<td class="num">${mill(A[y][k])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="caption">Kilde: <a href="${brregAcc(s.orgnr)}" target="_blank" rel="noopener">Regnskapsregisteret, Brønnøysundregistrene</a>, ${typ === 'konsern' ? 'konsernregnskap' : 'selskapsregnskap'}${ys.length > 1 ? ` ${ys[0]}–${last}` : ` ${last}`}.${ys.some(y => A[y].revidert === false) ? ' Noen av årene er ikke revidert.' : ''}</p>`;
  sec.querySelectorAll('a[data-typ]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); drawAccounts(s, a.dataset.typ); }));
}

function drawOwnership(s) {
  const y = D.aar, side = D.noter[s.note + '_side'];
  const rows = [
    ['Eierandel', share(s.eierandel), rs(side)],
    ['Bokført verdi i kommunens balanse', `${kr(s.bokfort)} <span class="muted">31.12.${y}</span>`, rs(side)],
  ];
  if (s.gruppe) rows.push([`Gruppe ${s.gruppe} i eierskapsmeldingen`, h(D.grupper[s.gruppe]), em(D.grupper.side)]);
  (s.garantier || []).forEach(g => rows.push([`Garanti fra kommunen${g.type ? ` (${h(g.type.toLowerCase())})` : ''}`,
    `${kr(g.saldo)} <span class="muted">31.12.${y}${g.ramme ? `, ramme ${kr(g.ramme)}` : ''}${g.utloper ? `, utløper ${h(g.utloper)}` : ''}</span>`, rs(D.noter.garantier_side)]));
  if (s.gjeldsansvar) {
    const g = debtShare(s);
    rows.push(['Gjeldsansvar', `${h(D.lover[s.form === 'KF' ? 'kf' : 'iks'].tekst)}${g.text ? `<br><span class="muted">${g.text}</span>` : ''}`, `${rs(D.noter.gjeldsansvar_side)}; ${law(s.form === 'KF' ? 'kf' : 'iks')}`]);
  }
  const sec = document.getElementById('eierskap');
  sec.innerHTML = `<div class="section-head"><h2 id="h-own">Kommunens eierskap</h2>
      <p class="lead">Fra kommunens årsregnskap for ${y}${s.gruppe ? ' og eierskapsmeldingen fra 2022' : ''}.</p></div>
    <div class="ptable"><table id="own-table" class="own"><thead><tr><th>Hva</th><th>Verdi</th><th>Kilde</th></tr></thead><tbody>
      ${rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="wrap-cell">${b}</td><td>${c}</td></tr>`).join('')}
    </tbody></table></div>
    ${s.merknad ? `<p class="note-line">${h(s.merknad)}</p>` : ''}`;
  stackable(document.getElementById('own-table'));
}

function drawAbout(s) {
  const b = s.brreg || {};
  const date = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const web = b.hjemmeside ? `<a href="${h(/^https?:/.test(b.hjemmeside) ? b.hjemmeside : 'https://' + b.hjemmeside)}" target="_blank" rel="noopener">${h(b.hjemmeside)}</a>` : null;
  const facts = [
    ['Formål', b.formaal ? h(b.formaal) : null],
    ['Bransje', h(b.naering)],
    ['Ansatte', b.ansatte != null ? nb(b.ansatte) : null],
    ['Stiftet', b.stiftet ? date(b.stiftet) : null],
    ['Hjemmeside', web],
  ].filter(([, v]) => v);
  document.getElementById('om').innerHTML = `<div class="section-head"><h2 id="h-about">Om selskapet</h2></div>
    <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="caption">Kilde: <a href="${brregPage(s.orgnr)}" target="_blank" rel="noopener">Enhetsregisteret, Brønnøysundregistrene</a>. Formålet er slik det står i selskapets vedtekter.${s.em_side ? ` Eierskapsmeldingen beskriver selskapet og kommunens forventninger til det: ${em(s.em_side)}.` : ''}</p>`;
}

start();
