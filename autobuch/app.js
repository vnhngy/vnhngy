'use strict';

/* ---------- Daten ---------- */

const STORE_KEY = 'autobuch-v1';
const APP_VERSION = '13'; // bei jedem Update zusammen mit VERSION in sw.js erhöhen
const COST_CATS = ['Werkstatt', 'Versicherung', 'Kfz-Steuer', 'Reifen', 'Pflege', 'Parken', 'Sonstiges'];

// Richtwerte für eine Mercedes A-Klasse W176 (Baujahr 2015). Im Serviceheft prüfen.
function defaultMaint(fuel) {
  const items = [
    { id: 'service', name: 'Mercedes-Service (ASSYST)', months: 12, km: 25000, alt: ['A', 'B'], altLabel: 'Service',
      info: 'Service A und B wechseln sich ab. Die genaue Fälligkeit zeigt auch das Kombiinstrument an.' },
    { id: 'hu', name: 'Hauptuntersuchung (HU/TÜV)', months: 24, km: 0, info: 'Alle 2 Jahre. Den Monat siehst du auf der Plakette am Kennzeichen.' },
    { id: 'brake', name: 'Bremsflüssigkeit wechseln', months: 24, km: 0, info: 'Wird meist beim Service mitgemacht.' },
    { id: 'tires', name: 'Reifenwechsel', months: 6, km: 0, alt: ['Winterreifen', 'Sommerreifen'], altLabel: '',
      info: 'Faustregel: von O bis O (Oktober bis Ostern) Winterreifen.' },
  ];
  if (fuel !== 'Diesel') {
    items.push({ id: 'plugs', name: 'Zündkerzen', months: 0, km: 75000, info: 'Richtwert, bitte im Serviceheft nachsehen.' });
  }
  return items.map((m) => ({ lastDate: '', lastKm: null, lastAlt: '', ...m }));
}

function freshState() {
  return {
    car: { name: 'Mercedes A 180', variant: 'AMG Line', year: '2015', fuel: 'Benzin', km: null, tank: 50 },
    fuel: [], costs: [], maint: defaultMaint('Benzin'), theme: 'auto',
    prices: { key: '', type: 'e5', rad: 5 }, parking: null,
    trips: [], tires: [], mounted: null,
    drives: [], documents: [],
    docs: { plate: '', vin: '', insurer: '', policy: '', claimPhone: '', breakdown: '' }, accidents: [],
    lang: null, onboarded: false, checks: {}, garages: [],
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch (e) { /* Speicher nicht verfügbar: mit leeren Daten starten */ }
  return freshState();
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  render();
}

/* ---------- Hilfsfunktionen ---------- */

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Versteht Eingaben wie "42,5", "42.5", "1.234,56", "1,234.56" und "98.500"
const num = (v) => {
  let s = String(v ?? '').replace(/[\s€]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = LANG === 'en' && /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (LANG !== 'en' && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
};
const today = () => new Date().toISOString().slice(0, 10);

const fmtEUR = (v, d = 2) => v == null ? '–' : v.toLocaleString(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d });
const fmtNum = (v, d = 0) => v == null ? '–' : v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
// Für Eingabefelder: ohne Tausendertrennzeichen, damit num() es sicher zurückliest
const fmtIn = (v, d = 2) => v == null || v === '' ? '' : Number(v).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const fmtDate = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const fmtMonth = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : '–';

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
}
const addDays = (n, from = today()) => {
  const d = new Date(from + 'T12:00:00');
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
};
const daysUntil = (dateStr) => Math.round((new Date(dateStr + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);

/* ---------- Berechnungen ---------- */

function currentKm() {
  const all = [state.car.km, ...state.fuel.map((f) => f.km), ...state.costs.map((c) => c.km), ...state.maint.map((m) => m.lastKm), ...state.trips.map((t) => t.endKm)];
  const vals = all.filter((v) => typeof v === 'number' && isFinite(v));
  return vals.length ? Math.max(...vals) : null;
}

// Verbrauch je volle Tankfüllung: alle Liter seit der letzten vollen Füllung / gefahrene km.
function consumption() {
  const fills = [...state.fuel].sort((a, b) => a.km - b.km);
  const per = {}, segs = [];
  let lastFull = null, liters = 0, totalL = 0, totalKm = 0;
  for (const f of fills) {
    liters += f.liters;
    if (!f.full) continue;
    if (lastFull) {
      const dist = f.km - lastFull.km;
      if (dist > 0) { per[f.id] = liters / dist * 100; totalL += liters; totalKm += dist; segs.push({ date: f.date, liters, dist }); }
    }
    lastFull = f; liters = 0;
  }
  return { per, segs, avg: totalKm > 0 ? totalL / totalKm * 100 : null };
}

// Alle Ausgaben inkl. Tanken als eine Liste.
function allExpenses() {
  return [
    ...state.fuel.map((f) => ({ date: f.date, amount: f.total, cat: 'Kraftstoff' })),
    ...state.costs.map((c) => ({ date: c.date, amount: c.amount, cat: c.cat })),
  ];
}

// Ø gefahrene km pro Tag laut Tankbuch, für Schätzungen bei km-Intervallen
function kmPerDay() {
  const f = [...state.fuel].sort((a, b) => a.date.localeCompare(b.date));
  if (f.length < 2) return null;
  const days = daysUntil(f[f.length - 1].date) - daysUntil(f[0].date);
  const km = Math.max(...f.map((x) => x.km)) - Math.min(...f.map((x) => x.km));
  return days >= 14 && km > 0 ? km / days : null;
}

function nextAlt(m) {
  if (!m.alt) return '';
  const i = m.alt.indexOf(m.lastAlt);
  return m.alt[(i + 1) % m.alt.length];
}

function maintStatus(m) {
  const cur = currentKm();
  const next = m.alt ? (m.altLabel ? tr(m.altLabel) + ' ' : '') + tr(nextAlt(m)) : '';
  if (!m.lastDate && m.lastKm == null) return { cls: 'unknown', label: tr('Unbekannt'), text: tr('Trag ein, wann es zuletzt gemacht wurde.'), score: 1e9 - 1, next, due: '' };
  let dueDate = null, days = null, dueKm = null, kmLeft = null, estDate = null;
  if (m.months && m.lastDate) { dueDate = addMonths(m.lastDate, m.months); days = daysUntil(dueDate); }
  if (m.km && m.lastKm != null) { dueKm = m.lastKm + m.km; kmLeft = cur != null ? dueKm - cur : null; }
  const kpd = kmPerDay();
  if (kmLeft != null && kpd) estDate = addDays(Math.max(0, kmLeft) / kpd);
  const over = (days != null && days < 0) || (kmLeft != null && kmLeft < 0);
  const soon = (days != null && days <= 30) || (kmLeft != null && kmLeft <= 1500);
  const parts = [];
  if (dueDate) parts.push(tr('am <b>{date}</b>', { date: fmtDate(dueDate) })
    + (days != null ? ` (${days < 0 ? tr('seit {n} Tagen', { n: -days }) : days === 0 ? tr('heute') : tr('in {n} Tagen', { n: days })})` : ''));
  if (dueKm != null) parts.push(tr('bei <b>{km} km</b>', { km: fmtNum(dueKm) })
    + (kmLeft != null ? ` (${kmLeft < 0 ? tr('{km} km drüber', { km: fmtNum(-kmLeft) }) : tr('noch {km} km', { km: fmtNum(kmLeft) }) + (estDate ? ', ' + tr('ca. {month}', { month: fmtMonth(estDate) }) : '')})` : ''));
  const due = parts.join(' ' + tr('oder') + ' ');
  // Sortier-Wert: je kleiner, desto dringender (km in Tage umgerechnet)
  const score = Math.min(days ?? Infinity, kmLeft != null ? kmLeft / (kpd || 40) : Infinity);
  return {
    cls: over ? 'over' : soon ? 'soon' : 'ok',
    label: over ? tr('⚠︎ Überfällig') : soon ? tr('⏱ Bald fällig') : tr('✓ In Ordnung'),
    text: (next ? tr('Als Nächstes: <b>{next}</b>.', { next: esc(next) }) + ' ' : '') + (parts.length ? tr('Fällig {when}.', { when: due }) : tr('Kein Intervall gesetzt.')),
    score, next, due,
    // Datum für den Kalender: was zuerst eintritt
    calDate: [dueDate, estDate].filter(Boolean).sort()[0] || null,
  };
}

/* ---------- Anzeige ---------- */

function render() {
  applyTheme();
  const c = state.car;
  $('#carLine').textContent = [c.name, c.variant, c.year, tr(c.fuel)].filter(Boolean).join(' · ');

  const km = currentKm();
  const cons = consumption();
  const year = new Date().getFullYear();
  const exp = allExpenses();
  const yearExp = exp.filter((e) => e.date && e.date.startsWith(String(year)));
  const yearSum = yearExp.reduce((s, e) => s + e.amount, 0);

  // Übersicht
  $('#sKm').innerHTML = km != null ? `${fmtNum(km)} <small>km</small>` : '–';
  $('#sCons').innerHTML = cons.avg != null ? `${fmtNum(cons.avg, 1)} <small>l/100</small>` : '–';
  $('#sYearLabel').textContent = year;
  $('#sYear').textContent = fmtEUR(yearSum, 0);
  const kms = state.fuel.map((f) => f.km);
  const driven = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0;
  // Kosten pro km: alles seit der ersten Tankfüllung, ohne die erste Füllung selbst
  if (driven > 0) {
    const first = [...state.fuel].sort((a, b) => a.km - b.km)[0];
    const total = exp.filter((e) => e.date >= first.date).reduce((s, e) => s + e.amount, 0) - first.total;
    $('#sPerKm').innerHTML = `${fmtNum(total / driven * 100, 0)} <small>ct</small>`;
  } else {
    $('#sPerKm').textContent = '–';
  }

  const ranked = state.maint.map((m) => ({ m, st: maintStatus(m) })).sort((a, b) => a.st.score - b.st.score);
  $('#startMaint').innerHTML = ranked.slice(0, 3).map(({ m, st }) => `
    <li><div class="grow"><div class="title">${esc(tr(m.name))}</div><div class="meta">${st.text}</div></div>
    <span class="pill ${st.cls}">${st.label}</span></li>`).join('') || `<li class="empty">${tr('Keine Termine')}</li>`;

  renderCostChart(exp);
  renderConsChart(cons);
  renderPark();
  renderPrices();
  renderTrips();
  renderTires();
  renderHelp();
  renderDrives();
  renderDocs();
  renderStats();
  renderChecks();
  renderPlan();
  renderGarages();

  // Tanken
  $('#fCons').innerHTML = $('#sCons').innerHTML;
  const lSum = state.fuel.reduce((s, f) => s + f.liters, 0);
  const eSum = state.fuel.reduce((s, f) => s + f.total, 0);
  $('#fPrice').textContent = lSum > 0 ? fmtEUR(eSum / lSum, 3) : '–';
  const fuelSorted = [...state.fuel].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km);
  $('#fuelList').innerHTML = fuelSorted.map((f) => `
    <li data-edit-fuel="${f.id}">
      <div class="grow">
        <div class="title">${fmtDate(f.date)}${f.full ? '' : ` <span class="pill unknown">${tr('Teil')}</span>`}</div>
        <div class="meta">${fmtNum(f.km)} km · ${fmtNum(f.liters, 2)} l · ${fmtEUR(f.total / f.liters, 3)}/l${f.station ? ' · ' + esc(f.station) : ''}</div>
      </div>
      <div class="amount">${fmtEUR(f.total)}<div class="meta">${cons.per[f.id] != null ? fmtNum(cons.per[f.id], 1) + ' l/100' : ''}</div></div>
    </li>`).join('') || `<li class="empty">${tr('Noch keine Tankfüllung. Tipp oben auf „Tankfüllung eintragen“.')}</li>`;

  // Wartung
  $('#maintList').innerHTML = ranked.map(({ m, st }) => `
    <li class="maint-item">
      <div class="maint-head"><span class="title">${esc(tr(m.name))}</span><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="maint-body">${st.text}<br>${tr('Zuletzt')}: ${m.lastDate ? fmtDate(m.lastDate) : '–'}${m.lastKm != null ? ' ' + tr('bei {km} km', { km: fmtNum(m.lastKm) }) : ''}${m.lastAlt ? ' (' + esc(tr(m.lastAlt)) + ')' : ''}
      · ${tr('Intervall')}: ${[m.months ? tr('{n} Monate', { n: m.months }) : '', m.km ? fmtNum(m.km) + ' km' : ''].filter(Boolean).join(' / ') || '–'}
      ${m.info ? `<br><span style="font-size:13px">${esc(tr(m.info))}</span>` : ''}</div>
      <div class="maint-btns">
        <button class="small primary" data-done="${m.id}">${tr('Erledigt')}</button>
        <button class="small" data-edit-maint="${m.id}">${tr('Bearbeiten')}</button>
      </div>
    </li>`).join('');

  // Kosten
  $('#cYear').textContent = fmtEUR(yearSum, 0);
  $('#cFuel').textContent = fmtEUR(yearExp.filter((e) => e.cat === 'Kraftstoff').reduce((s, e) => s + e.amount, 0), 0);
  const byCat = {};
  yearExp.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amount; });
  $('#catList').innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => `
    <li><div class="grow"><div class="title">${esc(tr(cat))}</div><div class="meta">${fmtNum(v / yearSum * 100, 0)} %</div></div>
    <div class="amount">${fmtEUR(v)}</div></li>`).join('') || `<li class="empty">${tr('Dieses Jahr noch keine Ausgaben')}</li>`;
  const costSorted = [...state.costs].sort((a, b) => b.date.localeCompare(a.date));
  $('#costList').innerHTML = costSorted.map((cst) => `
    <li data-edit-cost="${cst.id}">
      <div class="grow"><div class="title">${esc(tr(cst.cat))}</div>
      <div class="meta">${fmtDate(cst.date)}${cst.note ? ' · ' + esc(cst.note) : ''}${cst.km != null ? ' · ' + fmtNum(cst.km) + ' km' : ''}${cst.photos?.length ? ' · 📎 ' + cst.photos.length : ''}</div></div>
      <div class="amount">${fmtEUR(cst.amount)}</div>
    </li>`).join('') || `<li class="empty">${tr('Noch keine Ausgaben (Tankfüllungen werden automatisch mitgezählt).')}</li>`;

  // Einstellungen
  const f = $('#carForm');
  if (document.activeElement?.form !== f) {
    f.name.value = c.name || ''; f.variant.value = c.variant || ''; f.year.value = c.year || '';
    f.fuel.value = c.fuel || 'Benzin'; f.km.value = c.km ?? ''; f.tank.value = c.tank ?? '';
  }
  const pf = $('#priceForm');
  if (document.activeElement?.form !== pf) {
    pf.key.value = state.prices.key || ''; pf.type.value = state.prices.type; pf.rad.value = String(state.prices.rad);
  }
  document.querySelectorAll('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === state.theme)));
  document.querySelectorAll('#langSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
}

// Tippen außerhalb eines Diagramms blendet dessen Tooltip aus
const chartHides = new Map();
document.addEventListener('pointerdown', (e) => { chartHides.forEach((hide, box) => { if (!box.contains(e.target)) hide(); }); });

// Balkendiagramm mit einer Reihe. items: [{ label, full, value }]
function barChart(box, items, { aria, tip: fmtTip, axis, empty }) {
  const max = Math.max(0, ...items.map((m) => m.value));
  if (!max) { box.innerHTML = `<p class="empty" style="margin:0">${empty}</p>`; chartHides.delete(box); return; }

  // "schöne" Obergrenze für die Achse
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const W = 340, H = 170, L = 40, B = 20, T = 8, R = 4;
  const cw = (W - L - R) / items.length, bw = Math.max(Math.min(cw - 6, 28), 4);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">`;
  [0, top / 2, top].forEach((g) => {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/>`;
    svg += `<text class="axis" x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${axis(g)}</text>`;
  });
  items.forEach((m, i) => {
    const x = L + i * cw + (cw - bw) / 2, yy = y(m.value), h = H - B - yy, r = Math.min(4, h, bw / 2);
    if (m.value > 0) {
      svg += `<path class="bar" data-i="${i}" d="M${x},${H - B} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${H - B} Z"/>`;
    }
    svg += `<text class="axis" x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${m.label}</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${L + i * cw}" y="${T}" width="${cw}" height="${H - T - B}"/>`;
  });
  svg += '</svg>';
  box.innerHTML = svg + '<div class="tip"></div>' +
    `<details class="table-view"><summary>${tr('Als Tabelle anzeigen')}</summary><table>${items.map((m) => `<tr><td>${m.full}</td><td>${fmtTip(m.value)}</td></tr>`).join('')}</table></details>`;

  const tip = $('.tip', box), svgEl = $('svg', box);
  const show = (i) => {
    const m = items[i];
    box.querySelectorAll('.bar').forEach((b) => b.classList.toggle('dim', +b.dataset.i !== i));
    const scale = svgEl.getBoundingClientRect().width / W;
    tip.innerHTML = `${m.full}: <b>${fmtTip(m.value)}</b>`;
    tip.style.display = 'block';
    const px = (L + i * cw + cw / 2) * scale;
    const half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(box.clientWidth - half, px)) + 'px';
    tip.style.top = (y(m.value) * scale - 6) + 'px';
  };
  const hide = () => { tip.style.display = 'none'; box.querySelectorAll('.bar').forEach((b) => b.classList.remove('dim')); };
  box.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('pointerenter', () => show(+h.dataset.i));
    h.addEventListener('pointerdown', () => show(+h.dataset.i));
  });
  svgEl.addEventListener('pointerleave', hide);
  chartHides.set(box, hide);
}

function renderCostChart(exp) {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: LANG === 'vi' ? String(d.getMonth() + 1) : d.toLocaleDateString(LOCALE, { month: 'narrow' }), full: d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }), value: 0 });
  }
  exp.forEach((e) => { const m = months.find((x) => e.date && e.date.startsWith(x.key)); if (m) m.value += e.amount; });
  barChart($('#costChart'), months, {
    aria: tr('Kosten pro Monat, letzte 12 Monate'),
    tip: (v) => fmtEUR(v),
    axis: (g) => fmtNum(g) + ' €',
    empty: tr('Noch keine Daten. Sobald du tankst oder Ausgaben einträgst, erscheint hier dein Verlauf.'),
  });
}

function renderConsChart(cons) {
  const fills = state.fuel.filter((f) => cons.per[f.id] != null).sort((a, b) => a.km - b.km).slice(-12);
  barChart($('#consChart'), fills.map((f) => {
    const d = new Date(f.date + 'T12:00:00');
    return { label: LANG === 'de' ? `${d.getDate()}.${d.getMonth() + 1}.` : `${d.getDate()}/${d.getMonth() + 1}`, full: fmtDate(f.date), value: cons.per[f.id] };
  }), {
    aria: tr('Verbrauch je Tankfüllung'),
    tip: (v) => fmtNum(v, 1) + ' l/100 km',
    axis: (g) => fmtNum(g, g % 1 ? 1 : 0) + ' l',
    empty: tr('Ab der zweiten vollen Tankfüllung siehst du hier deinen Verbrauch.'),
  });
}

/* ---------- Parkplatz ---------- */

function renderPark() {
  const p = state.parking, body = $('#parkBody');
  if (!p) {
    body.innerHTML = `<p class="note" style="margin:0 0 10px">${tr('Speichere, wo dein Auto steht, und finde später wieder hin.')}</p>
      <button class="primary" data-park="set" style="width:100%">${tr('📍 Hier geparkt')}</button>`;
    return;
  }
  const mins = Math.max(0, Math.round((Date.now() - p.time) / 60000));
  const ago = mins < 1 ? tr('gerade eben') : mins < 60 ? tr('vor {n} Min', { n: mins })
    : mins < 1440 ? tr('vor {h} Std {m} Min', { h: Math.floor(mins / 60), m: mins % 60 }) : tr('vor {n} Tagen', { n: Math.floor(mins / 1440) });
  let meter = '';
  if (p.until) {
    const left = Math.round((p.until - Date.now()) / 60000);
    meter = left >= 0
      ? `<span class="pill ${left <= 10 ? 'soon' : 'ok'}">${tr('⏱ Parkuhr: noch {n} Min', { n: left })}</span>`
      : `<span class="pill over">${tr('⚠︎ Parkuhr abgelaufen seit {n} Min', { n: -left })}</span>`;
  }
  body.innerHTML = `
    <div class="title">${tr('Seit {time} Uhr', { time: fmtTime(p.time) })} <span class="meta">(${ago})</span></div>
    ${p.note ? `<div class="meta">${esc(p.note)}</div>` : ''}
    ${p.lat == null ? `<div class="meta">${tr('Ohne Standort gespeichert')}</div>` : ''}
    ${meter ? `<div style="margin-top:6px">${meter}</div>` : ''}
    <div class="maint-btns">
      ${p.lat != null ? `<a class="btn primary" href="https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w" target="_blank" rel="noopener">${tr('🚶 Zum Auto')}</a>` : ''}
      <button class="small" data-park="edit">${tr('Notiz &amp; Parkuhr')}</button>
      <button class="small" data-park="clear">${tr('Weggefahren')}</button>
    </div>`;
}

function setParking() {
  const done = (lat, lng) => {
    state.parking = { lat, lng, time: Date.now(), note: '', until: null };
    save();
    parkForm();
  };
  if (!navigator.geolocation) return done(null, null);
  navigator.geolocation.getCurrentPosition(
    (pos) => done(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)),
    () => {
      alert(tr('Standort nicht verfügbar. Erlaube den Zugriff unter Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites. Der Parkplatz wird jetzt ohne Standort gespeichert.'));
      done(null, null);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function parkForm() {
  const p = state.parking;
  const until = p.until ? new Date(p.until).toTimeString().slice(0, 5) : '';
  openSheet('Parkplatz', `
    ${field('Notiz', 'note', p.note, 'placeholder="z. B. Parkhaus Ebene 2, Platz 117"')}
    ${field('Parkuhr läuft bis (optional)', 'until', until, 'type="time"')}
  `, (d) => {
    p.note = d.note.trim();
    if (d.until) {
      const [h, mi] = d.until.split(':').map(Number);
      const t = new Date();
      t.setHours(h, mi, 0, 0);
      if (t.getTime() < Date.now() - 3600000) t.setDate(t.getDate() + 1);
      p.until = t.getTime();
    } else {
      p.until = null;
    }
  });
}

setInterval(() => { if (state.parking) renderPark(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* ---------- Spritpreise (Tankerkönig) ---------- */

let prices = { loading: false, error: '', list: null, time: null };
const FUEL_NAMES = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };

function renderPrices() {
  const cfg = state.prices, body = $('#priceBody');
  if (!cfg.key) {
    body.innerHTML = `<p class="note" style="margin:0 0 10px">${tr('Zeigt die günstigsten Tankstellen in deiner Nähe. Dafür brauchst du einmalig einen kostenlosen Schlüssel von Tankerkönig.')}</p>
      <button data-view="more" style="width:100%">${tr('Einrichten')}</button>`;
    return;
  }
  let html = `<button class="primary" data-prices="load" style="width:100%" ${prices.loading ? 'disabled' : ''}>
    ${prices.loading ? tr('Lade …') : tr('🔄 {fuel} im Umkreis von {rad} km', { fuel: FUEL_NAMES[cfg.type], rad: cfg.rad })}</button>`;
  if (prices.error) html += `<p class="note" style="color:var(--bad)">${esc(prices.error)}</p>`;
  if (prices.list) {
    html += prices.list.length ? `<ul class="list" style="margin-top:12px">${prices.list.map((s, i) => `
      <li>
        <div class="grow">
          <div class="title">${esc(s.brand || s.name)}${i === 0 ? ` <span class="pill ok">${tr('Am günstigsten')}</span>` : ''}</div>
          <div class="meta">${esc(s.street)} ${esc(s.houseNumber || '')}, ${esc(s.place)} · ${fmtNum(s.dist, 1)} km</div>
        </div>
        <div class="amount">${fmtEUR(s.price, 3)}<br><a class="btn" href="https://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d" target="_blank" rel="noopener">${tr('Route')}</a></div>
      </li>`).join('')}</ul>`
      : `<p class="empty">${tr('Keine geöffnete Tankstelle mit diesem Kraftstoff im Umkreis.')}</p>`;
    html += `<p class="note" style="margin-bottom:0">${tr('Stand {time} Uhr · Daten: MTS-K über Tankerkönig (CC BY 4.0)', { time: prices.time })}</p>`;
  }
  body.innerHTML = html;
}

function loadPrices() {
  const cfg = state.prices;
  if (!navigator.geolocation) { prices.error = tr('Dieses Gerät kann den Standort nicht bestimmen.'); return renderPrices(); }
  prices = { ...prices, loading: true, error: '' };
  renderPrices();
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const url = 'https://creativecommons.tankerkoenig.de/json/list.php'
        + `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&rad=${cfg.rad}&sort=dist&type=all&apikey=${encodeURIComponent(cfg.key)}`;
      const data = await (await fetch(url)).json();
      if (!data.ok) throw new Error(data.message || tr('Unbekannter Fehler'));
      prices.list = data.stations
        .filter((s) => s.isOpen && typeof s[cfg.type] === 'number' && s[cfg.type] > 0)
        .map((s) => ({ ...s, price: s[cfg.type] }))
        .sort((a, b) => a.price - b.price || a.dist - b.dist)
        .slice(0, 10);
      prices.time = fmtTime(Date.now());
    } catch (e) {
      prices.error = e instanceof TypeError ? tr('Keine Verbindung zu Tankerkönig. Bist du online?') : tr('Tankerkönig meldet: {msg}', { msg: e.message });
    }
    prices.loading = false;
    renderPrices();
  }, () => {
    prices = { ...prices, loading: false, error: tr('Standort nicht verfügbar. Erlaube den Zugriff unter Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites.') };
    renderPrices();
  }, { timeout: 15000, maximumAge: 60000 });
}

/* ---------- Fahrtenbuch ---------- */

const TRIP_TYPES = ['Privat', 'Geschäftlich', 'Arbeitsweg'];
const TRIP_LABEL = { Privat: 'Privat', 'Geschäftlich': 'Geschäftlich', Arbeitsweg: 'Wohnung ↔ Arbeit' };
const BIZ_RATE = 0.30; // Pauschale für Dienstreisen mit dem eigenen Auto, € pro km
let tripYear = String(new Date().getFullYear());

function renderTrips() {
  const years = [...new Set([String(new Date().getFullYear()), ...state.trips.map((t) => t.date.slice(0, 4))])].sort().reverse();
  if (!years.includes(tripYear)) tripYear = years[0];
  $('#tripYear').innerHTML = years.map((y) => `<option ${y === tripYear ? 'selected' : ''}>${y}</option>`).join('');

  const trips = state.trips.filter((t) => t.date.startsWith(tripYear));
  const dist = (t) => t.endKm - t.startKm;
  const total = trips.reduce((s, t) => s + dist(t), 0);
  const byType = Object.fromEntries(TRIP_TYPES.map((k) => [k, trips.filter((t) => t.type === k).reduce((s, t) => s + dist(t), 0)]));
  $('#tKm').innerHTML = total ? `${fmtNum(total)} <small>km</small>` : '–';
  $('#tBiz').innerHTML = total ? `${fmtNum(byType['Geschäftlich'] / total * 100, 0)} <small>%</small>` : '–';
  $('#tripTypes').innerHTML = total ? TRIP_TYPES.map((k) => `
    <li><div class="grow"><div class="title">${tr(TRIP_LABEL[k])}</div>
      <div class="meta">${fmtNum(byType[k] / total * 100, 0)} %${k === 'Geschäftlich' && byType[k] ? ' · ' + tr('≈ {eur} Reisekosten (0,30 €/km)', { eur: fmtEUR(byType[k] * BIZ_RATE, 0) }) : ''}</div></div>
    <div class="amount">${fmtNum(byType[k])} km</div></li>`).join('')
    : `<li class="empty">${tr('Noch keine Fahrten in diesem Jahr')}</li>`;

  // Lücken: Start-km passt nicht zum Ende der vorherigen Fahrt
  const byKm = [...state.trips].sort((a, b) => a.startKm - b.startKm);
  const gap = {};
  byKm.forEach((t, i) => { if (i && t.startKm !== byKm[i - 1].endKm) gap[t.id] = t.startKm - byKm[i - 1].endKm; });

  const sorted = [...trips].sort((a, b) => b.date.localeCompare(a.date) || b.startKm - a.startKm);
  $('#tripList').innerHTML = sorted.map((t) => `
    <li data-edit-trip="${t.id}">
      <div class="grow">
        <div class="title">${esc(t.from || '?')} → ${esc(t.to || '?')}</div>
        <div class="meta">${fmtDate(t.date)} · ${tr(TRIP_LABEL[t.type])}${t.purpose ? ' · ' + esc(t.purpose) : ''}${t.partner ? ' · ' + esc(t.partner) : ''}</div>
        <div class="meta">${fmtNum(t.startKm)} – ${fmtNum(t.endKm)} km</div>
        ${gap[t.id] ? `<div class="meta ${gap[t.id] < 0 ? 'bad-text' : 'warn-text'}">${gap[t.id] < 0 ? tr('⚠︎ Überschneidet sich um {km} km mit der vorherigen Fahrt', { km: fmtNum(-gap[t.id]) }) : tr('⚠︎ Lücke von {km} km vor dieser Fahrt', { km: fmtNum(gap[t.id]) })}</div>` : ''}
      </div>
      <div class="amount">${fmtNum(dist(t))} km</div>
    </li>`).join('') || `<li class="empty">${tr('Tipp oben auf „Fahrt eintragen“.')}</li>`;
}

function tripForm(entry, prefill = {}) {
  const last = [...state.trips].sort((a, b) => b.endKm - a.endKm)[0];
  const e = entry || { date: today(), type: last?.type || 'Privat', from: last?.to || '', to: '', startKm: last?.endKm ?? currentKm() ?? '', endKm: '', purpose: '', partner: '', ...prefill };
  const places = [...new Set(state.trips.flatMap((t) => [t.from, t.to]).filter(Boolean))];
  openSheet(entry ? 'Fahrt bearbeiten' : 'Fahrt eintragen', `
    <div class="row2">
      ${field('Datum', 'date', e.date, 'type="date" required')}
      <label class="field"><span>${tr('Art')}</span><select name="type">${TRIP_TYPES.map((k) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${tr(TRIP_LABEL[k])}</option>`).join('')}</select></label>
    </div>
    <div class="row2">
      ${field('Von', 'from', e.from, 'list="placeList" placeholder="z. B. Zuhause"')}
      ${field('Nach', 'to', e.to, 'list="placeList" required placeholder="z. B. Stuttgart"')}
    </div>
    <datalist id="placeList">${places.map((pl) => `<option value="${esc(pl)}">`).join('')}</datalist>
    <div class="row2">
      ${field('km-Stand Start', 'startKm', e.startKm, 'inputmode="numeric" required')}
      ${field('km-Stand Ende', 'endKm', e.endKm, 'inputmode="numeric" required')}
    </div>
    ${field('Zweck', 'purpose', e.purpose, 'placeholder="bei Geschäftsfahrten Pflicht, z. B. Kundentermin"')}
    ${field('Geschäftspartner (optional)', 'partner', e.partner, 'placeholder="z. B. Firma Müller GmbH"')}
  `, (d) => {
    const startKm = num(d.startKm), endKm = num(d.endKm);
    if (startKm == null || endKm == null) return tr('Bitte km-Stand Start und Ende eingeben.');
    if (endKm <= startKm) return tr('Der km-Stand am Ende muss größer sein als am Start.');
    if (d.type === 'Geschäftlich' && !d.purpose.trim()) return tr('Bei Geschäftsfahrten ist der Zweck Pflicht (z. B. „Kundentermin“).');
    const rec = { id: entry?.id || uid(), date: d.date, type: d.type, from: d.from.trim(), to: d.to.trim(), startKm, endKm, purpose: d.purpose.trim(), partner: d.partner.trim() };
    if (entry) Object.assign(entry, rec); else state.trips.push(rec);
    tripYear = d.date.slice(0, 4);
    const drive = !entry && prefill.driveId && state.drives.find((x) => x.id === prefill.driveId);
    if (drive) drive.tripId = rec.id;
  }, { deleteFn: entry && (() => { state.trips = state.trips.filter((x) => x !== entry); }) });
}

function tripsCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Art', 'Von', 'Nach', 'Zweck', 'Geschäftspartner', 'km Start', 'km Ende', 'km gefahren'].map((h) => tr(h))];
  state.trips.filter((t) => t.date.startsWith(tripYear)).sort((a, b) => a.date.localeCompare(b.date) || a.startKm - b.startKm)
    .forEach((t) => rows.push([fmtDate(t.date), tr(TRIP_LABEL[t.type]), t.from, t.to, t.purpose, t.partner, t.startKm, t.endKm, t.endKm - t.startKm]));
  // BOM und das in der Sprache übliche Trennzeichen, damit Excel die Datei direkt richtig öffnet
  return '﻿' + rows.map((r) => r.map(q).join(LANG === 'en' ? ',' : ';')).join('\r\n') + '\r\n';
}

/* ---------- Reifen ---------- */

const SEASONS = ['Sommer', 'Winter', 'Ganzjahr'];
const POS = [['vl', 'VL'], ['vr', 'VR'], ['hl', 'HL'], ['hr', 'HR']]; // Kürzel werden mit tr() übersetzt

// DOT "2321" = Kalenderwoche 23 im Jahr 2021
function tireAge(dot) {
  const m = /^(\d{2})(\d{2})$/.exec(String(dot || '').trim());
  if (!m || +m[1] < 1 || +m[1] > 53) return null;
  const made = new Date(2000 + +m[2], 0, 1 + (+m[1] - 1) * 7);
  return (Date.now() - made) / (365.25 * 86400000);
}

function tireKm(t) {
  const cur = currentKm();
  return t.km + (state.mounted?.id === t.id && cur != null ? Math.max(0, cur - state.mounted.km) : 0);
}

function tireStatus(t) {
  const issues = [];
  let level = 0;
  const flag = (lvl, text) => { issues.push({ lvl, text }); level = Math.max(level, lvl); };
  if (t.tread) {
    const min = Math.min(...POS.map(([k]) => t.tread[k]).filter((v) => v != null));
    const rec = t.season === 'Sommer' ? 3 : 4;
    if (min < 1.6) flag(2, tr('Profil {mm} mm: unter dem gesetzlichen Minimum von 1,6 mm', { mm: fmtNum(min, 1) }));
    else if (min < rec) flag(1, tr('Profil {mm} mm: unter den empfohlenen {rec} mm, bald erneuern', { mm: fmtNum(min, 1), rec }));
  }
  const age = tireAge(t.dot);
  if (age != null && age >= 10) flag(2, tr('{n} Jahre alt: zu alt, bitte ersetzen', { n: fmtNum(Math.floor(age)) }));
  else if (age != null && age >= 6) flag(1, tr('{n} Jahre alt: Gummi härtet aus, jährlich prüfen lassen', { n: fmtNum(Math.floor(age)) }));
  if (t.season !== 'Sommer' && !t.alpine) flag(2, tr('Ohne Schneeflocken-Symbol nicht als Winterreifen zulässig'));
  if (!t.tread && !level) return { cls: 'unknown', label: tr('Profil nicht gemessen'), issues };
  return {
    cls: ['ok', 'soon', 'over'][level],
    label: tr(['✓ In Ordnung', '⏱ Prüfen', '⚠︎ Handeln'][level]),
    issues,
  };
}

function renderTires() {
  const mounted = state.tires.find((t) => t.id === state.mounted?.id);
  const box = $('#tireMounted');
  if (!state.tires.length) {
    box.innerHTML = `<h2>${tr('Am Auto')}</h2><p class="note" style="margin:0">${tr('Leg zuerst deine Reifensätze an, z. B. Sommer- und Winterreifen.')}</p>`;
  } else if (!mounted) {
    box.innerHTML = `<h2>${tr('Am Auto')}</h2><p class="note" style="margin:0 0 10px">${tr('Welcher Satz ist gerade montiert?')}</p>
      <button class="primary" data-open="tireSwap" style="width:100%">${tr('Montierten Satz festlegen')}</button>`;
  } else {
    box.innerHTML = `<h2>${tr('Am Auto')}</h2>
      <div class="title">${esc(tr(mounted.name))}</div>
      <div class="meta">${state.mounted.date ? tr('Montiert seit {date}', { date: fmtDate(state.mounted.date) }) : tr('Montiert')}${state.mounted.km != null ? ' ' + tr('bei {km} km', { km: fmtNum(state.mounted.km) }) : ''}</div>
      <button class="primary" data-open="tireSwap" style="width:100%;margin-top:12px">${tr('🔄 Reifen wechseln')}</button>`;
  }

  $('#tireList').innerHTML = state.tires.map((t) => {
    const st = tireStatus(t);
    const age = tireAge(t.dot);
    const isOn = mounted === t;
    return `
    <li class="maint-item">
      <div class="maint-head"><span class="title">${esc(tr(t.name))}${isOn ? ` <span class="pill ok">${tr('Montiert')}</span>` : ''}</span><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="maint-body">
        ${[tr(t.season + 'reifen'), t.brand, t.size].filter(Boolean).map(esc).join(' · ')}
        ${t.dot ? `<br>DOT ${esc(t.dot)}${age != null ? ' ' + tr('({n} Jahre alt)', { n: fmtNum(age, 1) }) : ''}` : ''}${t.season !== 'Sommer' ? ` · ${t.alpine ? tr('❄︎ Schneeflocken-Symbol') : tr('kein Schneeflocken-Symbol')}` : ''}
        <br>${tr('Gefahren')}: <b>${fmtNum(tireKm(t))} km</b>${!isOn && t.location ? ` · ${tr('Lager')}: ${esc(t.location)}` : ''}
        ${t.note ? `<br>${esc(t.note)}` : ''}
        ${st.issues.map((i) => `<br><span class="${i.lvl > 1 ? 'bad-text' : 'warn-text'}">⚠︎ ${esc(i.text)}</span>`).join('')}
      </div>
      ${t.tread ? `<div class="tread">${POS.map(([k, l]) => `<div>${tr(l)}<b>${t.tread[k] != null ? fmtNum(t.tread[k], 1) : '–'}</b></div>`).join('')}</div>
        <div class="meta" style="margin-top:4px">${tr('Profil in mm, gemessen am {date}', { date: fmtDate(t.tread.date) })}</div>` : ''}
      <div class="maint-btns">
        <button class="small primary" data-tread="${t.id}">${tr('Profil messen')}</button>
        <button class="small" data-edit-tire="${t.id}">${tr('Bearbeiten')}</button>
      </div>
    </li>`;
  }).join('') || `<li class="empty">${tr('Noch keine Reifensätze')}</li>`;
}

function tireForm(entry) {
  const e = entry || { name: '', season: 'Sommer', brand: '', size: '', dot: '', alpine: false, location: '', km: 0, note: '' };
  openSheet(entry ? 'Reifensatz bearbeiten' : 'Reifensatz hinzufügen', `
    <div class="row2">
      ${field('Name', 'name', e.name, 'placeholder="z. B. Winterreifen"')}
      <label class="field"><span>${tr('Saison')}</span><select name="season">${SEASONS.map((x) => `<option value="${x}" ${x === e.season ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></label>
    </div>
    ${field('Marke & Modell', 'brand', e.brand, 'placeholder="z. B. Michelin Alpin 6"')}
    <div class="row2">
      ${field('Größe', 'size', e.size, 'placeholder="z. B. 225/40 R18"')}
      ${field('DOT (4 Ziffern)', 'dot', e.dot, 'inputmode="numeric" maxlength="4" placeholder="z. B. 2321"')}
    </div>
    <p class="hint">${tr('Größe und DOT stehen auf der Reifenflanke. Die letzten 4 Ziffern der DOT-Nummer sind das Herstelldatum: 2321 = Woche 23 im Jahr 2021.')}</p>
    <label class="check"><input type="checkbox" name="alpine" ${e.alpine ? 'checked' : ''}> ${tr('Schneeflocken-Symbol (Berg mit Schneeflocke)')}</label>
    ${field('Lagerort', 'location', e.location, 'placeholder="z. B. Keller oder Reifenhotel, Nr. 4711"')}
    ${field('Bisher gefahren (km)', 'km', entry ? tireKm(e) : '', 'inputmode="numeric" placeholder="falls bekannt"')}
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Felgen: Alu 18 Zoll"')}
  `, (d) => {
    if (d.dot && tireAge(d.dot) == null) return tr('Die DOT-Angabe muss 4 Ziffern haben, z. B. 2321.');
    const kmIn = num(d.km) || 0;
    const rec = {
      id: entry?.id || uid(), name: d.name.trim() || `${d.season}reifen`, season: d.season, brand: d.brand.trim(), size: d.size.trim(),
      dot: d.dot.trim(), alpine: d.alpine === 'on', location: d.location.trim(), note: d.note.trim(), tread: entry?.tread || null,
      km: 0,
    };
    rec.km = Math.max(0, kmIn - (entry ? tireKm(e) - e.km : 0));
    if (entry) Object.assign(entry, rec); else state.tires.push(rec);
  }, { deleteFn: entry && (() => {
    state.tires = state.tires.filter((x) => x !== entry);
    if (state.mounted?.id === entry.id) state.mounted = null;
  }) });
}

function treadForm(t) {
  const e = t.tread || {};
  openSheet(tr('Profil messen: {name}', { name: esc(tr(t.name)) }), `
    ${field('Datum', 'date', today(), 'type="date" required')}
    <div class="row2">
      ${field('Vorne links (mm)', 'vl', e.vl != null ? fmtIn(e.vl, 1) : '', 'inputmode="decimal"')}
      ${field('Vorne rechts (mm)', 'vr', e.vr != null ? fmtIn(e.vr, 1) : '', 'inputmode="decimal"')}
    </div>
    <div class="row2">
      ${field('Hinten links (mm)', 'hl', e.hl != null ? fmtIn(e.hl, 1) : '', 'inputmode="decimal"')}
      ${field('Hinten rechts (mm)', 'hr', e.hr != null ? fmtIn(e.hr, 1) : '', 'inputmode="decimal"')}
    </div>
    <p class="hint">${tr('Am besten mit einem Profiltiefenmesser (ca. 3 € im Baumarkt). Schnelltest: Steck eine 1-Euro-Münze ins Profil. Verschwindet der goldene Rand (ca. 3 mm) nicht ganz, ist das Profil dünner als 3 mm.')}</p>
  `, (d) => {
    const vals = Object.fromEntries(POS.map(([k]) => [k, num(d[k])]));
    if (POS.every(([k]) => vals[k] == null)) return tr('Bitte mindestens einen Wert eingeben.');
    if (POS.some(([k]) => vals[k] != null && (vals[k] < 0 || vals[k] > 15))) return tr('Profiltiefe bitte in Millimetern (0–15) eingeben.');
    t.tread = { date: d.date, ...vals };
  });
}

function swapForm() {
  const cur = state.tires.find((t) => t.id === state.mounted?.id);
  const options = state.tires.filter((t) => t !== cur);
  if (!options.length) return alert(tr('Leg zuerst einen weiteren Reifensatz an.'));
  const month = new Date().getMonth();
  const wanted = month >= 8 || month <= 1 ? 'Winter' : 'Sommer';
  const pick = options.find((t) => t.season === wanted) || options[0];
  openSheet(cur ? 'Reifen wechseln' : 'Montierten Satz festlegen', `
    <label class="field"><span>${tr(cur ? 'Neu montiert wird' : 'Montiert ist')}</span><select name="tire">
      ${options.map((t) => `<option value="${t.id}" ${t === pick ? 'selected' : ''}>${esc(tr(t.name))}</option>`).join('')}</select></label>
    <div class="row2">
      ${field('Datum', 'date', today(), 'type="date" required')}
      ${field('Kilometerstand', 'km', currentKm() ?? '', 'inputmode="numeric"')}
    </div>
    ${cur ? field(tr('Lagerort für „{name}“', { name: esc(tr(cur.name)) }), 'loc', pick.location || cur.location, 'placeholder="z. B. Keller"') : ''}
    ${cur ? field('Kosten (€, optional)', 'cost', '', 'inputmode="decimal" placeholder="wird bei den Kosten eingetragen"') : ''}
  `, (d) => {
    const next = state.tires.find((t) => t.id === d.tire);
    const km = num(d.km);
    if (cur) {
      if (km != null && state.mounted.km != null) cur.km += Math.max(0, km - state.mounted.km);
      cur.location = (d.loc || '').trim();
      const cost = num(d.cost);
      if (cost) state.costs.push({ id: uid(), date: d.date, cat: 'Reifen', amount: cost, note: tr('Reifenwechsel auf {name}', { name: tr(next.name) }), km });
      // Termin „Reifenwechsel“ in der Wartung mitführen
      const m = state.maint.find((x) => x.id === 'tires');
      if (m) {
        m.lastDate = d.date; m.lastKm = km;
        if (next.season !== 'Ganzjahr') m.lastAlt = next.season + 'reifen';
      }
    }
    state.mounted = { id: next.id, date: d.date, km };
  }, { submitLabel: cur ? 'Wechseln' : 'Speichern' });
}

/* ---------- Fotos (IndexedDB, damit der normale Speicher nicht vollläuft) ---------- */

let dbPromise = null;
function idb(mode, fn) {
  dbPromise = dbPromise || new Promise((res, rej) => {
    const r = indexedDB.open('autobuch', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise.then((d) => new Promise((res, rej) => {
    const tx = d.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  }));
}
const photoPut = (id, blob) => idb('readwrite', (st) => st.put(blob, id));
const photoGet = (id) => idb('readonly', (st) => st.get(id));
const photoDel = (id) => idb('readwrite', (st) => st.delete(id)).catch(() => {});
const allPhotoIds = () => [...state.costs, ...state.accidents, ...state.documents].flatMap((x) => x.photos || []);

// Fotos verkleinern (iPhone-Fotos haben oft 3–5 MB)
function compressImage(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

// Entwurf der Fotos im offenen Formular: erst beim Speichern übernommen
let photoDraft = null;
function photoField(ids = [], label = 'Fotos') {
  photoDraft = { ids: [...(ids || [])], added: [], removed: [], saved: false };
  return `<div class="field"><span>${tr(label)}</span><div class="thumbs" id="thumbs"></div>
    <label class="btn-file">${tr('📷 Foto hinzufügen')}<input type="file" accept="image/*" multiple hidden id="photoInput"></label></div>`;
}

function wirePhotos() {
  const box = $('#thumbs');
  let token = 0;
  const draw = async () => {
    const my = ++token;
    const parts = [];
    for (const id of photoDraft.ids) {
      const blob = await photoGet(id).catch(() => null);
      if (blob) parts.push({ id, url: URL.createObjectURL(blob) });
    }
    if (my !== token) return;
    box.innerHTML = parts.map((x) => `<div class="thumb"><img src="${x.url}" data-full="${x.url}" alt="Foto"><button type="button" data-rm="${x.id}" aria-label="${tr('Foto entfernen')}">×</button></div>`).join('');
  };
  box.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const id = rm.dataset.rm;
      photoDraft.ids = photoDraft.ids.filter((x) => x !== id);
      if (photoDraft.added.includes(id)) { photoDraft.added = photoDraft.added.filter((x) => x !== id); photoDel(id); } else photoDraft.removed.push(id);
      return draw();
    }
    const img = e.target.closest('img[data-full]');
    if (img) { $('#viewer img').src = img.dataset.full; $('#viewer').showModal(); }
  });
  $('#photoInput').addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      try {
        const id = 'p' + uid();
        await photoPut(id, await compressImage(f));
        photoDraft.ids.push(id); photoDraft.added.push(id);
      } catch (err) { alert(tr('Foto konnte nicht gespeichert werden.')); }
    }
    e.target.value = '';
    draw();
  });
  draw();
}

function commitPhotos() {
  photoDraft.saved = true;
  photoDraft.removed.forEach(photoDel);
  return [...photoDraft.ids];
}

// Formular ohne Speichern geschlossen: neu aufgenommene Fotos wieder löschen
$('#sheet').addEventListener('close', () => {
  if (photoDraft && !photoDraft.saved) photoDraft.added.forEach(photoDel);
  photoDraft = null;
});
$('#viewer').addEventListener('click', () => $('#viewer').close());

/* ---------- Notfall & Unfall ---------- */

const tel = (n) => 'tel:' + String(n).replace(/[^\d+]/g, '');

function renderHelp() {
  const d = state.docs;
  const rows = [['Kennzeichen', d.plate], ['FIN', d.vin], ['Versicherung', d.insurer], ['Vers.-Nr.', d.policy]].filter(([, v]) => v).map(([k, v]) => [tr(k), v]);
  $('#docsBody').innerHTML = `
    ${rows.length ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      : `<p class="note" style="margin-top:0">${tr('Trag Kennzeichen, Versicherung und wichtige Nummern ein. Im Ernstfall hast du dann alles griffbereit.')}</p>`}
    <div class="actions" style="margin-bottom:0">
      ${d.claimPhone ? `<a class="btn primary" style="text-align:center;padding:12px" href="${tel(d.claimPhone)}">${tr('📞 Schadenhotline')}</a>` : ''}
      ${d.breakdown ? `<a class="btn primary" style="text-align:center;padding:12px" href="${tel(d.breakdown)}">${tr('🛠 Pannenhilfe')}</a>` : ''}
      <button data-open="docs" style="grid-column:1/-1">${tr('Bearbeiten')}</button>
    </div>`;

  const acc = [...state.accidents].sort((a, b) => b.date.localeCompare(a.date));
  $('#accList').innerHTML = acc.map((a) => `
    <li>
      <div class="grow" data-edit-acc="${a.id}" style="cursor:pointer">
        <div class="title">${tr('{date}, {time} Uhr', { date: fmtDate(a.date.slice(0, 10)), time: a.date.slice(11, 16) })}</div>
        <div class="meta">${[a.place, a.otherPlate && tr('Gegner: {plate}', { plate: a.otherPlate }), a.photos?.length && '📎 ' + tr('{n} Fotos', { n: a.photos.length })].filter(Boolean).map(esc).join(' · ') || tr('Ohne Details')}</div>
      </div>
      <button class="small" data-share-acc="${a.id}">${tr('Teilen')}</button>
    </li>`).join('') || `<li class="empty">${tr('Zum Glück noch keine.')}</li>`;

  const q = ($('#lightSearch').value || '').toLowerCase();
  $('#lightList').innerHTML = LIGHTS.filter((l) => !q || (tr(l.name) + ' ' + tr(l.what)).toLowerCase().includes(q)).map((l) => `
    <details class="light">
      <summary><span class="dot ${l.color}" aria-hidden="true"></span>${esc(tr(l.name))} <span class="meta" style="font-weight:400">· ${tr(l.color === 'red' ? 'rot' : 'gelb')}</span></summary>
      <p><b>${tr('Bedeutung:')}</b> ${esc(tr(l.what))}</p>
      <p><b>${tr('Was tun:')}</b> ${esc(tr(l.todo))}</p>
    </details>`).join('') || `<p class="empty">${tr('Nichts gefunden')}</p>`;
}

const LIGHTS = [
  { color: 'red', name: 'Öldruck (Ölkanne)', what: 'Der Motoröldruck ist zu niedrig.', todo: 'Sofort sicher anhalten und Motor abstellen. Nicht weiterfahren, sonst droht ein Motorschaden. Ölstand prüfen, Pannenhilfe rufen.' },
  { color: 'red', name: 'Kühlmitteltemperatur (Thermometer)', what: 'Der Motor ist zu heiß oder es fehlt Kühlmittel.', todo: 'Anhalten, Motor abstellen und abkühlen lassen. Den Kühlmittelbehälter nicht im heißen Zustand öffnen (Verbrühungsgefahr).' },
  { color: 'red', name: 'Bremse (Kreis mit „!“ oder BRAKE)', what: 'Bremsflüssigkeit zu niedrig oder Störung im Bremssystem (oder nur: Feststellbremse angezogen).', todo: 'Feststellbremse lösen. Leuchtet es weiter: vorsichtig anhalten und nicht weiterfahren.' },
  { color: 'red', name: 'Batterie / Ladekontrolle', what: 'Die Batterie wird nicht mehr geladen (z. B. Lichtmaschine oder Keilrippenriemen).', todo: 'Unnötige Verbraucher (Sitzheizung, Radio) ausschalten und direkt zur Werkstatt. Motor möglichst nicht abstellen.' },
  { color: 'red', name: 'Airbag / Rückhaltesystem (SRS)', what: 'Störung im Airbag- oder Gurtstraffersystem. Airbags lösen bei einem Unfall eventuell nicht aus.', todo: 'Vorsichtig und zeitnah zur Werkstatt fahren.' },
  { color: 'red', name: 'Lenkung (Lenkrad)', what: 'Die Lenkunterstützung ist ausgefallen. Lenken geht deutlich schwerer.', todo: 'Mit mehr Kraft lenken, vorsichtig anhalten und Werkstatt kontaktieren.' },
  { color: 'red', name: 'Sicherheitsgurt', what: 'Jemand ist nicht angeschnallt.', todo: 'Anschnallen. Bei leerem Sitz: schwere Gegenstände vom Beifahrersitz nehmen.' },
  { color: 'yellow', name: 'Motorkontrollleuchte (Motor-Symbol)', what: 'Störung in Motorsteuerung oder Abgasreinigung.', todo: 'Leuchtet sie: bald in die Werkstatt. Blinkt sie: Zündaussetzer. Gas weg, gemäßigt weiterfahren und sofort in die Werkstatt, sonst kann der Katalysator kaputtgehen.' },
  { color: 'yellow', name: 'ABS', what: 'Das Antiblockiersystem ist gestört. Die normale Bremse funktioniert weiter.', todo: 'Vorsichtig fahren, Räder können bei Vollbremsung blockieren. Zur Werkstatt.' },
  { color: 'yellow', name: 'ESP (Auto mit Schleuderspuren)', what: 'Blinkt: ESP greift gerade ein (glatte Straße). Leuchtet dauerhaft: ESP gestört oder ausgeschaltet.', todo: 'Beim Blinken langsamer fahren. Dauerhaft an: ESP einschalten bzw. Werkstatt.' },
  { color: 'yellow', name: 'Reifendruck (Hufeisen mit „!“)', what: 'Ein Reifen verliert Luft.', todo: 'Langsamer fahren, an der nächsten Tankstelle Reifen prüfen und Druck korrigieren (Werte stehen innen in der Tankklappe). Danach Reifendruckwarnung im Bordcomputer neu starten.' },
  { color: 'yellow', name: 'Tankreserve (Zapfsäule)', what: 'Der Tank ist fast leer.', todo: 'Bald tanken, im Tab „Tanken“ siehst du die günstigste Tankstelle in der Nähe.' },
  { color: 'yellow', name: 'Kühlmittelstand / Waschwasser', what: 'Kühlmittel bzw. Scheibenwaschwasser ist zu niedrig.', todo: 'Bei kaltem Motor nachfüllen. Verliert das Auto ständig Kühlmittel: Werkstatt.' },
  { color: 'yellow', name: 'Vorglühen (Spirale)', what: 'Nur beim Diesel: Die Glühkerzen heizen vor bzw. sind gestört (blinkt während der Fahrt).', todo: 'Warten, bis die Leuchte ausgeht, dann starten. Blinkt sie beim Fahren: Werkstatt.' },
  { color: 'yellow', name: 'Lampendefekt (Glühbirne)', what: 'Eine Leuchte am Fahrzeug ist ausgefallen.', todo: 'Rundgang ums Auto machen und das Leuchtmittel tauschen lassen.' },
];

function docsForm() {
  const d = state.docs;
  openSheet('Meine Daten & Nummern', `
    <div class="row2">
      ${field('Kennzeichen', 'plate', d.plate, 'autocapitalize="characters" placeholder="z. B. S-AB 1234"')}
      ${field('FIN', 'vin', d.vin, 'autocapitalize="characters" placeholder="17 Zeichen"')}
    </div>
    <p class="hint">${tr('Die FIN steht im Fahrzeugschein unter Feld E.')}</p>
    <div class="row2">
      ${field('Versicherung', 'insurer', d.insurer, 'placeholder="z. B. HUK-COBURG"')}
      ${field('Versicherungsnr.', 'policy', d.policy)}
    </div>
    ${field('Schadenhotline', 'claimPhone', d.claimPhone, 'type="tel" placeholder="steht auf deiner Versicherungskarte"')}
    ${field('Pannenhilfe', 'breakdown', d.breakdown, 'type="tel" placeholder="z. B. ADAC: 089 20 20 4000"')}
  `, (f) => {
    state.docs = { plate: f.plate.trim().toUpperCase(), vin: f.vin.trim().toUpperCase(), insurer: f.insurer.trim(), policy: f.policy.trim(), claimPhone: f.claimPhone.trim(), breakdown: f.breakdown.trim() };
  });
}

function accidentForm(entry) {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const e = entry || { date: now, place: '', lat: null, lng: null, police: false, policeRef: '', otherName: '', otherPhone: '', otherPlate: '', otherInsurer: '', otherPolicy: '', witnesses: '', notes: '', photos: [] };
  openSheet(entry ? 'Unfall bearbeiten' : 'Unfall dokumentieren', `
    ${field('Datum & Uhrzeit', 'date', e.date, 'type="datetime-local" required')}
    ${field('Ort', 'place', e.place, 'placeholder="z. B. Kreuzung Hauptstr./Bahnhofstr."')}
    <input type="hidden" name="lat" value="${e.lat ?? ''}"><input type="hidden" name="lng" value="${e.lng ?? ''}">
    <p class="hint" id="geoInfo">${e.lat != null ? tr('📍 Standort gespeichert ({lat}, {lng})', { lat: e.lat, lng: e.lng }) : ''}</p>
    <button type="button" id="geoBtn" style="width:100%;margin-bottom:12px">${tr('📍 Aktuellen Standort übernehmen')}</button>
    ${photoField(e.photos, 'Fotos (Schäden, Kennzeichen, Unfallstelle)')}
    <fieldset><legend>${tr('Unfallgegner')}</legend>
      ${field('Name & Anschrift', 'otherName', e.otherName)}
      <div class="row2">
        ${field('Kennzeichen', 'otherPlate', e.otherPlate, 'autocapitalize="characters"')}
        ${field('Telefon', 'otherPhone', e.otherPhone, 'type="tel"')}
      </div>
      <div class="row2">
        ${field('Versicherung', 'otherInsurer', e.otherInsurer)}
        ${field('Versicherungsnr.', 'otherPolicy', e.otherPolicy)}
      </div>
    </fieldset>
    ${field('Zeugen (Name, Telefon)', 'witnesses', e.witnesses)}
    <label class="check"><input type="checkbox" name="police" ${e.police ? 'checked' : ''}> ${tr('Polizei war vor Ort')}</label>
    ${field('Aktenzeichen Polizei', 'policeRef', e.policeRef)}
    <label class="field"><span>${tr('Was ist passiert?')}</span><textarea name="notes" placeholder="${esc(tr('Kurz in eigenen Worten, solange du dich gut erinnerst'))}">${esc(e.notes)}</textarea></label>
  `, (d) => {
    const rec = {
      id: entry?.id || uid(), date: d.date, place: d.place.trim(), lat: num(d.lat), lng: num(d.lng), police: d.police === 'on', policeRef: d.policeRef.trim(),
      otherName: d.otherName.trim(), otherPhone: d.otherPhone.trim(), otherPlate: d.otherPlate.trim().toUpperCase(), otherInsurer: d.otherInsurer.trim(),
      otherPolicy: d.otherPolicy.trim(), witnesses: d.witnesses.trim(), notes: d.notes.trim(), photos: commitPhotos(),
    };
    if (entry) Object.assign(entry, rec); else state.accidents.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.accidents = state.accidents.filter((x) => x !== entry); }) });
  wirePhotos();
  $('#geoBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return alert(tr('Standort ist auf diesem Gerät nicht verfügbar.'));
    $('#geoInfo').textContent = tr('Standort wird bestimmt …');
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      sheetForm.lat.value = lat; sheetForm.lng.value = lng;
      $('#geoInfo').textContent = tr('📍 Standort gespeichert ({lat}, {lng})', { lat, lng });
    }, () => { $('#geoInfo').textContent = tr('Standort nicht verfügbar. Erlaube Safari-Websites den Zugriff auf Ortungsdienste.'); },
    { enableHighAccuracy: true, timeout: 15000 });
  });
}

// Unfallbericht als Text (+ Fotos) z. B. per Mail an die Versicherung schicken
async function shareAccident(a) {
  const c = state.car, d = state.docs;
  const lines = [
    tr('Unfallbericht vom {date}, {time} Uhr', { date: fmtDate(a.date.slice(0, 10)), time: a.date.slice(11, 16) }),
    a.place && `${tr('Ort')}: ${a.place}`,
    a.lat != null && `${tr('Standort')}: https://maps.apple.com/?q=${a.lat},${a.lng}`,
    '',
    `${tr('Mein Fahrzeug')}: ${[c.name, d.plate].filter(Boolean).join(', ')}`,
    d.insurer && `${tr('Meine Versicherung')}: ${d.insurer}${d.policy ? ', ' + tr('Nr.') + ' ' + d.policy : ''}`,
    '',
    tr('Unfallgegner') + ':',
    a.otherName && `${tr('Name')}: ${a.otherName}`,
    a.otherPlate && `${tr('Kennzeichen')}: ${a.otherPlate}`,
    a.otherPhone && `${tr('Telefon')}: ${a.otherPhone}`,
    a.otherInsurer && `${tr('Versicherung')}: ${a.otherInsurer}${a.otherPolicy ? ', ' + tr('Nr.') + ' ' + a.otherPolicy : ''}`,
    a.witnesses && `\n${tr('Zeugen')}: ${a.witnesses}`,
    a.police && tr('Polizei vor Ort') + (a.policeRef ? ', ' + tr('Aktenzeichen') + ' ' + a.policeRef : ''),
    a.notes && `\n${tr('Hergang')}:\n${a.notes}`,
  ].filter((x) => x !== false && x !== null && x !== undefined && x !== 0).join('\n').replace(/\n{3,}/g, '\n\n');
  const files = [];
  for (const [i, id] of (a.photos || []).entries()) {
    const blob = await photoGet(id).catch(() => null);
    if (blob) files.push(new File([blob], `${tr('unfall-foto')}-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  try {
    if (files.length && navigator.canShare?.({ files })) return await navigator.share({ title: tr('Unfallbericht'), text: lines, files });
    if (navigator.share) return await navigator.share({ title: tr('Unfallbericht'), text: lines });
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(lines); alert(tr('Bericht in die Zwischenablage kopiert.')); }
  catch (e) { alert(lines); }
}

const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

/* ---------- GPS-Fahrtaufzeichnung ---------- */

let rec = null;
let currentView = 'start';
const HARD_BRAKE = -3.5, HARD_ACCEL = 3.0; // m/s², aus der GPS-Geschwindigkeit

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmtDur = (sec) => {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m}:${String(s2).padStart(2, '0')}`;
};

async function lockScreen() {
  try { if (rec && navigator.wakeLock) rec.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht unterstützt */ }
}

function startDrive() {
  if (rec) return showView('drive');
  if (!navigator.geolocation) return alert(tr('Dieses Gerät kann den Standort nicht bestimmen.'));
  rec = { start: Date.now(), dist: 0, moving: 0, over130: 0, max: 0, speed: null, acc: null, brakes: 0, accels: 0, anchor: null, prev: null, lastEvent: 0, track: [], lock: null };
  rec.watch = navigator.geolocation.watchPosition(onFix, (err) => {
    if (rec) rec.gpsError = err.code === 1
      ? tr('Kein Zugriff auf den Standort. Erlaube ihn unter Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites.')
      : tr('GPS-Signal schwach …');
    renderDrive();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  rec.timer = setInterval(renderDrive, 1000);
  lockScreen();
  showView('drive');
  renderDrive();
}

function onFix(pos) {
  if (!rec) return;
  const c = pos.coords, t = pos.timestamp;
  rec.acc = c.accuracy; rec.gpsError = '';
  if (c.accuracy > 50) return renderDrive(); // zu ungenau, ignorieren
  const pt = { lat: c.latitude, lng: c.longitude, t };

  // Strecke: erst ab einer Bewegung deutlich über der GPS-Ungenauigkeit zählen
  if (!rec.anchor) rec.anchor = pt;
  else {
    const d = haversine(rec.anchor, pt);
    if (d >= Math.max(5, c.accuracy * 0.5)) {
      if (c.speed == null || c.speed < 0) rec.calcSpeed = d / Math.max(1, (t - rec.anchor.t) / 1000);
      rec.dist += d; rec.anchor = pt;
    }
  }
  const speed = c.speed != null && c.speed >= 0 ? c.speed : (rec.calcSpeed ?? null);

  if (speed != null && rec.prev) {
    const dt = (t - rec.prev.t) / 1000;
    if (dt > 0 && dt <= 3) {
      if (speed > 1) rec.moving += dt;
      if (speed * 3.6 > 130) rec.over130 += dt;
      // Fahrstil: Änderung der Geschwindigkeit pro Sekunde, höchstens ein Ereignis alle 4 s
      const a = (speed - rec.prev.speed) / dt;
      if (t - rec.lastEvent > 4000) {
        if (a <= HARD_BRAKE) { rec.brakes++; rec.lastEvent = t; }
        else if (a >= HARD_ACCEL) { rec.accels++; rec.lastEvent = t; }
      }
    }
  }
  if (speed != null) { rec.prev = { speed, t }; rec.speed = speed; rec.max = Math.max(rec.max, speed); }

  const last = rec.track[rec.track.length - 1];
  if (!last || haversine(last, pt) > 25) rec.track.push(pt);
  renderDrive();
}

function driveScore(d) {
  const per10 = (x) => x / Math.max(d.km, 5) * 10;
  const fast = d.movingSec ? d.over130 / d.movingSec : 0;
  return Math.max(0, Math.min(100, Math.round(100 - per10(d.brakes) * 8 - per10(d.accels) * 5 - fast * 30)));
}

function renderDrive() {
  const bar = $('#recBar');
  bar.style.display = rec && currentView !== 'drive' ? 'block' : 'none';
  if (!rec) return;
  const elapsed = (Date.now() - rec.start) / 1000;
  bar.textContent = `${tr('● Aufnahme läuft')} · ${fmtNum(rec.dist / 1000, 1)} km · ${fmtDur(elapsed)}`;
  if (currentView !== 'drive') return;
  $('#dSpeed').textContent = rec.speed != null ? fmtNum(rec.speed * 3.6) : '–';
  $('#dDist').innerHTML = `${fmtNum(rec.dist / 1000, 1)} <small>km</small>`;
  $('#dTime').textContent = fmtDur(elapsed);
  $('#dAvg').innerHTML = rec.moving > 10 ? `${fmtNum(rec.dist / rec.moving * 3.6)} <small>km/h</small>` : '–';
  $('#dMax').innerHTML = rec.max ? `${fmtNum(rec.max * 3.6)} <small>km/h</small>` : '–';
  $('#dEvents').innerHTML = `
    <span class="pill ${rec.brakes ? 'soon' : 'ok'}">${tr('Starkes Bremsen')}: ${rec.brakes}</span>
    <span class="pill ${rec.accels ? 'soon' : 'ok'}">${tr('Starkes Beschleunigen')}: ${rec.accels}</span>`;
  $('#dGps').textContent = rec.gpsError || (rec.acc != null ? tr('GPS-Genauigkeit: ± {m} m', { m: fmtNum(rec.acc) }) : tr('GPS wird gesucht …'));
}

function stopDrive() {
  if (!rec) return;
  navigator.geolocation.clearWatch(rec.watch);
  clearInterval(rec.timer);
  try { rec.lock?.release(); } catch (e) { /* egal */ }
  const r = rec;
  rec = null;
  renderDrive();
  const km = r.dist / 1000;
  if (km < 0.1) { alert(tr('Die Fahrt war kürzer als 100 m und wurde nicht gespeichert.')); return showView('trips'); }
  // Strecke für die Skizze auf höchstens 400 Punkte ausdünnen
  const step = Math.ceil(r.track.length / 400);
  const track = r.track.filter((_, i) => i % step === 0 || i === r.track.length - 1).map((x) => [+x.lat.toFixed(5), +x.lng.toFixed(5)]);
  const d = {
    id: uid(), start: r.start, end: Date.now(), km: +km.toFixed(2), movingSec: Math.round(r.moving),
    maxKmh: Math.round(r.max * 3.6), avgKmh: r.moving > 10 ? Math.round(r.dist / r.moving * 3.6) : null,
    brakes: r.brakes, accels: r.accels, over130: Math.round(r.over130), track, tripId: null,
  };
  d.score = driveScore(d);
  state.drives.push(d);
  save();
  showView('trips');
  driveDetail(d);
}

function routeSvg(track) {
  if (!track || track.length < 2) return '';
  const lat0 = track[0][0] * Math.PI / 180;
  const pts = track.map(([la, ln]) => [ln * Math.cos(lat0), -la]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const W = 320, H = 180, pad = 14;
  const k = Math.min((W - 2 * pad) / ((Math.max(...xs) - minX) || span), (H - 2 * pad) / ((Math.max(...ys) - minY) || span));
  const offX = (W - (Math.max(...xs) - minX) * k) / 2, offY = (H - (Math.max(...ys) - minY) * k) / 2;
  const P = pts.map(([x, y]) => [((x - minX) * k + offX).toFixed(1), ((y - minY) * k + offY).toFixed(1)]);
  return `<div class="route"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Skizze der gefahrenen Strecke')}">
    <polyline class="line" points="${P.map((q) => q.join(',')).join(' ')}"/>
    <circle class="start" cx="${P[0][0]}" cy="${P[0][1]}" r="6"/><circle class="end" cx="${P[P.length - 1][0]}" cy="${P[P.length - 1][1]}" r="6"/>
  </svg><div class="meta" style="margin-top:4px"><span style="color:var(--good)">●</span> ${tr('Start')} · <span style="color:var(--bad)">●</span> ${tr('Ziel')}</div></div>`;
}

function scorePill(score) {
  return `<span class="pill ${score >= 85 ? 'ok' : score >= 60 ? 'soon' : 'over'}">${tr('Fahrstil {n}', { n: score })}</span>`;
}

function driveDetail(d) {
  const cons = consumption().avg;
  const lSum = state.fuel.reduce((s, f) => s + f.liters, 0);
  const price = lSum ? state.fuel.reduce((s, f) => s + f.total, 0) / lSum : null;
  const cost = cons && price ? d.km * cons / 100 * price : null;
  const tips = [];
  if (d.brakes) tips.push(tr('Mehr Abstand halten und vorausschauend vom Gas gehen spart Bremsen und Sprit.'));
  if (d.accels) tips.push(tr('Sanfter beschleunigen und früh hochschalten senkt den Verbrauch deutlich.'));
  if (d.over130 > 60) tips.push(tr('Über 130 km/h steigt der Verbrauch stark an.'));
  const start = new Date(d.start);
  openSheet(tr('Fahrt am {date}', { date: fmtDate(start.toISOString().slice(0, 10)) }), `
    ${routeSvg(d.track)}
    <dl class="kv">
      <dt>${tr('Zeit')}</dt><dd>${tr('{from} – {to} Uhr', { from: fmtTime(d.start), to: fmtTime(d.end) })}</dd>
      <dt>${tr('Strecke')}</dt><dd>${fmtNum(d.km, 1)} km</dd>
      <dt>${tr('Fahrzeit')}</dt><dd>${tr('{dur} in Bewegung', { dur: fmtDur(d.movingSec) })}</dd>
      <dt>${tr('Tempo')}</dt><dd>${tr('Ø {avg} km/h · max {max} km/h', { avg: d.avgKmh ?? '–', max: d.maxKmh })}</dd>
      <dt>${tr('Fahrstil')}</dt><dd>${scorePill(d.score)} · ${tr('{n}× stark gebremst', { n: d.brakes })} · ${tr('{n}× stark beschleunigt', { n: d.accels })}</dd>
      ${cost ? `<dt>${tr('Sprit')}</dt><dd>${tr('≈ {eur} (bei {cons} l/100 km)', { eur: fmtEUR(cost), cons: fmtNum(cons, 1) })}</dd>` : ''}
    </dl>
    ${tips.length ? `<p class="note">💡 ${tips.join(' ')}</p>` : `<p class="note">${tr('👍 Sehr gleichmäßig gefahren.')}</p>`}
    ${d.tripId ? `<p class="note">${tr('✓ Im Fahrtenbuch eingetragen.')}</p>` : ''}
  `, () => {
    if (d.tripId) return;
    const startKm = currentKm();
    setTimeout(() => tripForm(null, {
      date: new Date(d.start - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      startKm: startKm ?? '', endKm: startKm != null ? Math.round(startKm + d.km) : '', from: '', driveId: d.id,
    }), 50);
  }, { submitLabel: d.tripId ? 'Schließen' : 'Ins Fahrtenbuch', deleteFn: () => { state.drives = state.drives.filter((x) => x !== d); } });
}

function renderDrives() {
  $('#driveBtn').textContent = tr(rec ? '● Aufnahme läuft: anzeigen' : '▶︎ Fahrt aufzeichnen (GPS)');
  const list = [...state.drives].sort((a, b) => b.start - a.start).slice(0, 20);
  $('#driveList').innerHTML = list.map((d) => {
    const st = new Date(d.start);
    return `<li data-drive="${d.id}" style="cursor:pointer">
      <div class="grow"><div class="title">${tr('{date}, {time} Uhr', { date: fmtDate(st.toISOString().slice(0, 10)), time: fmtTime(d.start) })}</div>
      <div class="meta">${fmtDur(d.movingSec)} · Ø ${d.avgKmh ?? '–'} km/h${d.tripId ? ' · ' + tr('✓ Fahrtenbuch') : ''}</div></div>
      <div class="amount">${fmtNum(d.km, 1)} km<div>${scorePill(d.score)}</div></div>
    </li>`;
  }).join('') || `<li class="empty">${tr('Tipp auf „Fahrt aufzeichnen“, bevor du losfährst. Die App misst Strecke, Tempo und deinen Fahrstil.')}</li>`;
}

/* ---------- Dokumente ---------- */

const DOC_TYPES = ['Fahrzeugschein', 'Fahrzeugbrief', 'Führerschein', 'Versicherungskarte', 'Serviceheft', 'TÜV-Bericht', 'Kaufvertrag', 'Sonstiges'];

function docExpiry(doc) {
  if (!doc.expires) return null;
  const days = daysUntil(doc.expires);
  return days < 0 ? { cls: 'over', label: tr('⚠︎ Abgelaufen') } : days <= 60 ? { cls: 'soon', label: tr('⏱ Noch {n} Tage', { n: days }) } : { cls: 'ok', label: tr('✓ Bis {date}', { date: fmtDate(doc.expires) }) };
}

function renderDocs() {
  const docs = [...state.documents].sort((a, b) => DOC_TYPES.indexOf(a.type) - DOC_TYPES.indexOf(b.type));
  $('#docList').innerHTML = docs.map((doc) => {
    const ex = docExpiry(doc);
    return `<li data-edit-doc="${doc.id}" style="cursor:pointer">
      <div class="grow"><div class="title">📄 ${esc(doc.title || tr(doc.type))}</div>
      <div class="meta">${[doc.title ? tr(doc.type) : '', doc.photos?.length ? tr(doc.photos.length > 1 ? '{n} Fotos' : '{n} Foto', { n: doc.photos.length }) : tr('kein Foto'), doc.note].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${ex ? `<span class="pill ${ex.cls}">${ex.label}</span>` : ''}
    </li>`;
  }).join('') || `<li class="empty">${tr('Noch keine Dokumente. Fotografiere z. B. Fahrzeugschein und Versicherungskarte.')}</li>`;
}

function docForm(entry) {
  const e = entry || { type: 'Fahrzeugschein', title: '', expires: '', note: '', photos: [] };
  openSheet(entry ? esc(e.title || tr(e.type)) : 'Dokument hinzufügen', `
    <label class="field"><span>${tr('Art')}</span><select name="type">${DOC_TYPES.map((t) => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${tr(t)}</option>`).join('')}</select></label>
    ${field('Bezeichnung (optional)', 'title', e.title, 'placeholder="z. B. eVB-Nummer, Rechnung Kauf"')}
    ${field('Gültig bis (optional)', 'expires', e.expires, 'type="date"')}
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Original liegt im Ordner zu Hause"')}
    ${photoField(e.photos, 'Fotos (Vorder- und Rückseite)')}
  `, (d) => {
    const rec = { id: entry?.id || uid(), type: d.type, title: d.title.trim(), expires: d.expires, note: d.note.trim(), photos: commitPhotos() };
    if (!rec.photos.length && !rec.note) return tr('Bitte ein Foto hinzufügen oder eine Notiz eintragen.');
    if (entry) Object.assign(entry, rec); else state.documents.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.documents = state.documents.filter((x) => x !== entry); }) });
  wirePhotos();
}

/* ---------- Siri & Kurzbefehle ---------- */

const ACTION_LINKS = [
  ['fuel', '⛽ Tanken eintragen'],
  ['drive', '🛰 Fahrt aufzeichnen'],
  ['park', '📍 Hier geparkt'],
  ['cost', '€ Ausgabe eintragen'],
  ['trip', '🚗 Fahrt eintragen'],
  ['help', '🚨 Notfall & Hilfe'],
];
const actionUrl = (a) => location.origin + location.pathname + '?action=' + a;

function renderLinks() {
  $('#linkList').innerHTML = ACTION_LINKS.map(([a, label]) => `
    <li><div class="grow"><div class="title">${tr(label)}</div><div class="linkurl">${esc(actionUrl(a))}</div></div>
    <button class="small" data-copy="${a}">${tr('Kopieren')}</button></li>`).join('');
}

// Wird beim Start mit ?action=… geöffnet (z. B. von einem Kurzbefehl)
function handleUrlAction() {
  const q = new URLSearchParams(location.search);
  const a = q.get('action');
  if (!a) return;
  history.replaceState(null, '', location.pathname);
  if (a === 'fuel') { showView('fuel'); fuelForm(null, { liters: num(q.get('l')) ?? '', total: num(q.get('eur')) ?? '', km: num(q.get('km')) ?? '' }); }
  else if (a === 'cost') { showView('costs'); costForm(); }
  else if (a === 'trip') { showView('trips'); tripForm(); }
  else if (a === 'drive') startDrive();
  else if (a === 'park') { showView('start'); setParking(); }
  else if (a === 'help') showView('help');
}

/* ---------- Verkaufs-Mappe ---------- */

function reportForm() {
  openSheet('Verkaufs-Mappe erstellen', `
    <p class="note" style="margin-top:0">${tr('Was soll im Bericht stehen?')}</p>
    <label class="check"><input type="checkbox" name="amounts" checked> ${tr('Rechnungsbeträge zeigen')}</label>
    <label class="check"><input type="checkbox" name="vin" checked> ${tr('Fahrgestellnummer (FIN) zeigen')}</label>
    <label class="check"><input type="checkbox" name="accidents" checked> ${tr('Unfälle aufführen')}</label>
    <label class="check"><input type="checkbox" name="photos" checked> ${tr('Fotos der Rechnungen anhängen')}</label>
    <p class="hint">${tr('Tipp: Bekannte Unfallschäden musst du beim Verkauf ohnehin angeben. Verschweigen kann teuer werden.')}</p>
  `, (d) => {
    const opt = { amounts: d.amounts === 'on', vin: d.vin === 'on', accidents: d.accidents === 'on', photos: d.photos === 'on' };
    setTimeout(() => buildReport(opt), 50);
  }, { submitLabel: 'Erstellen' });
}

async function buildReport(opt) {
  const c = state.car, d = state.docs, km = currentKm();
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const bills = state.costs.filter((x) => ['Werkstatt', 'Reifen'].includes(x.cat)).sort(byDate);
  const billSum = bills.reduce((s2, x) => s2 + x.amount, 0);
  const cons = consumption().avg;

  // km-Verlauf: höchster bekannter km-Stand je Jahr
  const points = [
    ...state.fuel.map((f) => [f.date, f.km]), ...state.costs.filter((x) => x.km != null).map((x) => [x.date, x.km]),
    ...state.trips.map((t) => [t.date, t.endKm]), ...state.maint.filter((m) => m.lastDate && m.lastKm != null).map((m) => [m.lastDate, m.lastKm]),
  ];
  const perYear = {};
  points.forEach(([date, k]) => { const y = date.slice(0, 4); perYear[y] = Math.max(perYear[y] || 0, k); });
  const years = Object.keys(perYear).sort();

  const row = (cells) => `<tr>${cells.map((x) => `<td${x && x.r ? ' class="r"' : ''}>${x && x.r ? x.v : x ?? ''}</td>`).join('')}</tr>`;
  const R = (v) => ({ r: true, v });
  const maintDone = state.maint.filter((m) => m.lastDate || m.lastKm != null);

  let html = `<div class="report">
    <h1>${tr('Fahrzeug-Dokumentation')}</h1>
    <p class="sub">${esc([c.name, c.variant].filter(Boolean).join(' · '))} · ${tr('erstellt am {date}', { date: fmtDate(today()) })}</p>

    <h2>${tr('Fahrzeug')}</h2>
    <table>
      ${row([tr('Modell'), esc(c.name)])}${c.variant ? row([tr('Ausstattung'), esc(c.variant)]) : ''}
      ${c.year ? row([tr('Baujahr'), esc(c.year)]) : ''}${row([tr('Kraftstoff'), esc(tr(c.fuel))])}
      ${d.plate ? row([tr('Kennzeichen'), esc(d.plate)]) : ''}${opt.vin && d.vin ? row([tr('FIN'), esc(d.vin)]) : ''}
      ${km != null ? row([tr('Kilometerstand'), `${fmtNum(km)} km`]) : ''}
      ${cons ? row([tr('Ø Verbrauch'), tr('{cons} l/100 km (aus {n} Tankfüllungen)', { cons: fmtNum(cons, 1), n: state.fuel.length })]) : ''}
    </table>

    <h2>${tr('Wartung &amp; Prüfungen')}</h2>
    ${maintDone.length ? `<table><tr><th>${tr('Leistung')}</th><th>${tr('Zuletzt')}</th><th class="r">km</th><th>${tr('Nächste Fälligkeit')}</th></tr>
      ${maintDone.map((m) => {
        const due = maintStatus(m).due.replace(/<[^>]+>/g, '');
        return row([esc(tr(m.name)) + (m.lastAlt ? ` (${esc(tr(m.lastAlt))})` : ''), m.lastDate ? fmtDate(m.lastDate) : '–', R(m.lastKm != null ? fmtNum(m.lastKm) : '–'), esc(due || '–')]);
      }).join('')}</table>` : `<p>${tr('Keine Einträge.')}</p>`}

    <h2>${tr('Werkstatt- &amp; Reifenrechnungen')}</h2>
    ${bills.length ? `<table><tr><th>${tr('Datum')}</th><th class="r">km</th><th>${tr('Leistung')}</th>${opt.amounts ? `<th class="r">${tr('Betrag')}</th>` : ''}</tr>
      ${bills.map((x) => row([fmtDate(x.date), R(x.km != null ? fmtNum(x.km) : '–'), esc(x.note || tr(x.cat)) + (opt.photos && x.photos?.length ? ' 📎' : ''), ...(opt.amounts ? [R(fmtEUR(x.amount))] : [])])).join('')}
      ${opt.amounts ? row(['', R(''), `<b>${tr('Summe')}</b>`, R(`<b>${fmtEUR(billSum)}</b>`)]) : ''}</table>` : `<p>${tr('Keine Rechnungen erfasst.')}</p>`}

    <h2>${tr('Kilometer-Verlauf')}</h2>
    ${years.length ? `<table><tr><th>${tr('Jahr')}</th><th class="r">${tr('Höchster bekannter km-Stand')}</th></tr>${years.map((y) => row([y, R(fmtNum(perYear[y]) + ' km')])).join('')}</table>` : `<p>${tr('Keine Daten.')}</p>`}

    <h2>${tr('Reifen')}</h2>
    ${state.tires.length ? `<table><tr><th>${tr('Satz')}</th><th>${tr('Marke / Größe')}</th><th>DOT</th><th class="r">${tr('Profil (min.)')}</th><th class="r">km</th></tr>
      ${state.tires.map((t) => {
        const min = t.tread ? Math.min(...POS.map(([k]) => t.tread[k]).filter((v) => v != null)) : null;
        return row([esc(tr(t.name)) + (state.mounted?.id === t.id ? ` (${tr('montiert')})` : ''), esc([t.brand, t.size].filter(Boolean).join(', ') || '–'), esc(t.dot || '–'),
          R(min != null ? `${fmtNum(min, 1)} mm` : '–'), R(fmtNum(tireKm(t)))]);
      }).join('')}</table>` : `<p>${tr('Keine Reifen erfasst.')}</p>`}`;

  if (opt.accidents) {
    const acc = [...state.accidents].sort(byDate);
    html += `<h2>${tr('Unfälle')}</h2>${acc.length ? `<table><tr><th>${tr('Datum')}</th><th>${tr('Ort')}</th><th>${tr('Hergang')}</th></tr>
      ${acc.map((a) => row([fmtDate(a.date.slice(0, 10)), esc(a.place || '–'), esc(a.notes || '–')])).join('')}</table>` : `<p>${tr('Keine Unfälle erfasst.')}</p>`}`;
  }

  if (opt.photos) {
    const withPhotos = bills.filter((x) => x.photos?.length);
    if (withPhotos.length) {
      html += `<h2>${tr('Belege')}</h2>`;
      for (const x of withPhotos) {
        for (const id of x.photos) {
          const blob = await photoGet(id).catch(() => null);
          if (blob) html += `<div class="receipt"><b>${fmtDate(x.date)}: ${esc(x.note || tr(x.cat))}</b><img src="${URL.createObjectURL(blob)}" alt="${tr('Beleg')}"></div>`;
        }
      }
    }
  }
  html += `<p class="fine">${tr('Die Angaben wurden vom Halter selbst erfasst (Autobuch).')}</p></div>`;

  $('#reportBody').innerHTML = html;
  showView('report');
  await Promise.all([...document.querySelectorAll('#reportBody img')].map((img) => img.decode().catch(() => {})));
}

/* ---------- Kalender ---------- */

function calendarFile() {
  const ymd = (s) => s.replace(/-/g, '');
  const icsText = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Autobuch//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let count = 0;
  state.maint.forEach((m) => {
    const st = maintStatus(m);
    if (!st.calDate) return;
    const date = st.calDate < today() ? today() : st.calDate;
    const title = `${state.car.name || tr('Auto')}: ${tr(m.name)}${st.next ? ` (${st.next})` : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}-${ymd(m.lastDate || String(m.lastKm))}@autobuch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(1, date))}`,
      `SUMMARY:${icsText(title)}`,
      `DESCRIPTION:${icsText(plain(st.text) + ' (Autobuch)')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:-P7D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT'
    );
    count++;
  });
  lines.push('END:VCALENDAR');
  return count ? lines.join('\r\n') + '\r\n' : null;
}

function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function applyTheme() {
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

/* ---------- Formulare ---------- */

const sheet = $('#sheet'), sheetForm = $('#sheetForm');
let onSubmit = null;

function openSheet(title, fieldsHtml, submit, { deleteFn, submitLabel = 'Speichern' } = {}) {
  sheetForm.innerHTML = `<h3>${tr(title)}</h3>${fieldsHtml}
    <div class="form-btns"><button type="button" data-close>${tr('Abbrechen')}</button><button class="primary" value="ok">${tr(submitLabel)}</button></div>
    ${deleteFn ? `<button type="button" class="link danger" data-delete style="width:100%;margin-top:12px">${tr('Eintrag löschen')}</button>` : ''}`;
  onSubmit = submit;
  $('[data-close]', sheetForm).onclick = () => sheet.close();
  if (deleteFn) $('[data-delete]', sheetForm).onclick = () => { if (confirm(tr('Wirklich löschen?'))) { deleteFn(); sheet.close(); save(); } };
  sheet.showModal();
}

sheetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(sheetForm));
  const err = onSubmit && onSubmit(data);
  if (err) { alert(err); return; }
  sheet.close();
  save();
});

// Beschriftung und Platzhalter werden automatisch übersetzt
const field = (label, name, value = '', attrs = '') =>
  `<label class="field"><span>${tr(label)}</span><input name="${name}" value="${esc(value)}" ${attrs.replace(/placeholder="([^"]*)"/, (m0, ph) => `placeholder="${esc(tr(ph))}"`)}></label>`;

function fuelForm(entry, prefill = {}) {
  const e = entry || { date: today(), km: '', liters: '', total: '', full: true, station: '', ...prefill };
  const kmHint = currentKm() != null && !entry ? `<p class="hint">${tr('Letzter bekannter Stand: {km} km', { km: fmtNum(currentKm()) })}</p>` : '';
  openSheet(entry ? 'Tankfüllung bearbeiten' : 'Tankfüllung eintragen', `
    ${field('Datum', 'date', e.date, 'type="date" required')}
    ${field('Kilometerstand', 'km', e.km, 'inputmode="numeric" required placeholder="z. B. 98500"')}${kmHint}
    <div class="row2">
      ${field('Liter', 'liters', fmtIn(e.liters, 2), 'inputmode="decimal" required placeholder="z. B. 42,5"')}
      ${field('Betrag (€)', 'total', fmtIn(e.total, 2), 'inputmode="decimal" required placeholder="z. B. 74,30"')}
    </div>
    <label class="check"><input type="checkbox" name="full" ${e.full ? 'checked' : ''}> ${tr('Vollgetankt')}</label>
    ${field('Tankstelle (optional)', 'station', e.station)}
  `, (d) => {
    const km = num(d.km), liters = num(d.liters), total = num(d.total);
    if (km == null || liters == null || total == null || liters <= 0) return tr('Bitte Kilometerstand, Liter und Betrag ausfüllen.');
    if (state.car.tank && liters > state.car.tank * 1.15) return tr('{l} Liter passen nicht in einen {tank}-Liter-Tank. Bitte prüfen.', { l: fmtNum(liters, 1), tank: state.car.tank });
    const rec = { id: entry?.id || uid(), date: d.date, km, liters, total, full: d.full === 'on', station: d.station.trim() };
    if (entry) Object.assign(entry, rec); else state.fuel.push(rec);
  }, { deleteFn: entry && (() => { state.fuel = state.fuel.filter((x) => x !== entry); }) });
}

function costForm(entry) {
  const e = entry || { date: today(), cat: 'Werkstatt', amount: '', note: '', km: null };
  openSheet(entry ? 'Ausgabe bearbeiten' : 'Ausgabe eintragen', `
    ${field('Datum', 'date', e.date, 'type="date" required')}
    <label class="field"><span>${tr('Kategorie')}</span><select name="cat">${COST_CATS.map((c) => `<option value="${c}" ${c === e.cat ? 'selected' : ''}>${tr(c)}</option>`).join('')}</select></label>
    ${field('Betrag (€)', 'amount', fmtIn(e.amount, 2), 'inputmode="decimal" required placeholder="z. B. 389,00"')}
    ${field('Notiz (optional)', 'note', e.note, 'placeholder="z. B. Service B, Bremsbeläge vorne"')}
    ${field('Kilometerstand (optional)', 'km', e.km ?? '', 'inputmode="numeric"')}
    ${photoField(e.photos, 'Belege / Rechnungen')}
  `, (d) => {
    const amount = num(d.amount);
    if (amount == null) return tr('Bitte einen Betrag eingeben.');
    const rec = { id: entry?.id || uid(), date: d.date, cat: d.cat, amount, note: d.note.trim(), km: num(d.km), photos: commitPhotos() };
    if (entry) Object.assign(entry, rec); else state.costs.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.costs = state.costs.filter((x) => x !== entry); }) });
  wirePhotos();
}

function altField(m, selected) {
  if (!m.alt) return '';
  return `<label class="field"><span>${tr(m.id === 'tires' ? 'Aufgezogen' : 'Art')}</span><select name="alt">
    ${m.alt.map((a) => `<option value="${esc(a)}" ${a === selected ? 'selected' : ''}>${esc((m.altLabel ? tr(m.altLabel) + ' ' : '') + tr(a))}</option>`).join('')}</select></label>`;
}

function doneForm(m) {
  openSheet(tr('{name}: erledigt', { name: esc(tr(m.name)) }), `
    ${field('Datum', 'date', today(), 'type="date" required')}
    ${field('Kilometerstand', 'km', m.km ? currentKm() ?? '' : '', 'inputmode="numeric"')}
    ${altField(m, nextAlt(m))}
    ${field('Kosten (€, optional)', 'cost', '', 'inputmode="decimal" placeholder="wird bei den Kosten eingetragen"')}
  `, (d) => {
    m.lastDate = d.date; m.lastKm = num(d.km);
    if (m.alt) m.lastAlt = d.alt;
    const cost = num(d.cost);
    if (cost) {
      state.costs.push({ id: uid(), date: d.date, cat: m.id === 'tires' ? 'Reifen' : 'Werkstatt', amount: cost,
        note: tr(m.name) + (m.alt ? ` (${tr(d.alt)})` : ''), km: m.lastKm });
    }
  });
}

function maintForm(m) {
  const isNew = !m;
  const e = m || { id: uid(), name: '', months: 12, km: 0, lastDate: '', lastKm: null, lastAlt: '', info: '', custom: true };
  openSheet(isNew ? 'Eigener Termin' : esc(tr(e.name)), `
    ${field('Name', 'name', e.name, 'required placeholder="z. B. Innenraumfilter"')}
    <div class="row2">
      ${field('Alle … Monate', 'months', e.months || '', 'inputmode="numeric" placeholder="leer = keins"')}
      ${field('Alle … km', 'km', e.km || '', 'inputmode="numeric" placeholder="leer = keins"')}
    </div>
    <p class="hint">${tr('Was zuerst eintritt, zählt.')}</p>
    <div class="row2">
      ${field('Zuletzt am', 'lastDate', e.lastDate, 'type="date"')}
      ${field('Zuletzt bei km', 'lastKm', e.lastKm ?? '', 'inputmode="numeric"')}
    </div>
    ${altField(e, e.lastAlt)}
  `, (d) => {
    if (!d.name.trim()) return tr('Bitte einen Namen eingeben.');
    Object.assign(e, { name: d.name.trim(), months: num(d.months) || 0, km: num(d.km) || 0, lastDate: d.lastDate, lastKm: num(d.lastKm) });
    if (e.alt && d.alt) e.lastAlt = d.alt;
    if (isNew) state.maint.push(e);
  }, { deleteFn: !isNew && (() => { state.maint = state.maint.filter((x) => x !== e); }) });
}

/* ---------- Ereignisse ---------- */

const TITLES = { stats: 'Statistik', checks: 'Checklisten', plan: 'Reiseplaner', garages: 'Werkstätten', report: 'Verkaufs-Mappe', drive: 'Fahrt läuft', help: 'Notfall & Hilfe', start: 'Übersicht', fuel: 'Tanken', trips: 'Fahrtenbuch', maint: 'Wartung', costs: 'Kosten', more: 'Mehr' };

function showSub(sub) {
  $('#sub-termine').hidden = sub !== 'termine';
  $('#sub-reifen').hidden = sub !== 'reifen';
  document.querySelectorAll('#maintSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sub === sub)));
}
function showView(v) {
  currentView = v;
  renderDrive();
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
  document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('#viewTitle').textContent = tr(TITLES[v]);
  window.scrollTo(0, 0);
  try { sessionStorage.setItem('autobuch-view', v); } catch (e) { /* egal */ }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, li[data-edit-fuel], li[data-edit-cost], li[data-edit-trip], [data-edit-acc], li[data-drive], li[data-edit-doc]');
  if (!t) return;
  if (t.dataset.view) return showView(t.dataset.view);
  if (t.dataset.open === 'fuel') return fuelForm();
  if (t.dataset.open === 'cost') return costForm();
  if (t.dataset.open === 'maintNew') return maintForm();
  if (t.dataset.done) return doneForm(state.maint.find((m) => m.id === t.dataset.done));
  if (t.dataset.editMaint) return maintForm(state.maint.find((m) => m.id === t.dataset.editMaint));
  if (t.dataset.editFuel) return fuelForm(state.fuel.find((f) => f.id === t.dataset.editFuel));
  if (t.dataset.editCost) return costForm(state.costs.find((c) => c.id === t.dataset.editCost));
  if (t.dataset.theme) { state.theme = t.dataset.theme; save(); }
  if (t.dataset.lang) return setLang(t.dataset.lang);
  if (t.dataset.park === 'set') return setParking();
  if (t.dataset.park === 'edit') return parkForm();
  if (t.dataset.park === 'clear') { state.parking = null; save(); }
  if (t.dataset.prices === 'load') loadPrices();
  if (t.dataset.open === 'trip') return tripForm();
  if (t.dataset.editTrip) return tripForm(state.trips.find((x) => x.id === t.dataset.editTrip));
  if (t.dataset.open === 'tireNew') return tireForm();
  if (t.dataset.open === 'tireSwap') return swapForm();
  if (t.dataset.editTire) return tireForm(state.tires.find((x) => x.id === t.dataset.editTire));
  if (t.dataset.tread) return treadForm(state.tires.find((x) => x.id === t.dataset.tread));
  if (t.dataset.sub) showSub(t.dataset.sub);
  if (t.dataset.open === 'docs') return docsForm();
  if (t.dataset.open === 'doc') return docForm();
  if (t.dataset.editDoc) return docForm(state.documents.find((x) => x.id === t.dataset.editDoc));
  if (t.dataset.open === 'report') return reportForm();
  if (t.dataset.open === 'wizard') return openWizard();
  if (t.dataset.open === 'garage') return garageForm();
  if (t.dataset.editGarage) return garageForm(state.garages.find((x) => x.id === t.dataset.editGarage));
  if (t.dataset.resetCheck) { delete state.checks[t.dataset.resetCheck]; save(); }
  if (t.dataset.copy) {
    const url = actionUrl(t.dataset.copy);
    return navigator.clipboard.writeText(url).then(() => { t.textContent = tr('✓ Kopiert'); setTimeout(() => { t.textContent = tr('Kopieren'); }, 1500); }, () => prompt(tr('Link kopieren:'), url));
  }
  if (t.dataset.drive) return driveDetail(state.drives.find((x) => x.id === t.dataset.drive));
  if (t.dataset.open === 'accident') return accidentForm();
  if (t.dataset.editAcc) return accidentForm(state.accidents.find((x) => x.id === t.dataset.editAcc));
  if (t.dataset.shareAcc) return shareAccident(state.accidents.find((x) => x.id === t.dataset.shareAcc));
});

// Zündkerzen gibt es nur beim Benziner; Spritpreis-Sorte passend wählen
function fuelChanged(oldFuel) {
  if (oldFuel === state.car.fuel) return;
  if (state.car.fuel === 'Diesel') state.maint = state.maint.filter((m) => m.id !== 'plugs');
  else if (!state.maint.some((m) => m.id === 'plugs')) state.maint.push(defaultMaint('Benzin').find((m) => m.id === 'plugs'));
  state.prices.type = state.car.fuel === 'Diesel' ? 'diesel' : 'e5';
}

$('#carForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const oldFuel = state.car.fuel;
  state.car = { name: f.name.value.trim(), variant: f.variant.value.trim(), year: f.year.value.trim(), fuel: f.fuel.value, km: num(f.km.value), tank: num(f.tank.value) };
  fuelChanged(oldFuel);
  f.querySelector('button').blur();
  save();
  alert(tr('Gespeichert'));
});

$('#priceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  state.prices = { key: f.key.value.trim(), type: f.type.value, rad: Number(f.rad.value) };
  prices = { loading: false, error: '', list: null, time: null };
  f.querySelector('button').blur();
  save();
  alert(tr('Gespeichert'));
});

$('#driveBtn').addEventListener('click', startDrive);
$('#printBtn').addEventListener('click', () => window.print());
$('#dStop').addEventListener('click', () => { if (confirm(tr('Fahrt beenden und speichern?'))) stopDrive(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && rec) lockScreen(); });

$('#lightSearch').addEventListener('input', renderHelp);
$('#statYear').addEventListener('change', (e) => { statYear = e.target.value; renderStats(); });
$('#tripYear').addEventListener('change', (e) => { tripYear = e.target.value; render(); });
$('#tripCsv').addEventListener('click', () => {
  if (!state.trips.some((t) => t.date.startsWith(tripYear))) return alert(tr('Für {year} gibt es noch keine Fahrten.', { year: tripYear }));
  downloadFile(new File([tripsCsv()], `${tr('fahrtenbuch')}-${tripYear}.csv`, { type: 'text/csv' }));
});

$('#calBtn').addEventListener('click', () => {
  const ics = calendarFile();
  if (!ics) return alert(tr('Trag zuerst bei mindestens einem Termin ein, wann er zuletzt erledigt wurde.'));
  downloadFile(new File([ics], 'autobuch-termine.ics', { type: 'text/calendar' }));
});

$('#exportBtn').addEventListener('click', async () => {
  const name = `autobuch-${today()}.json`;
  const photos = {};
  for (const id of allPhotoIds()) {
    const blob = await photoGet(id).catch(() => null);
    if (blob) photos[id] = await blobToDataUrl(blob);
  }
  const file = new File([JSON.stringify({ ...state, photos }, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: tr('Autobuch-Sicherung') }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadFile(file);
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.car || !Array.isArray(data.fuel)) throw new Error();
    if (!confirm(tr('Aktuelle Daten durch die Sicherung ersetzen?'))) return;
    for (const [id, url] of Object.entries(data.photos || {})) await photoPut(id, await (await fetch(url)).blob());
    delete data.photos;
    state = { ...freshState(), ...data };
    save();
    alert(tr('Sicherung wiederhergestellt'));
  } catch (err) {
    alert(tr('Diese Datei ist keine gültige Autobuch-Sicherung.'));
  } finally { e.target.value = ''; }
});
$('#resetBtn').addEventListener('click', () => {
  if (confirm(tr('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.'))) { idb('readwrite', (st) => st.clear()).catch(() => {}); state = freshState(); save(); showView('start'); }
});

/* ---------- Statistik ---------- */

let statYear = String(new Date().getFullYear());

// Bekannte km-Stände mit Datum (für gefahrene km pro Jahr)
function kmPoints() {
  return [
    ...state.fuel.map((f) => [f.date, f.km]), ...state.costs.filter((x) => x.km != null).map((x) => [x.date, x.km]),
    ...state.trips.map((t) => [t.date, t.endKm]), ...state.maint.filter((m) => m.lastDate && m.lastKm != null).map((m) => [m.lastDate, m.lastKm]),
  ].filter(([d, k]) => d && k != null);
}

function yearFigures(y, exp, points, segs) {
  const inY = (d) => d && d.startsWith(y);
  const cost = exp.filter((e) => inY(e.date)).reduce((s, e) => s + e.amount, 0);
  const fuel = exp.filter((e) => inY(e.date) && e.cat === 'Kraftstoff').reduce((s, e) => s + e.amount, 0);
  const kms = points.filter(([d]) => inY(d)).map(([, k]) => k);
  const prev = points.filter(([d]) => d < y).map(([, k]) => k);
  const max = kms.length ? Math.max(...kms) : null;
  const driven = max == null ? null : max - (prev.length ? Math.max(...prev) : Math.min(...kms));
  const ys = segs.filter((sg) => inY(sg.date));
  const dist = ys.reduce((s, sg) => s + sg.dist, 0);
  return { cost, fuel, driven: driven > 0 ? driven : null, cons: dist ? ys.reduce((s, sg) => s + sg.liters, 0) / dist * 100 : null };
}

function renderStats() {
  const exp = allExpenses(), points = kmPoints(), { segs } = consumption();
  const years = [...new Set([String(new Date().getFullYear()), ...exp.map((e) => e.date?.slice(0, 4)), ...points.map(([d]) => d.slice(0, 4))].filter(Boolean))].sort().reverse();
  if (!years.includes(statYear)) statYear = years[0];
  $('#statYear').innerHTML = years.map((y) => `<option ${y === statYear ? 'selected' : ''}>${y}</option>`).join('');

  const f = yearFigures(statYear, exp, points, segs);
  const now = new Date();
  const months = statYear === String(now.getFullYear()) ? now.getMonth() + 1 : 12;
  $('#stKm').innerHTML = f.driven ? `${fmtNum(f.driven)} <small>km</small>` : '–';
  $('#stCost').textContent = f.cost ? fmtEUR(f.cost, 0) : '–';
  $('#stMonth').textContent = f.cost ? fmtEUR(f.cost / months, 0) : '–';
  $('#stPerKm').innerHTML = f.cost && f.driven ? `${fmtNum(f.cost / f.driven * 100, 0)} <small>ct</small>` : '–';

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(+statYear, i, 1);
    const key = `${statYear}-${String(i + 1).padStart(2, '0')}`;
    return {
      label: LANG === 'vi' ? String(i + 1) : d.toLocaleDateString(LOCALE, { month: 'narrow' }),
      full: d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }),
      value: exp.filter((e) => e.date?.startsWith(key)).reduce((s, e) => s + e.amount, 0),
    };
  });
  barChart($('#statChart'), monthly, {
    aria: tr('Kosten pro Monat'), tip: (v) => fmtEUR(v), axis: (g) => fmtNum(g) + ' €',
    empty: tr('In diesem Jahr gibt es noch keine Ausgaben.'),
  });

  // Sommer = April bis September
  const season = (summer) => {
    const ss = segs.filter((sg) => { const m = +sg.date.slice(5, 7); return summer ? m >= 4 && m <= 9 : m < 4 || m > 9; });
    const dist = ss.reduce((s, sg) => s + sg.dist, 0);
    return dist ? ss.reduce((s, sg) => s + sg.liters, 0) / dist * 100 : null;
  };
  const su = season(true), wi = season(false);
  $('#statSeason').innerHTML = su || wi ? `<div class="split">
      <div><div class="label">☀️ ${tr('Sommer')}</div><div class="bignum">${su ? fmtNum(su, 1) : '–'}</div><div class="label">l/100 km</div></div>
      <div><div class="label">❄️ ${tr('Winter')}</div><div class="bignum">${wi ? fmtNum(wi, 1) : '–'}</div><div class="label">l/100 km</div></div>
    </div>
    ${su && wi ? `<p class="note" style="margin-bottom:0">${tr(wi > su ? 'Im Winter verbrauchst du {p} % mehr: kalter Motor, Heizung, Winterreifen.' : 'Im Winter verbrauchst du nicht mehr als im Sommer.', { p: fmtNum((wi / su - 1) * 100, 0) })}</p>` : ''}`
    : `<p class="empty" style="margin:0">${tr('Dafür brauchst du volle Tankfüllungen im Sommer und im Winter.')}</p>`;

  const fills = state.fuel.filter((x) => x.liters > 0).map((x) => ({ ...x, ppl: x.total / x.liters }));
  if (fills.length) {
    const lo = fills.reduce((a, b) => (b.ppl < a.ppl ? b : a)), hi = fills.reduce((a, b) => (b.ppl > a.ppl ? b : a));
    const avg = fills.reduce((s, x) => s + x.total, 0) / fills.reduce((s, x) => s + x.liters, 0);
    $('#statPrices').innerHTML = `<ul class="list">
      <li><div class="grow"><div class="title">${tr('Am günstigsten')}</div><div class="meta">${fmtDate(lo.date)}${lo.station ? ' · ' + esc(lo.station) : ''}</div></div><div class="amount">${fmtEUR(lo.ppl, 3)}</div></li>
      <li><div class="grow"><div class="title">${tr('Am teuersten')}</div><div class="meta">${fmtDate(hi.date)}${hi.station ? ' · ' + esc(hi.station) : ''}</div></div><div class="amount">${fmtEUR(hi.ppl, 3)}</div></li>
      <li><div class="grow"><div class="title">${tr('Durchschnitt')}</div><div class="meta">${tr('{n} Tankfüllungen', { n: fills.length })}</div></div><div class="amount">${fmtEUR(avg, 3)}</div></li>
    </ul>`;
  } else {
    $('#statPrices').innerHTML = `<p class="empty" style="margin:0">${tr('Noch keine Tankfüllung. Tipp oben auf „Tankfüllung eintragen“.')}</p>`;
  }

  const rows = years.map((y) => ({ y, ...yearFigures(y, exp, points, segs) })).filter((r) => r.cost || r.driven);
  $('#statYears').innerHTML = rows.length ? `<table class="ytable">
      <tr><th>${tr('Jahr')}</th><th>km</th><th>l/100</th><th>${tr('Kosten')}</th><th>ct/km</th></tr>
      ${rows.map((r) => `<tr><td>${r.y}</td><td>${r.driven ? fmtNum(r.driven) : '–'}</td><td>${r.cons ? fmtNum(r.cons, 1) : '–'}</td><td>${fmtEUR(r.cost, 0)}</td><td>${r.cost && r.driven ? fmtNum(r.cost / r.driven * 100, 0) : '–'}</td></tr>`).join('')}
    </table>` : `<p class="empty" style="margin:0">${tr('Keine Daten.')}</p>`;

  // Prognose: Ausgaben der letzten 365 Tage hochgerechnet
  const since = addDays(-365);
  const last = exp.filter((e) => e.date && e.date > since);
  const sum = last.reduce((s, e) => s + e.amount, 0);
  const first = last.map((e) => e.date).sort()[0];
  const days = first ? Math.max(30, -daysUntil(first)) : 0;
  $('#statForecast').innerHTML = sum ? `<div class="bignum">≈ ${fmtEUR(sum / days * 365, 0)}</div>
    <p class="note" style="margin-bottom:0">${tr('Erwartete Kosten in den nächsten 12 Monaten, hochgerechnet aus deinen Ausgaben der letzten {n} Tage. Große Einmalkosten (z. B. neue Reifen) verzerren das.', { n: days })}</p>`
    : `<p class="empty" style="margin:0">${tr('Noch keine Daten. Sobald du tankst oder Ausgaben einträgst, erscheint hier dein Verlauf.')}</p>`;
}

/* ---------- Checklisten ---------- */

const CHECKLISTS = [
  { id: 'trip', icon: '🧳', name: 'Urlaubsfahrt', items: [
    'Reifendruck an die Beladung anpassen (Werte innen in der Tankklappe)', 'Ölstand prüfen', 'Kühlmittel und Scheibenwaschwasser auffüllen',
    'Licht und Blinker prüfen', 'Warnwesten, Warndreieck und Verbandkasten an Bord', 'Vignette oder Maut für die Transitländer besorgen',
    'Versicherungsnachweis (Grüne Karte) einpacken', 'Fahrzeugschein und Führerschein dabei', 'Route und Spritkosten planen (Reiseplaner)', 'Nummer der Pannenhilfe gespeichert'] },
  { id: 'winter', icon: '❄️', name: 'Winter-Check', items: [
    'Winterreifen montieren (Profil mindestens 4 mm)', 'Frostschutz im Kühlmittel prüfen lassen', 'Frostschutz ins Scheibenwaschwasser',
    'Batterie prüfen lassen (Kälte schwächt sie)', 'Wischerblätter prüfen', 'Eiskratzer und Handbesen ins Auto', 'Türdichtungen pflegen (gegen Festfrieren)', 'Beleuchtung prüfen'] },
  { id: 'spring', icon: '🌸', name: 'Frühjahrs-Check', items: [
    'Sommerreifen montieren, Winterreifen einlagern', 'Unterboden und Radkästen vom Streusalz befreien', 'Klimaanlage prüfen und desinfizieren lassen',
    'Wischerblätter tauschen', 'Lack waschen und versiegeln', 'Innenraumfilter prüfen'] },
  { id: 'workshop', icon: '🔧', name: 'Werkstattbesuch', items: [
    'Warnmeldungen und Geräusche notieren', 'Serviceheft mitnehmen', 'Kostenvoranschlag geben lassen', 'Wertsachen aus dem Auto nehmen',
    'Kilometerstand bei der Abgabe notieren', 'Rechnung prüfen und in Autobuch fotografieren'] },
  { id: 'sale', icon: '🏷️', name: 'Auto verkaufen', items: [
    'Verkaufs-Mappe erstellen (Tab „Mehr“)', 'Serviceheft, Rechnungen und TÜV-Bericht bereitlegen', 'Beide Schlüssel bereitlegen',
    'Auto innen und außen reinigen', 'Fotos bei Tageslicht machen', 'Marktwert recherchieren', 'Schriftlichen Kaufvertrag verwenden',
    'Abmeldung bzw. Ummeldung und Versicherung klären'] },
];

const openChecks = new Set(); // aufgeklappte Listen bleiben beim Neuzeichnen offen

function renderChecks() {
  $('#checkLists').innerHTML = CHECKLISTS.map((cl) => {
    const done = state.checks[cl.id] || {};
    const n = cl.items.filter((_, i) => done[i]).length;
    return `<details class="card" data-cl="${cl.id}"${openChecks.has(cl.id) ? ' open' : ''}>
      <summary class="maint-head"><span class="title" style="font-size:17px">${cl.icon} ${tr(cl.name)}</span>
        <span class="pill ${n === cl.items.length ? 'ok' : 'unknown'}">${n === cl.items.length ? '✓ ' : ''}${n}/${cl.items.length}</span></summary>
      <div class="progress" style="margin-top:10px"><i style="width:${n / cl.items.length * 100}%"></i></div>
      ${cl.items.map((it, i) => `<label class="checkitem${done[i] ? ' done' : ''}"><input type="checkbox" data-check="${cl.id}:${i}" ${done[i] ? 'checked' : ''}><span>${tr(it)}</span></label>`).join('')}
      ${n ? `<button class="small" data-reset-check="${cl.id}" style="margin-top:10px">${tr('Zurücksetzen')}</button>` : ''}
    </details>`;
  }).join('');
}

$('#checkLists').addEventListener('toggle', (e) => {
  const id = e.target.dataset.cl;
  if (id) e.target.open ? openChecks.add(id) : openChecks.delete(id);
}, true);
$('#checkLists').addEventListener('change', (e) => {
  const key = e.target.dataset.check;
  if (!key) return;
  const [id, i] = key.split(':');
  state.checks[id] = { ...(state.checks[id] || {}), [i]: e.target.checked };
  if (!e.target.checked) delete state.checks[id][i];
  save();
});

/* ---------- Reiseplaner ---------- */

function renderPlan() {
  const f = $('#planForm');
  // Vorbelegen mit eigenen Werten, solange das Feld unberührt ist
  // Unplausible Durchschnitte (z. B. durch vergessene Tankfüllungen) nicht übernehmen
  const avg = consumption().avg;
  if (!f.cons.dataset.touched) f.cons.value = fmtIn(avg >= 3 && avg <= 20 ? avg : 6.5, 1);
  if (!f.price.dataset.touched) {
    const l = state.fuel.reduce((s, x) => s + x.liters, 0);
    f.price.value = fmtIn(l ? state.fuel.reduce((s, x) => s + x.total, 0) / l : 1.8, 2);
  }
  const one = num(f.dist.value), cons = num(f.cons.value), price = num(f.price.value), people = Math.max(1, Math.round(num(f.people.value) || 1));
  if (!one || !cons || !price) {
    $('#planResult').innerHTML = `<p class="empty" style="margin:0">${tr('Gib die Strecke ein, dann rechnet die App Spritkosten und Tankstopps aus.')}</p>`;
    return;
  }
  const dist = one * (f.back.checked ? 2 : 1);
  const liters = dist * cons / 100, cost = liters * price;
  const range = (state.car.tank || 50) * 0.9 / cons * 100; // 10 % Reserve
  const stops = Math.max(0, Math.ceil(dist / range) - 1);
  const hours = one / 95; // Ø-Tempo inkl. Verkehr, einfache Strecke
  $('#planResult').innerHTML = `
    <div class="split" style="margin-bottom:12px">
      <div><div class="label">${tr('Spritkosten')}</div><div class="bignum">${fmtEUR(cost, 0)}</div><div class="label">${people > 1 ? tr('{eur} pro Person', { eur: fmtEUR(cost / people, 2) }) : '&nbsp;'}</div></div>
      <div><div class="label">${tr('Kraftstoff')}</div><div class="bignum">${fmtNum(liters, 0)} l</div><div class="label">${tr('für {km} km', { km: fmtNum(dist) })}</div></div>
    </div>
    <ul class="list">
      <li><div class="grow"><div class="title">⛽ ${tr('Tankstopps')}</div><div class="meta">${tr('Reichweite pro Tankfüllung ca. {km} km (mit Reserve)', { km: fmtNum(range, 0) })}</div></div><div class="amount">${stops}</div></li>
      <li><div class="grow"><div class="title">⏱ ${tr('Fahrzeit (einfache Strecke)')}</div><div class="meta">${tr('bei Ø 95 km/h, ohne Pausen')}</div></div><div class="amount">${fmtDur(hours * 3600)}</div></li>
    </ul>
    <p class="note" style="margin-bottom:0">${tr('Tipp: Spätestens alle 2 Stunden eine Pause machen. Vorher volltanken spart oft Geld, Autobahn-Tankstellen sind teurer.')}</p>`;
}

$('#planForm').addEventListener('input', (e) => { if (e.target.name === 'cons' || e.target.name === 'price') e.target.dataset.touched = '1'; renderPlan(); });

/* ---------- Werkstätten ---------- */

function renderGarages() {
  $('#garageList').innerHTML = state.garages.map((g) => `
    <div class="card">
      <div class="maint-head"><span class="title" style="font-size:17px">🔧 ${esc(g.name)}</span><button class="small" data-edit-garage="${g.id}">${tr('Bearbeiten')}</button></div>
      <div class="maint-body">
        ${g.address ? `📍 ${esc(g.address)}<br>` : ''}${g.hours ? `🕘 ${esc(g.hours)}<br>` : ''}${g.contact ? `👤 ${esc(g.contact)}<br>` : ''}${g.note ? esc(g.note) : ''}
      </div>
      <div class="maint-btns">
        ${g.phone ? `<a class="btn primary" href="${tel(g.phone)}">📞 ${tr('Anrufen')}</a>` : ''}
        ${g.address ? `<a class="btn" href="https://maps.apple.com/?daddr=${encodeURIComponent(g.address)}" target="_blank" rel="noopener">🗺️ ${tr('Route')}</a>` : ''}
      </div>
    </div>`).join('') || `<div class="card"><p class="empty" style="margin:0">${tr('Speichere deine Werkstatt, den Reifenhändler oder die Waschanlage, dann hast du Telefon und Adresse immer dabei.')}</p></div>`;
}

function garageForm(entry) {
  const e = entry || { name: '', phone: '', address: '', hours: '', contact: '', note: '' };
  openSheet(entry ? 'Werkstatt bearbeiten' : 'Werkstatt hinzufügen', `
    ${field('Name', 'name', e.name, 'required placeholder="z. B. Mercedes-Benz Niederlassung"')}
    ${field('Telefon', 'phone', e.phone, 'type="tel"')}
    ${field('Adresse', 'address', e.address, 'placeholder="Straße, PLZ Ort"')}
    ${field('Öffnungszeiten', 'hours', e.hours, 'placeholder="z. B. Mo–Fr 7:30–18 Uhr"')}
    ${field('Ansprechpartner', 'contact', e.contact, 'placeholder="z. B. Herr Schmidt (Serviceannahme)"')}
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Kundennummer 12345"')}
  `, (d) => {
    if (!d.name.trim()) return tr('Bitte einen Namen eingeben.');
    const rec = { id: entry?.id || uid(), name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(), hours: d.hours.trim(), contact: d.contact.trim(), note: d.note.trim() };
    if (entry) Object.assign(entry, rec); else state.garages.push(rec);
  }, { deleteFn: entry && (() => { state.garages = state.garages.filter((x) => x !== entry); }) });
}

/* ---------- Einrichtungs-Assistent ---------- */

const wizard = $('#wizard'), wizForm = $('#wizardForm');
let wizStep = 0;

const hasNoData = () => !state.fuel.length && !state.costs.length && !state.trips.length && state.car.km == null
  && state.maint.every((m) => !m.lastDate && m.lastKm == null);

const wizField = (label, name, value, attrs = '') => field(label, name, value ?? '', attrs);
const wizSelect = (label, name, options, selected) => `<label class="field"><span>${tr(label)}</span><select name="${name}">
  ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></label>`;
const mt = (id) => state.maint.find((m) => m.id === id) || {};

// Jeder Schritt: Symbol, Titel, Inhalt, und was beim „Weiter“ übernommen wird
const WIZ_STEPS = [
  {
    icon: '👋', title: 'Willkommen bei Autobuch',
    body: () => `<p>${tr('In ein paar kurzen Schritten richten wir die App für dein Auto ein. Jeder Schritt lässt sich überspringen und später ändern.')}</p>
      <p class="note">${tr('Sprache wählen:')}</p>
      <div class="seg" style="margin-bottom:6px">${[['de', 'Deutsch'], ['en', 'English'], ['vi', 'Tiếng Việt']].map(([l, n]) =>
        `<button type="button" data-wlang="${l}" aria-pressed="${l === LANG}">${n}</button>`).join('')}</div>`,
  },
  {
    icon: '🚗', title: 'Dein Auto',
    body: () => {
      const c = state.car;
      return `${wizField('Bezeichnung', 'name', c.name)}
        <div class="row2">${wizField('Ausstattung', 'variant', c.variant)}${wizField('Baujahr', 'year', c.year, 'inputmode="numeric"')}</div>
        <div class="row2">${wizSelect('Kraftstoff', 'fuel', [['Benzin', 'Benzin'], ['Diesel', 'Diesel']], c.fuel)}
        ${wizField('Kilometerstand', 'km', c.km ?? currentKm(), 'inputmode="numeric" placeholder="z. B. 98500"')}</div>
        <p class="hint">${tr('Den Kilometerstand siehst du im Kombiinstrument.')}</p>`;
    },
    apply: (d) => {
      const old = state.car.fuel;
      Object.assign(state.car, { name: d.name.trim() || state.car.name, variant: d.variant.trim(), year: d.year.trim(), fuel: d.fuel });
      if (num(d.km) != null) state.car.km = num(d.km);
      fuelChanged(old);
    },
  },
  {
    icon: '🔧', title: 'Wartung',
    body: () => {
      const sv = mt('service'), hu = mt('hu'), br = mt('brake');
      const huDue = hu.lastDate ? addMonths(hu.lastDate, 24).slice(0, 7) : '';
      return `<p class="note" style="margin-top:0">${tr('Steht im Serviceheft oder auf der letzten Werkstattrechnung.')}</p>
        <div class="row2">${wizField('Letzter Service am', 'svDate', sv.lastDate, 'type="date"')}${wizField('bei km', 'svKm', sv.lastKm, 'inputmode="numeric"')}</div>
        ${wizSelect('Das war', 'svType', [['A', 'Service A'], ['B', 'Service B']], sv.lastAlt || 'A')}
        ${wizField('Nächster TÜV (Monat auf der Plakette)', 'huDue', huDue, 'type="month"')}
        <p class="hint">${tr('Die Plakette hinten am Kennzeichen zeigt Monat und Jahr der nächsten Hauptuntersuchung.')}</p>
        ${wizField('Bremsflüssigkeit zuletzt gewechselt (optional)', 'brDate', br.lastDate, 'type="date"')}`;
    },
    apply: (d) => {
      const sv = mt('service');
      if (d.svDate || num(d.svKm) != null) Object.assign(sv, { lastDate: d.svDate, lastKm: num(d.svKm), lastAlt: d.svType });
      if (d.huDue) mt('hu').lastDate = addMonths(d.huDue + '-15', -24);
      if (d.brDate) mt('brake').lastDate = d.brDate;
    },
  },
  {
    icon: '🛞', title: 'Reifen',
    body: () => state.tires.length
      ? `<p>${tr('Du hast schon Reifensätze angelegt. Die verwaltest du unter Wartung → Reifen.')}</p>`
      : `${wizSelect('Welche Reifen sind gerade drauf?', 'season', [['Sommer', 'Sommerreifen'], ['Winter', 'Winterreifen'], ['Ganzjahr', 'Ganzjahrreifen']], new Date().getMonth() >= 9 || new Date().getMonth() <= 2 ? 'Winter' : 'Sommer')}
        <div class="row2">${wizField('Größe', 'size', '', 'placeholder="z. B. 225/40 R18"')}${wizField('DOT (4 Ziffern)', 'dot', '', 'inputmode="numeric" maxlength="4" placeholder="z. B. 2321"')}</div>
        <p class="hint">${tr('Größe und DOT stehen auf der Reifenflanke. Die letzten 4 Ziffern der DOT-Nummer sind das Herstelldatum: 2321 = Woche 23 im Jahr 2021.')}</p>
        <label class="check"><input type="checkbox" name="second" checked> ${tr('Ich habe noch einen zweiten Satz (Sommer/Winter)')}</label>
        ${wizField('Wo lagert der zweite Satz?', 'loc', '', 'placeholder="z. B. Keller oder Reifenhotel, Nr. 4711"')}
        <label class="check"><input type="checkbox" name="alpine" checked> ${tr('Die Winterreifen haben das Schneeflocken-Symbol (Berg mit Schneeflocke)')}</label>`,
    apply: (d) => {
      if (state.tires.length || !d.season) return;
      if (d.dot && tireAge(d.dot) == null) return tr('Die DOT-Angabe muss 4 Ziffern haben, z. B. 2321.');
      const mk = (season, extra = {}) => ({ id: uid(), name: `${season}reifen`, season, brand: '', size: '', dot: '', alpine: season !== 'Sommer' && d.alpine === 'on', location: '', km: 0, note: '', tread: null, ...extra });
      const on = mk(d.season, { size: d.size.trim(), dot: d.dot.trim() });
      state.tires.push(on);
      if (d.second === 'on' && d.season !== 'Ganzjahr') state.tires.push(mk(d.season === 'Sommer' ? 'Winter' : 'Sommer', { size: d.size.trim(), location: d.loc.trim() }));
      state.mounted = { id: on.id, date: '', km: currentKm() };
      if (d.season !== 'Ganzjahr') mt('tires').lastAlt = d.season + 'reifen';
    },
  },
  {
    icon: '🚨', title: 'Für den Notfall',
    body: () => {
      const x = state.docs;
      return `<p class="note" style="margin-top:0">${tr('Damit du nach einem Unfall oder einer Panne alles griffbereit hast.')}</p>
        <div class="row2">${wizField('Kennzeichen', 'plate', x.plate, 'autocapitalize="characters" placeholder="z. B. S-AB 1234"')}${wizField('Versicherung', 'insurer', x.insurer, 'placeholder="z. B. HUK-COBURG"')}</div>
        ${wizField('Versicherungsnr.', 'policy', x.policy)}
        ${wizField('Schadenhotline', 'claimPhone', x.claimPhone, 'type="tel" placeholder="steht auf deiner Versicherungskarte"')}
        ${wizField('Pannenhilfe', 'breakdown', x.breakdown, 'type="tel" placeholder="z. B. ADAC: 089 20 20 4000"')}`;
    },
    apply: (d) => {
      Object.assign(state.docs, { plate: d.plate.trim().toUpperCase(), insurer: d.insurer.trim(), policy: d.policy.trim(), claimPhone: d.claimPhone.trim(), breakdown: d.breakdown.trim() });
    },
  },
  {
    icon: '🎉', title: 'Fertig!',
    body: () => `<p>${tr('Deine App ist eingerichtet. Drei Tipps zum Start:')}</p>
      <ol class="steps">
        <li>${tr('Beim nächsten Tanken auf <b>⛽ Tanken</b> tippen. Ab der zweiten vollen Tankfüllung siehst du deinen Verbrauch.')}</li>
        <li>${tr('Unter <b>Wartung</b> siehst du, was als Nächstes fällig ist. Mit <b>📅 In den Kalender</b> bekommst du Erinnerungen.')}</li>
        <li>${tr('Ab und zu unter <b>Mehr → Datensicherung</b> eine Sicherung anlegen.')}</li>
      </ol>`,
  },
];

function openWizard() {
  wizStep = 0;
  renderWizard();
  if (!wizard.open) wizard.showModal();
}

function renderWizard() {
  const st = WIZ_STEPS[wizStep], last = wizStep === WIZ_STEPS.length - 1;
  wizForm.innerHTML = `
    <div class="wiz-dots" aria-label="${tr('Schritt {n} von {total}', { n: wizStep + 1, total: WIZ_STEPS.length })}">
      ${WIZ_STEPS.map((_, i) => `<span class="${i === wizStep ? 'on' : i < wizStep ? 'done' : ''}"></span>`).join('')}</div>
    <div class="wiz-icon" aria-hidden="true">${st.icon}</div>
    <h3>${tr(st.title)}</h3>
    ${st.body()}
    <div class="form-btns">
      ${wizStep ? `<button type="button" data-wiz="back">${tr('Zurück')}</button>` : ''}
      <button class="primary" value="next">${tr(last ? 'Los geht’s' : 'Weiter')}</button>
    </div>
    ${!last ? `<button type="button" class="link" data-wiz="${wizStep ? 'skip' : 'later'}" style="width:100%;margin-top:10px">${tr(wizStep ? 'Diesen Schritt überspringen' : 'Später einrichten')}</button>` : ''}`;
  wizForm.scrollTop = 0;
}

function wizNext(apply) {
  const st = WIZ_STEPS[wizStep];
  if (apply && st.apply) {
    const err = st.apply(Object.fromEntries(new FormData(wizForm)));
    if (err) return alert(err);
    save();
  }
  if (wizStep === WIZ_STEPS.length - 1) return closeWizard();
  wizStep++;
  renderWizard();
}

wizForm.addEventListener('submit', (e) => { e.preventDefault(); wizNext(true); });
wizForm.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.wlang) { setLang(b.dataset.wlang); renderWizard(); }
  if (b.dataset.wiz === 'back') { wizStep--; renderWizard(); }
  if (b.dataset.wiz === 'skip') wizNext(false);
  if (b.dataset.wiz === 'later') closeWizard();
});
function closeWizard() {
  state.onboarded = true;
  save();
  if (wizard.open) wizard.close();
}
wizard.addEventListener('close', () => { if (!state.onboarded) closeWizard(); }); // z. B. per Escape-Taste

/* ---------- Sprache ---------- */

function setLang(l) {
  state.lang = l;
  initLang(l);
  applyStatic();
  save();
  renderLinks();
  renderDrive();
  showView(currentView === 'report' ? 'more' : currentView);
}

let startView = 'start';
try { startView = sessionStorage.getItem('autobuch-view') || 'start'; } catch (e) { /* egal */ }
initLang(state.lang);
collectStatic();
applyStatic();
render();
showView(TITLES[startView] && !['drive', 'report'].includes(startView) ? startView : 'start');
renderLinks();
if (!state.onboarded && hasNoData()) openWizard();
handleUrlAction();

// Zoomen mit zwei Fingern verhindern (Safari ignoriert user-scalable=no teilweise)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
// Zwei Finger schon beim Aufsetzen abfangen, nicht erst beim Bewegen
document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
// Notbremse: falls iOS doch hineinzoomt, sofort auf 100 % zurücksetzen
if (window.visualViewport) {
  const vp = document.querySelector('meta[name=viewport]'), base = vp.content;
  visualViewport.addEventListener('resize', () => {
    if (visualViewport.scale > 1.01) { vp.content = base + ', minimum-scale=1'; setTimeout(() => { vp.content = base; }, 300); }
  });
}
$('#appVersion').textContent = `Autobuch · Version ${APP_VERSION}`;

// Neue Version sofort übernehmen, sobald der Service Worker sie geladen hat
if ('serviceWorker' in navigator) {
  const hadOldVersion = !!navigator.serviceWorker.controller; // beim allerersten Besuch nicht neu laden
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOldVersion && !reloaded) { reloaded = true; location.reload(); } });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
