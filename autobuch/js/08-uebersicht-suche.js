'use strict';
// Autobuch – Tank-Prognose, Übersicht anpassen, Suche und große Schrift.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Tank-Prognose ---------- */

// Schätzt aus Verbrauch, Fahrleistung und letzter Tankfüllung, wann wieder getankt werden muss
function fuelForecast() {
  const cons = consumption().avg, kpd = kmPerDay(), tank = state.car.tank || 50;
  const fills = [...state.fuel].sort((a, b) => a.km - b.km);
  const full = [...fills].reverse().find((f) => f.full);
  if (!full || !kpd || !(cons >= 3 && cons <= 20)) return null;
  const sinceDays = Math.max(0, -daysUntil(full.date));
  const kmNow = Math.max(currentKm() ?? full.km, full.km + kpd * sinceDays);
  const addLiters = fills.filter((f) => f.km > full.km && !f.full).reduce((s, f) => s + f.liters, 0);
  const liters = Math.min(tank, tank - (kmNow - full.km) * cons / 100 + addLiters);
  const reserve = tank * 0.1;
  const kmLeft = Math.max(0, (liters - reserve) / cons * 100);
  return { level: Math.max(0, liters / tank), kmLeft, date: addDays(kmLeft / kpd), days: Math.round(kmLeft / kpd), kpd, cons };
}

function renderForecast() {
  const fc = fuelForecast();
  document.querySelectorAll('.fc-body').forEach((el) => {
    const home = el.closest('[data-sec]');
    if (!fc) {
      el.innerHTML = `<p class="empty" style="margin:0">${tr('Ab zwei vollen Tankfüllungen schätzt die App, wann du wieder tanken musst.')}</p>`;
      return;
    }
    el.innerHTML = `
      <div class="title">${fc.days <= 0 ? tr('Bald tanken: Reserve erreicht') : tr('Voraussichtlich tanken am {date} (in {n} Tagen)', { date: fmtDate(fc.date), n: fc.days })}</div>
      <div class="fuelbar" role="img" aria-label="${tr('Geschätzter Tankinhalt: {p} %', { p: fmtNum(fc.level * 100, 0) })}"><i class="${fc.level < 0.2 ? 'low' : ''}" style="width:${fc.level * 100}%"></i></div>
      <div class="meta">${tr('Noch ca. {km} km bis zur Reserve · Tank ca. {p} % voll', { km: fmtNum(fc.kmLeft, 0), p: fmtNum(fc.level * 100, 0) })}</div>
      <p class="note" style="margin-bottom:0">${tr('Schätzung aus deinen Daten: Ø {kpd} km pro Tag, {cons} l/100 km.', { kpd: fmtNum(fc.kpd, 0), cons: fmtNum(fc.cons, 1) })}</p>`;
    if (home) home.dataset.empty = '';
  });
}

/* ---------- Übersicht anpassen ---------- */

const HOME_SECTIONS = [
  ['sos', 'Notfall-Knopf'], ['tiles', 'Werkzeug-Kacheln'], ['stats', 'Kennzahlen'], ['actions', 'Tanken & Ausgabe'],
  ['forecast', 'Tank-Prognose'], ['parking', 'Parkplatz'], ['due', 'Als Nächstes fällig'], ['chart', 'Kosten der letzten 12 Monate'],
];
const homeCfg = () => {
  const h = state.home || {};
  const known = HOME_SECTIONS.map(([k]) => k);
  const order = (h.order || []).filter((k) => known.includes(k));
  return { order: [...order, ...known.filter((k) => !order.includes(k))], hidden: h.hidden || [], tiles: h.tiles || [] };
};

function applyHome() {
  const view = $('#view-start'), end = $('#homeEdit'), cfg = homeCfg();
  for (const key of cfg.order) {
    const el = view.querySelector(`[data-sec="${key}"]`);
    view.insertBefore(el, end);
    el.hidden = cfg.hidden.includes(key);
  }
  view.querySelectorAll('.tiles button').forEach((b) => { b.hidden = cfg.tiles.includes(b.dataset.view); });
}

function homeForm() {
  const cfg = homeCfg();
  let order = [...cfg.order];
  const tiles = [...document.querySelectorAll('#view-start .tiles button')].map((b) => [b.dataset.view, tr(TITLES[b.dataset.view])]);
  const label = (k) => tr(HOME_SECTIONS.find(([x]) => x === k)[1]);
  const rows = () => order.map((k, i) => `<div class="home-row">
      <label><input type="checkbox" name="sec_${k}" ${cfg.hidden.includes(k) ? '' : 'checked'}> ${label(k)}</label>
      <button type="button" class="small" data-move="${i}:-1" aria-label="${tr('Nach oben')}" ${i ? '' : 'disabled'}>↑</button>
      <button type="button" class="small" data-move="${i}:1" aria-label="${tr('Nach unten')}" ${i < order.length - 1 ? '' : 'disabled'}>↓</button>
    </div>`).join('');
  openSheet('Übersicht anpassen', `
    <p class="note" style="margin-top:0">${tr('Wähle aus, was auf der Übersicht erscheint, und ordne es mit den Pfeilen.')}</p>
    <div id="homeRows">${rows()}</div>
    <fieldset style="margin-top:14px"><legend>${tr('Werkzeug-Kacheln')}</legend>
      ${tiles.map(([v, n]) => `<div class="home-row"><label><input type="checkbox" name="tile_${v}" ${cfg.tiles.includes(v) ? '' : 'checked'}> ${n}</label></div>`).join('')}
    </fieldset>
    <button type="button" class="link" id="homeReset" style="width:100%;margin-top:6px">${tr('Auf Standard zurücksetzen')}</button>
  `, (d) => {
    state.home = {
      order,
      hidden: order.filter((k) => !d['sec_' + k]),
      tiles: tiles.map(([v]) => v).filter((v) => !d['tile_' + v]),
    };
  });
  $('#homeRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-move]');
    if (!b) return;
    // Häkchen merken, damit sie beim Umsortieren erhalten bleiben
    cfg.hidden = order.filter((k) => !sheetForm['sec_' + k].checked);
    const [i, dir] = b.dataset.move.split(':').map(Number);
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    $('#homeRows').innerHTML = rows();
  });
  $('#homeReset').addEventListener('click', () => { state.home = null; sheet.close(); save(); });
}

/* ---------- Suche ---------- */

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Alle Einträge des aktiven Fahrzeugs als durchsuchbare Liste
function searchIndex() {
  const out = [];
  const add = (icon, view, title, meta, text, open) => out.push({ icon, view, title, meta, hay: fold([title, meta, text].join(' ')), open });
  state.fuel.forEach((f) => add('⛽', 'fuel', tr('Tankfüllung'), `${fmtDate(f.date)} · ${fmtNum(f.km)} km · ${fmtEUR(f.total)}`, [f.station, f.liters], () => fuelForm(f)));
  state.costs.forEach((c) => add('€', 'costs', tr(c.cat), `${fmtDate(c.date)} · ${fmtEUR(c.amount)}${c.note ? ' · ' + c.note : ''}`, [c.cat, c.km], () => costForm(c)));
  state.trips.forEach((t) => add('🛣', 'trips', `${t.from || '?'} → ${t.to || '?'}`, `${fmtDate(t.date)} · ${tr(TRIP_LABEL[t.type])}${t.purpose ? ' · ' + t.purpose : ''}`, [t.partner], () => tripForm(t)));
  state.maint.forEach((m) => add('🔧', 'maint', tr(m.name), m.lastDate ? tr('Zuletzt') + ': ' + fmtDate(m.lastDate) : '', [m.info && tr(m.info), m.name], () => maintForm(m)));
  state.tires.forEach((t) => add('🛞', 'maint', tr(t.name), [t.brand, t.size, t.dot && 'DOT ' + t.dot].filter(Boolean).join(' · '), [t.location, t.note, t.season], () => { showSub('reifen'); tireForm(t); }));
  state.documents.forEach((d) => add('📄', 'help', d.title || tr(d.type), [d.title && tr(d.type), d.expires && fmtDate(d.expires)].filter(Boolean).join(' · '), [d.note, d.type], () => docForm(d)));
  state.accidents.forEach((a) => add('🚨', 'help', tr('Unfall') + (a.place ? ': ' + a.place : ''), fmtDate(a.date.slice(0, 10)), [a.notes, a.otherName, a.otherPlate, a.witnesses, a.policeRef], () => accidentForm(a)));
  state.fines.forEach((f) => add('🧾', 'fines', tr(f.type), `${fmtDate(f.date)} · ${fmtEUR(f.amount || 0)}`, [f.authority, f.ref, f.note], () => fineForm(f)));
  state.recurring.forEach((r) => add('🔁', 'costs', r.name, `${fmtEUR(r.amount)} · ${tr(INTERVAL_LABEL[r.interval])}`, [r.cat], () => recurringForm(r)));
  state.garages.forEach((g) => add('🔧', 'garages', g.name, g.address, [g.phone, g.contact, g.note, g.hours], () => garageForm(g)));
  state.values.forEach((v) => add('📉', 'value', tr('Wert') + ': ' + fmtEUR(v.value, 0), fmtDate(v.date), [v.note], () => valueForm(v)));
  state.logs.forEach((l) => add(l.kind === 'oil' ? '🛢' : '🛞', 'logs', tr(l.kind === 'oil' ? 'Öl nachgefüllt' : 'Reifendruck geprüft'), fmtDate(l.date), [l.note], () => logForm(l, l.kind)));
  return out;
}

function searchSheet() {
  const index = searchIndex();
  let hits = [];
  openSheet('Suchen', `
    <label class="field"><span class="sr-only">${tr('Suchbegriff')}</span><input type="search" id="searchInput" autocomplete="off" placeholder="${esc(tr('z. B. Bremsen, Michelin, Kunde …'))}"></label>
    <div id="searchResults"><p class="note">${tr('Durchsucht Tankbuch, Kosten, Fahrten, Wartung, Reifen, Dokumente, Unfälle, Strafzettel und Werkstätten.')}</p></div>
  `, () => {}, { submitLabel: 'Schließen' });
  const input = $('#searchInput'), box = $('#searchResults');
  const mark = (s, words) => words.reduce((h, w) => h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'), esc(s));
  input.addEventListener('input', () => {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    if (!words.length) { box.innerHTML = ''; return; }
    hits = index.filter((x) => words.every((w) => x.hay.includes(w))).slice(0, 50);
    const raw = input.value.trim().split(/\s+/);
    box.innerHTML = hits.length ? hits.map((x, i) => `<button type="button" class="sr" data-sr="${i}">
        <span aria-hidden="true">${x.icon}</span><span class="grow"><span class="title">${mark(x.title, raw)}</span><span class="meta">${mark(x.meta || '', raw)}</span></span></button>`).join('')
      : `<p class="empty">${tr('Nichts gefunden')}</p>`;
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sr]');
    if (!b) return;
    const hit = hits[+b.dataset.sr];
    sheet.close();
    setTimeout(() => { showView(hit.view); hit.open(); }, 60);
  });
  input.focus();
}

/* ---------- Große Schrift (Bedienungshilfen) ---------- */

// Übernimmt die iOS-Textgröße („Einstellungen → Anzeige & Helligkeit → Textgröße“) für die App
function applyTextSize() {
  const probe = document.createElement('div');
  probe.style.font = '-apple-system-body';
  if (!probe.style.font) return; // nur Safari kennt diese Systemschrift
  probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
  document.body.append(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (size) document.documentElement.style.setProperty('--ui-scale', Math.min(1.3, Math.max(1, size / 17)).toFixed(3));
}
