// Brew Pulse: one page app over data.json. Hash routes: #/today, #/browse/<kind>, #/item/<kind>/<n>, #/origins, #/search, #/about.
const KINDS = { styles: 'Styles', hops: 'Hops', yeasts: 'Yeasts', fermentables: 'Malts' };
const TABS = [['today', 'Today'], ['browse', 'Browse'], ['origins', 'Origins'], ['search', 'Search'], ['about', 'About']];
const ICON_FOR = { today: 'today', browse: 'browse', origins: 'map', search: 'search', about: 'about' };
const SRC = 'https://www.beer-analytics.com';
// Rough growing region per origin country, for the map (longitude, latitude).
const PLACES = {
  'United States': [-120, 46.5], 'Germany': [11.8, 48.6], 'Great Britain': [0.9, 51.2], 'Czech Republic': [13.5, 50.3],
  'New Zealand': [173, -41.3], 'Australia': [147, -42], 'Slovenia': [15, 46.2], 'Japan': [142, 43], 'Poland': [22.5, 51.2],
  'France': [7.5, 48.5], 'Belgium': [3, 50.8], 'Canada': [-123, 49.5], 'South Africa': [22.5, -33.9], 'China': [87, 44], 'Ukraine': [28.6, 50.3],
};
const MIN_SHARE = 0.5; // ignore movers below 0.5% of recipes, they swing on a handful of recipes
let D = null;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (k, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${k}"/></svg>`;
const badge = (k) => `<span class="badge k-${k}">${ico(k)}</span>`;
const pct = (v) => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`);
const pts = (v) => (v == null ? '' : `${v >= 0.05 ? '+' : v <= -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const tone = (v) => (v >= 0.05 ? 'up' : v <= -0.05 ? 'dn' : 'flat'); // matches the one decimal shown
const share = (v) => `${v.toFixed(v < 1 ? 2 : 1)}%`;
const num = (n) => n.toLocaleString('en-GB');
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortName = (n) => n.replace(/^[^·]+·\s*/, ''); // "Fermentis · Safale US-05" -> "Safale US-05"

// Every trend row with its kind, newest value and the matching list entry (for its link and count).
function trendRows() {
  const out = [];
  for (const kind of ['styles', 'hops', 'yeasts']) {
    for (const which of ['popular', 'trending']) {
      for (const r of D.trends[kind][which]) {
        if (out.some((o) => o.kind === kind && o.name === r.name)) continue;
        const v = r.values.filter((x) => x != null);
        out.push({ ...r, kind, which, now: v[v.length - 1], entry: findEntry(kind, r.name) });
      }
    }
  }
  return out;
}
function findEntry(kind, name) {
  const i = D.lists[kind].findIndex((e) => e.name === name);
  return i < 0 ? null : { i, ...D.lists[kind][i] };
}
const itemHref = (kind, entry) => (entry ? `#/item/${kind}/${entry.i}` : `#/browse/${kind}`);

function spark(values, w = 300, h = 90, color) {
  const v = values.map((x) => x ?? null);
  const nums = v.filter((x) => x != null);
  if (nums.length < 2) return '';
  const mn = Math.min(...nums), mx = Math.max(...nums), r = mx - mn || 1;
  const pts = v.map((y, i) => (y == null ? null : `${(i * (w - 4) / (v.length - 1) + 2).toFixed(1)},${(h - 4 - (y - mn) / r * (h - 10)).toFixed(1)}`)).filter(Boolean);
  const c = color || (nums[nums.length - 1] >= nums[0] ? 'var(--green)' : 'var(--red)');
  const area = `2,${h} ${pts.join(' ')} ${w - 2},${h}`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Share of recipes over time">
    <polygon points="${area}" fill="${c}" opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------- views ----------
function today() {
  const rows = trendRows().filter((r) => r.pct != null && r.now >= MIN_SHARE);
  const risers = [...rows].sort((a, b) => b.pct - a.pct).filter((r) => r.pct > 0).slice(0, 2);
  const fallers = [...rows].sort((a, b) => a.pct - b.pct).filter((r) => r.pct < 0).slice(0, 2);
  const up = risers[0], down = fallers[0];
  const title = up && down ? `${shortName(up.name)} is up ${up.pct}%. ${shortName(down.name)} is down ${Math.abs(down.pct)}%.` : 'This month in brewing';
  const focus = down || up;
  const vals = focus ? focus.values.filter((x) => x != null) : [];
  const peak = vals.length ? Math.max(...vals) : 0;
  const lede = focus ? `${shortName(focus.name)} is in ${share(focus.now)} of recipes, against a peak of ${share(peak)} in the last three years.` : '';
  const tile = (r) => `<a class="card tile" href="${itemHref(r.kind, r.entry)}">${badge(r.kind)}<span class="nm">${esc(shortName(r.name))}</span><span><span class="v ${tone(r.pct)}">${pct(r.pct)}</span><br><small>now ${share(r.now)} of recipes</small></span></a>`;
  const col = (kind) => {
    const list = [...D.trends[kind].popular].map((r) => ({ ...r, kind, now: r.values[r.values.length - 1], entry: findEntry(kind, r.name) })).sort((a, b) => b.now - a.now);
    return `<section class="card list"><h3>${badge(kind)}Top ${KINDS[kind].toLowerCase()}</h3>
      ${list.map((r, i) => `<a class="row" href="${itemHref(kind, r.entry)}"><span class="i">${i + 1}</span><span class="n">${esc(shortName(r.name))}</span><span class="s">${share(r.now)}</span><span class="c ${tone(r.pts)}">${pts(r.pts)}</span>${ico('chev', 'chev')}</a>`).join('')}</section>`;
  };
  return `<p class="eyebrow">${monthName(D.months[D.months.length - 1])}</p><h1 class="lt">Today</h1>
    <section class="card story"><div><h1>${esc(title)}</h1><p>${esc(lede)}</p></div>
      ${focus ? `<div><div class="chart-head"><span>${esc(shortName(focus.name))}<small>share of recipes</small></span><span class="${tone(focus.pct)}">${pct(focus.pct)}<small>on last year</small></span></div>${spark(focus.values)}<div class="axis"><span>${esc(D.months[0])}</span><span>${esc(D.months[D.months.length - 1])}</span></div></div>` : ''}</section>
    <div class="sec"><h2>Movers</h2><span class="eyebrow">change on last year</span></div>
    <div class="movers">${[...risers, ...fallers].map(tile).join('')}</div>
    <div class="sec"><h2>Most used</h2><span class="eyebrow">share of recipes · points on last year</span></div>
    <div class="cols">${col('styles')}${col('hops')}${col('yeasts')}</div>
    <div class="sec"><h2>Where the hops grow</h2><a href="#/origins">See map</a></div>
    ${originsCard(4)}`;
}

function browse(kind = 'hops', limit = 50) {
  if (!KINDS[kind]) kind = 'hops';
  const list = D.lists[kind];
  const total = list.reduce((s, e) => s + e.count, 0);
  const seg = Object.entries(KINDS).map(([k, t]) => `<a href="#/browse/${k}" ${k === kind ? 'aria-current="page"' : ''}>${t}</a>`).join('');
  return `<p class="eyebrow">${num(list.length)} ${KINDS[kind].toLowerCase()} · all time</p><h1 class="lt">Browse</h1>
    <div class="seg" role="tablist">${seg}</div>
    <div class="sec"><h2>By number of recipes</h2></div>
    <div class="colh"><span>#</span><span>Name</span><span>Recipes</span><span>Share</span><span></span></div>
    <section class="card list" id="blist">${rowsHtml(kind, list.slice(0, limit), total)}
    ${limit < list.length ? `<button class="more" data-more="${kind}" data-limit="${limit + 100}">Show more</button>` : ''}</section>`;
}
function rowsHtml(kind, items, total) {
  return items.map((e) => {
    const i = D.lists[kind].indexOf(e);
    return `<a class="row" href="#/item/${kind}/${i}"><span class="i">${i + 1}</span><span class="n">${esc(e.name)}${e.group ? `<small>${esc(e.group)}</small>` : ''}</span><span class="s">${num(e.count)}</span><span class="c flat">${(e.count / total * 100).toFixed(1)}%</span>${ico('chev', 'chev')}</a>`;
  }).join('');
}

function item(kind, i) {
  const e = D.lists[kind] && D.lists[kind][+i];
  if (!e) return browse(kind);
  const t = ['popular', 'trending'].flatMap((w) => (D.trends[kind]?.[w] || [])).find((r) => r.name === e.name);
  const rank = +i + 1;
  const now = t ? t.values.filter((x) => x != null).pop() : null;
  return `<p class="eyebrow"><a href="#/browse/${kind}">${KINDS[kind]}</a>${e.group ? ` · ${esc(e.group)}` : ''}</p>
    <h1 class="lt">${esc(e.name)}</h1>
    <div class="facts"><div class="card fact"><b>${num(e.count)}</b><span>recipes use it</span></div>
      <div class="card fact"><b>#${rank}</b><span>of ${num(D.lists[kind].length)} ${KINDS[kind].toLowerCase()}</span></div>
      ${e.origin ? `<div class="card fact"><b>${esc(e.origin)}</b><span>origin</span></div>` : now != null ? `<div class="card fact"><b>${share(now)}</b><span>of recipes this month</span></div>` : ''}</div>
    ${t ? `<section class="card detail"><div class="chart-head"><span>Share of recipes<small>last three years</small></span><span class="${tone(t.pct)}">${pct(t.pct)}<small>on last year</small></span></div>${spark(t.values, 600, 160)}<div class="axis"><span>${esc(D.months[0])}</span><span>${esc(D.months[D.months.length - 1])}</span></div></section>` : ''}
    <section class="card prose"><p>Dosage, pairings, typical styles and sample recipes for ${esc(e.name)} are on its full Beer Analytics page.</p>
      <a class="btn" href="${SRC}${esc(e.url)}" rel="noopener">${ico('out')}Full analysis on Beer Analytics</a></section>`;
}

function originsCard(limit) {
  const W = 360, H = 150, PAD = 24, x = (lon) => PAD + (lon + 130) / 310 * (W - 2 * PAD), y = (lat) => PAD / 2 + (70 - lat) / 120 * (H - PAD);
  const placed = D.origins.filter((g) => PLACES[g.country]);
  const dots = placed.map((g) => {
    const [lon, lat] = PLACES[g.country];
    const r = Math.max(3, Math.sqrt(g.share) * 2.6);
    return `<circle class="dot" cx="${x(lon).toFixed(1)}" cy="${y(lat).toFixed(1)}" r="${r.toFixed(1)}"><title>${esc(g.country)} ${g.share}%</title></circle>`;
  }).join('');
  const grid = [1, 2, 3].map((k) => `<path d="M0 ${k * H / 4}h${W}"/>`).join('') + [1, 2, 3, 4, 5].map((k) => `<path d="M${k * W / 6} 0v${H}"/>`).join('');
  const legend = D.origins.slice(0, limit).map((g) => `<div class="leg"><span>${esc(g.flag)} ${esc(g.country)}<small>${g.hops.slice(0, 3).map(esc).join(', ')}</small></span><b>${g.share}%</b></div>`).join('');
  return `<section class="card mapcard"><svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hop origins map"><g class="grid">${grid}</g>${dots}</svg><div>${legend}</div></section>`;
}
function origins() {
  const legend = D.origins.map((g) => `<div class="leg"><span>${esc(g.flag)} ${esc(g.country)}<small>${g.hops.slice(0, 3).map(esc).join(', ')}</small></span><b>${g.share}%</b></div>`).join('');
  return `<p class="eyebrow">Hops by origin country</p><h1 class="lt">Origins</h1>
    <section class="card osmcard"><div id="osm" role="img" aria-label="Map of hop growing regions"></div></section>
    <section class="card prose">${legend}</section>
    <p class="note">Weighted by recipe count across the ${D.origin_hops} most used hops. Where a hop lists several origins the first one counts. Circle size follows share. Map data from OpenStreetMap.</p>`;
}

// Leaflet loads only when the Origins page opens, pinned to 1.9.4 with integrity hashes.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let leafletReady = null;
function loadLeaflet() {
  leafletReady ??= new Promise((ok, fail) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${LEAFLET}leaflet.css`, integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', crossOrigin: '' });
    const js = Object.assign(document.createElement('script'), { src: `${LEAFLET}leaflet.js`, integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=', crossOrigin: '', onload: ok, onerror: fail });
    document.head.append(css, js);
  });
  return leafletReady;
}
function initMap() {
  loadLeaflet().then(() => {
    const el = $('#osm');
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true }).setView([30, 20], 1);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 8, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const pts = [];
    for (const g of D.origins) {
      const p = PLACES[g.country];
      if (!p) continue;
      const ll = [p[1], p[0]];
      pts.push(ll);
      L.circleMarker(ll, { radius: Math.max(6, Math.sqrt(g.share) * 4), color: '#248a3d', weight: 2, fillColor: '#34c759', fillOpacity: .35 })
        .bindPopup(`<b>${esc(g.flag)} ${esc(g.country)}</b><br>${g.share}% of hop use<br><small>${g.hops.slice(0, 5).map(esc).join(', ')}</small>`)
        .addTo(map);
    }
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 3 });
  }).catch(() => { const el = $('#osm'); if (el) el.innerHTML = '<p class="note" style="padding:14px">The map could not load. The list below has every country.</p>'; });
}

function search(q = '') {
  return `<p class="eyebrow">Styles, hops, yeasts and malts</p><h1 class="lt">Search</h1>
    <input class="search" id="q" type="search" placeholder="Citra, Hazy IPA, US-05…" value="${esc(q)}" autocomplete="off" aria-label="Search">
    <section class="card list" id="results" style="margin-top:16px">${results(q)}</section>`;
}
function results(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return '<p class="note" style="padding:0 14px 14px">Type at least two letters.</p>';
  const hits = Object.keys(KINDS).flatMap((k) => D.lists[k].map((e, i) => ({ k, e, i }))).filter(({ e }) => e.name.toLowerCase().includes(q)).slice(0, 40);
  if (!hits.length) return '<p class="note" style="padding:0 14px 14px">Nothing found.</p>';
  return hits.map(({ k, e, i }) => `<a class="row" href="#/item/${k}/${i}">${badge(k)}<span class="n">${esc(e.name)}<small>${KINDS[k]}${e.group ? ` · ${esc(e.group)}` : ''}</small></span><span class="s">${num(e.count)}</span><span class="c flat">recipes</span>${ico('chev', 'chev')}</a>`).join('');
}

const WORK = [
  ['Craft Beer School', 'https://craftbeerschool.in/', 'Free brewing and whisky guides plus courses for brewers in India and beyond.'],
  ['Brewhouse ERP', 'https://ankurnapa.github.io/brewery-erp-india/', 'A free ERP for Indian microbreweries and brewpubs. Grain to glass: recipes, stores, brewing, packaging, kegs, taproom sales plus the excise register.'],
  ['Winery ERP', null, 'The same free ERP rebuilt for wineries, from grape intake to bottling.'],
  ['Beverage-AI Radar', 'https://ankurnapa.github.io/beverage-ai-radar/', 'A tracker of companies applying AI to beer, whisky and wine.'],
  ['Brewery Intelligence for Microsoft Fabric', null, 'A Fabric workload that turns a brewery\'s own Excel files into a lakehouse with dashboards. AI maps the columns. A brewer confirms them once.'],
  ['Intelligence Layer video series', null, 'Ten short episodes on how an AI layer reads a plant\'s own SOPs to find the cause of a problem.'],
  ['Responsible AI video series', null, 'Six episodes on keeping brewery data and AI governed: data stays in the client\'s tenant with a named person signing off every AI suggestion.'],
  ['Trends in Brewing 2027', null, 'Talk submitted on Brewery Intelligence: mapping messy plant files with one-time brewer confirmation.'],
];
function about() {
  const work = WORK.map(([t, href, d]) => href ? `<a class="card" href="${href}" rel="noopener"><b>${t}</b><span>${d}</span></a>` : `<div class="card"><b>${t}</b><span>${d}</span></div>`).join('');
  return `<p class="eyebrow">Credits</p><h1 class="lt">About</h1>
    <section class="card prose"><h2>Built on Beer Analytics</h2>
      <p>Every number here comes from <a href="${SRC}" rel="noopener">Beer Analytics</a>, created by homebrewer and software engineer Christian Scheb. He gathers brewing recipes from homebrewing communities online and analyses what goes into them. The analysis is his work. Please visit his site, star the <a href="https://github.com/scheb/beer-analytics" rel="noopener">project on GitHub</a> or buy him a beer through the link on his about page.</p>
      <p>His content is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>. Brew Pulse adapts it under the same licence. Recipes belong to their authors, so none are copied here: every item links back to its page on Beer Analytics.</p></section>
    <section class="card prose"><h2>What Brew Pulse adds</h2>
      <p>A phone first view for people working in craft breweries who want this month's picture in a minute. It adds a monthly headline with movers worked out from the data, one place to browse every style, hop, yeast or malt by recipe count, a map of where the most used hops are grown, plus search. Data was refreshed on ${esc(D.updated)}.</p></section>
    <section class="card prose"><h2>Made by Ankur Napa</h2>
      <p>Ankur builds data and AI tools for brewers and distillers. Other things he has built for beer and AI:</p>
      <div class="work">${work}</div>
      <p style="margin-top:14px">More on <a href="https://github.com/AnkurNapa" rel="noopener">GitHub</a>.</p></section>`;
}

// ---------- shell ----------
function chrome(route) {
  const links = TABS.map(([k, t]) => `<a href="#/${k}" ${k === route ? 'aria-current="page"' : ''}>${ico(ICON_FOR[k])}<span>${t}</span></a>`).join('');
  $('#top nav').innerHTML = links;
  $('#tabbar').innerHTML = links;
}
function render() {
  const [route = 'today', a, b] = location.hash.replace(/^#\/?/, '').split('/');
  const views = { today, browse: () => browse(a), item: () => item(a, b), origins, search: () => search(decodeURIComponent(a || '')), about };
  const view = views[route] || today;
  chrome(route === 'item' ? 'browse' : views[route] ? route : 'today');
  $('#view').innerHTML = view();
  window.scrollTo(0, 0);
  if (route === 'origins') initMap();
  const q = $('#q');
  if (q) { q.focus(); q.addEventListener('input', () => { $('#results').innerHTML = results(q.value); }); }
}
document.addEventListener('click', (ev) => {
  const more = ev.target.closest('[data-more]');
  if (!more) return;
  const kind = more.dataset.more, limit = +more.dataset.limit;
  const y = window.scrollY;
  $('#view').innerHTML = browse(kind, limit);
  window.scrollTo(0, y);
});
window.addEventListener('hashchange', render);
fetch('data.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => { D = d; render(); })
  .catch(() => { $('#view').innerHTML = '<h1 class="lt">Could not load the data</h1><p class="note">Refresh the page to try again.</p>'; });
