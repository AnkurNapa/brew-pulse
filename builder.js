// Recipe builder. Same maths as Brewhouse ERP: gravity from extract and efficiency, IBU by Tinseth,
// colour by Morey, FG from the yeast's apparent attenuation. Values default from typical figures
// and every one can be overwritten with the number on the brewer's own packet.

const WHIRLPOOL_FACTOR = 0.5; // whirlpool hops isomerise at roughly half boil utilisation
const HOP_ALPHA = { // typical alpha acid %, check the packet
  Cascade: 6, Citra: 12, Centennial: 10, Amarillo: 9, Magnum: 13, Saaz: 3.5, 'East Kent Golding': 5, Simcoe: 13,
  Columbus: 15, Chinook: 13, 'Hallertauer Mittelfrüh': 4, Mosaic: 12, Fuggle: 4.5, 'Northern Brewer': 8.5, Perle: 8,
  Tettnanger: 4.5, 'Nelson Sauvin': 12, Galaxy: 14, Willamette: 5, 'Styrian Golding': 5, Warrior: 16, Nugget: 13,
  Hersbrucker: 3, 'Hallertauer Tradition': 6, Challenger: 7.5, Target: 11, Motueka: 7, 'Sorachi Ace': 12, Ekuanot: 14, 'Idaho 7': 13,
};
const HOP_GROUP_ALPHA = { Aroma: 5, 'Dual Purpose': 10, Bittering: 12 };
const YEAST_ATTEN = { Ale: 75, Lager: 78, Wheat: 74, 'Brett Bacteria': 82, 'Wine Cider': 85 };
const EXTRACT = { Grain: 78, Sugar: 100, Extract: 80, Fruit: 8, Spice_Herb: 0 };
const MALT_EBC = [ // first match wins
  [/chocolate/i, 900], [/roast|black/i, 1200], [/special b/i, 290], [/brown/i, 130], [/melanoidin/i, 60], [/biscuit|amber/i, 50],
  [/munich light/i, 15], [/munich/i, 20], [/carahell/i, 20], [/vienna/i, 8], [/rye/i, 7], [/pale ale|maris|golden promise/i, 6],
  [/carapils|carafoam|pilsner|lager/i, 3.5], [/wheat|acidulated/i, 4], [/flaked|oat/i, 3], [/sugar|honey|dextrose/i, 0],
];
const SRM_HEX = ['#FFE699', '#FFD878', '#FFCA5A', '#FFBF42', '#FBB123', '#F8A600', '#F39C00', '#EA8F00', '#E58500', '#DE7C00',
  '#D77200', '#CF6900', '#CB6200', '#C35900', '#BB5100', '#B54C00', '#B04500', '#A63E00', '#A13700', '#9B3200', '#952D00',
  '#8E2900', '#882300', '#821E00', '#7B1A00', '#771900', '#701400', '#6A0E00', '#660D00', '#5E0B00', '#5A0A02', '#600903',
  '#520907', '#4C0505', '#470606', '#440607', '#3F0708', '#3B0607', '#3A070B', '#36080A'];
// The site's own name for crystal 40L, looked up so it always matches the ingredient list.
const crystal40 = () => D.lists.fermentables.find((e) => /crystal.*\b40L$/i.test(e.name))?.name || 'Crystal 40L';
const BLANK = () => ({
  name: 'My pale ale', style: 'American Pale Ale', size: 20, eff: 72, boil: 60,
  malts: [{ n: 'Pale Ale Malt', kg: 4.5 }, { n: crystal40(), kg: 0.3 }],
  hops: [{ n: 'Magnum', g: 15, min: 60, use: 'Boil' }, { n: 'Cascade', g: 30, min: 10, use: 'Boil' }, { n: 'Citra', g: 50, min: 0, use: 'Dry hop' }],
  yeast: { n: 'Safale American Ale' },
});
const STORE = 'brewpulse.recipe', SAVED = 'brewpulse.saved';
let R = null;

// ---------- maths ----------
const sgFromP = (p) => 1 + p / (258.6 - (p / 258.2) * 227.1);
const abvOf = (og, fg) => (og > fg && fg > 0 ? 76.08 * (og - fg) / (1.775 - og) * (fg / 0.794) : 0);
function platoOf(extractKg, litres) { // solve extract kg = litres x SG x Plato / 100
  let p = litres ? extractKg / litres * 100 : 0;
  for (let k = 0; k < 6; k++) p = litres ? extractKg / (litres * sgFromP(p)) * 100 : 0;
  return p;
}
const entryOf = (kind, name) => D.lists[kind].find((e) => e.name === name);
const maltGroup = (n) => entryOf('fermentables', n)?.group || 'Grain';
function maltExtract(m) {
  if (m.ext != null && m.ext !== '') return +m.ext;
  const g = maltGroup(m.n);
  if (g === 'Grain' && /crystal|caramel|roast|black|chocolate/i.test(m.n)) return 72;
  if (g === 'Grain' && /flaked|oat/i.test(m.n)) return 75;
  return EXTRACT[g] ?? 78;
}
function maltEbc(m) {
  if (m.ebc != null && m.ebc !== '') return +m.ebc;
  const lov = m.n.match(/(\d+)\s*L\b/);
  if (lov) return +lov[1] * 1.97;
  return (MALT_EBC.find(([re]) => re.test(m.n)) || [0, maltGroup(m.n) === 'Grain' ? 6 : 0])[1];
}
const hopAlpha = (h) => (h.aa != null && h.aa !== '' ? +h.aa : HOP_ALPHA[h.n] ?? HOP_GROUP_ALPHA[entryOf('hops', h.n)?.group] ?? 8);
const yeastAtten = (y) => (y.att != null && y.att !== '' ? +y.att : /US-05|American Ale/i.test(y.n) ? 78 : YEAST_ATTEN[entryOf('yeasts', y.n)?.group] ?? 75);

function calc(r) {
  const size = +r.size || 0, eff = (+r.eff || 72) / 100;
  // Grain is mashed, so brewhouse efficiency applies. Sugars, extract and fruit dissolve fully.
  const extract = r.malts.reduce((s, m) => s + (+m.kg || 0) * maltExtract(m) / 100 * (maltGroup(m.n) === 'Grain' ? eff : 1), 0);
  const og = sgFromP(platoOf(extract, size));
  const fg = 1 + (og - 1) * (1 - yeastAtten(r.yeast) / 100);
  const ibu = r.hops.reduce((s, h) => {
    const min = +h.min || 0;
    if (h.use === 'Dry hop' || min <= 0 || !size) return s;
    const util = 1.65 * 0.000125 ** (og - 1) * (1 - Math.exp(-0.04 * min)) / 4.15 * (h.use === 'Whirlpool' ? WHIRLPOOL_FACTOR : 1);
    return s + util * hopAlpha(h) / 100 * (+h.g || 0) * 1000 / size;
  }, 0);
  const mcu = size ? 8.345 * r.malts.reduce((s, m) => s + (+m.kg || 0) * maltEbc(m) / 1.97, 0) / size : 0;
  const srm = mcu ? 1.4922 * mcu ** 0.6859 : 0;
  return { og, fg, abv: abvOf(og, fg), ibu, srm, ebc: srm * 1.97, grain: r.malts.reduce((s, m) => s + (+m.kg || 0), 0) };
}

// ---------- storage: per viewer, never required ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: recipe lives for this visit only */ } };
const toLink = (r) => `${location.origin}${location.pathname}#/build/${btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
function fromLink(code) {
  try {
    const r = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
    return Array.isArray(r.malts) && Array.isArray(r.hops) && r.yeast ? r : null;
  } catch { return null; }
}

// ---------- view ----------
function hint(kind, name) {
  const t = ['popular', 'trending'].flatMap((w) => D.trends[kind]?.[w] || []).find((x) => x.name === name);
  if (t) return `in ${share(t.values[t.values.length - 1])} of recipes this month`;
  const i = D.lists[kind].findIndex((e) => e.name === name);
  return i < 0 ? 'custom ingredient' : `#${i + 1} of ${num(D.lists[kind].length)} by recipes`;
}
const field = (path, value, attrs = '') => `<input class="bf" data-f="${path}" value="${esc(value ?? '')}" ${attrs}>`;
const numf = (path, value, attrs = '') => field(path, value, `inputmode="decimal" ${attrs}`);

function build(code) {
  if (code) { const shared = fromLink(code); if (shared) { R = shared; keep(STORE, R); history.replaceState(null, '', '#/build'); } }
  R ??= load(STORE, null) || BLANK();
  const malts = R.malts.map((m, i) => `<div class="brow"><div class="bmain">${field(`malts.${i}.n`, m.n, 'list="dl-fermentables" aria-label="Fermentable"')}<small>${esc(hint('fermentables', m.n))}</small></div>
    <label>kg${numf(`malts.${i}.kg`, m.kg)}</label><label>Extract %${numf(`malts.${i}.ext`, m.ext, `placeholder="${maltExtract({ ...m, ext: null })}"`)}</label>
    <label>EBC${numf(`malts.${i}.ebc`, m.ebc, `placeholder="${+maltEbc({ ...m, ebc: null }).toFixed(0)}"`)}</label><button class="bx" data-del="malts.${i}" aria-label="Remove">×</button></div>`).join('');
  const hops = R.hops.map((h, i) => `<div class="brow"><div class="bmain">${field(`hops.${i}.n`, h.n, 'list="dl-hops" aria-label="Hop"')}<small>${esc(hint('hops', h.n))}</small></div>
    <label>g${numf(`hops.${i}.g`, h.g)}</label><label>Alpha %${numf(`hops.${i}.aa`, h.aa, `placeholder="${hopAlpha({ ...h, aa: null })}"`)}</label>
    <label>Min${numf(`hops.${i}.min`, h.min)}</label><label>Use<select class="bf" data-f="hops.${i}.use">${['Boil', 'Whirlpool', 'Dry hop'].map((u) => `<option ${u === h.use ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <button class="bx" data-del="hops.${i}" aria-label="Remove">×</button></div>`).join('');
  const styled = D.lists.styles.filter((e) => e.range);
  const saved = load(SAVED, []);
  return `<p class="eyebrow">Recipe builder</p><h1 class="lt">Build</h1>
    <datalist id="dl-fermentables">${D.lists.fermentables.map((e) => `<option value="${esc(e.name)}">`).join('')}</datalist>
    <datalist id="dl-hops">${D.lists.hops.map((e) => `<option value="${esc(e.name)}">`).join('')}</datalist>
    <datalist id="dl-yeasts">${D.lists.yeasts.map((e) => `<option value="${esc(e.name)}">`).join('')}</datalist>
    <div class="bgrid">
      <div>
        <section class="card bcard"><div class="bhead"><h3>Batch</h3></div>
          <div class="brow b4"><label class="wide">Name${field('name', R.name)}</label>
          <label>Litres${numf('size', R.size)}</label><label>Efficiency %${numf('eff', R.eff)}</label><label>Boil min${numf('boil', R.boil)}</label></div>
          <div class="brow"><label class="wide">Target style<select class="bf" data-f="style"><option value="">None</option>${styled.map((e) => `<option ${e.name === R.style ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label></div></section>
        <section class="card bcard"><div class="bhead">${badge('fermentables')}<h3>Malts and sugars</h3><button class="badd" data-add="malts">Add</button></div>${malts}</section>
        <section class="card bcard bhops"><div class="bhead">${badge('hops')}<h3>Hops</h3><button class="badd" data-add="hops">Add</button></div>${hops}</section>
        <section class="card bcard"><div class="bhead">${badge('yeasts')}<h3>Yeast</h3></div>
          <div class="brow"><div class="bmain">${field('yeast.n', R.yeast.n, 'list="dl-yeasts" aria-label="Yeast"')}<small>${esc(hint('yeasts', R.yeast.n))}</small></div>
          <label>Attenuation %${numf('yeast.att', R.yeast.att, `placeholder="${yeastAtten({ ...R.yeast, att: null })}"`)}</label></div></section>
        <p class="note">Grey numbers are typical values. Type the figures from your own packets for a sharper result.</p>
      </div>
      <aside class="bside"><section class="card bcard" id="bres">${buildResults()}</section>
        <section class="card bcard"><div class="bhead"><h3>Save and share</h3></div>
          <div class="bact"><button class="btn2" data-act="save">Save in this browser</button><button class="btn2" data-act="share">Copy share link</button><button class="btn2 ghost" data-act="new">New recipe</button></div>
          <p class="note" id="bmsg" aria-live="polite"></p>
          ${saved.length ? `<div class="bsaved">${saved.map((s, i) => `<div class="leg"><button class="linkb" data-open="${i}">${esc(s.name)}</button><button class="bx" data-unsave="${i}" aria-label="Delete saved recipe">×</button></div>`).join('')}</div>` : ''}
        </section></aside>
    </div>`;
}

function buildResults() {
  const c = calc(R);
  const style = D.lists.styles.find((e) => e.name === R.style && e.range);
  const metric = (label, key, value, fmt) => {
    const rng = style?.range[key];
    const ok = rng ? value >= rng[0] && value <= rng[1] : null;
    let bar = '';
    if (rng) {
      const lo = rng[0] - (rng[1] - rng[0]) * .6, hi = rng[1] + (rng[1] - rng[0]) * .6, pos = (v) => Math.min(100, Math.max(0, (v - lo) / (hi - lo) * 100));
      bar = `<div class="bbar"><span class="bband" style="left:${pos(rng[0])}%;width:${pos(rng[1]) - pos(rng[0])}%"></span><span class="bdot ${ok ? 'in' : 'out'}" style="left:${pos(value)}%"></span></div><small>${fmt(rng[0])} to ${fmt(rng[1])}</small>`;
    }
    return `<div class="bm"><span>${label}</span><b class="${ok === false ? 'dn' : ''}">${fmt(value)}</b>${bar}</div>`;
  };
  const swatch = SRM_HEX[Math.min(SRM_HEX.length - 1, Math.max(0, Math.round(c.srm) - 1))];
  const ins = style ? ['og', 'fg', 'abv', 'ibu', 'srm'].filter((k) => { const v = { og: c.og, fg: c.fg, abv: c.abv, ibu: c.ibu, srm: c.srm }[k]; return v >= style.range[k][0] && v <= style.range[k][1]; }).length : 0;
  return `<div class="bhead"><span class="glass" style="background:${swatch}"></span><h3>${esc(R.name || 'Your recipe')}</h3></div>
    ${style ? `<p class="note" style="margin:0 0 8px">${ins} of 5 inside what brewers brew for ${esc(style.name)} (middle 80% of its recipes).</p>` : ''}
    ${metric('Original gravity', 'og', c.og, (v) => v.toFixed(3))}${metric('Final gravity', 'fg', c.fg, (v) => v.toFixed(3))}
    ${metric('ABV', 'abv', c.abv, (v) => `${v.toFixed(1)}%`)}${metric('Bitterness IBU', 'ibu', c.ibu, (v) => v.toFixed(0))}
    ${metric('Colour SRM', 'srm', c.srm, (v) => v.toFixed(1))}
    <p class="note" style="margin:8px 0 0">${c.ebc.toFixed(0)} EBC · ${c.grain.toFixed(2)} kg of malt and sugar</p>`;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}
function rerender() { const y = scrollY; $('#view').innerHTML = build(); scrollTo(0, y); }
function flash(text) { const m = $('#bmsg'); if (m) m.textContent = text; }

function initBuilder() {
  const view = $('#view');
  if (view.dataset.builder) return;
  view.dataset.builder = '1';
  view.addEventListener('input', (ev) => {
    const f = ev.target.closest('.bf');
    if (!f || !R) return;
    setPath(R, f.dataset.f, f.value);
    keep(STORE, R);
    $('#bres').innerHTML = buildResults();
    const hintEl = f.parentElement.querySelector('small');
    if (hintEl && /\.n$/.test(f.dataset.f)) hintEl.textContent = hint({ malts: 'fermentables', hops: 'hops', yeast: 'yeasts' }[f.dataset.f.split('.')[0]], f.value);
  });
  view.addEventListener('change', (ev) => { if (ev.target.closest('.bf') && /\.n$|style/.test(ev.target.dataset.f)) rerender(); });
  view.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-add],[data-del],[data-act],[data-open],[data-unsave]');
    if (!t || !R) return;
    if (t.dataset.add === 'malts') R.malts.push({ n: 'Pilsner Malt', kg: 1 });
    if (t.dataset.add === 'hops') R.hops.push({ n: 'Cascade', g: 20, min: 15, use: 'Boil' });
    if (t.dataset.del) { const [list, i] = t.dataset.del.split('.'); R[list].splice(+i, 1); }
    if (t.dataset.open) R = structuredClone(load(SAVED, [])[+t.dataset.open]);
    if (t.dataset.unsave) { const s = load(SAVED, []); s.splice(+t.dataset.unsave, 1); keep(SAVED, s); }
    if (t.dataset.act === 'new') R = { ...BLANK(), name: 'New recipe', malts: [], hops: [] };
    if (t.dataset.act === 'save') { keep(SAVED, [...load(SAVED, []).filter((s) => s.name !== R.name), structuredClone(R)]); }
    if (t.dataset.act === 'share') {
      const link = toLink(R);
      (navigator.clipboard?.writeText(link) || Promise.reject()).then(() => flash('Link copied. Anyone who opens it gets this recipe.'), () => flash(link));
      return;
    }
    keep(STORE, R);
    rerender();
    if (t.dataset.act === 'save') flash('Saved in this browser.');
  });
}
