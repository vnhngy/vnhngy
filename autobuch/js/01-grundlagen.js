'use strict';
// Autobuch – Daten, Hilfsfunktionen, Berechnungen und das Zeichnen der Hauptansichten.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Daten ---------- */

const STORE_KEY = 'autobuch-v1';
const APP_VERSION = '31'; // bei jedem Update zusammen mit VERSION in sw.js erhöhen
const COST_CATS = ['Werkstatt', 'Versicherung', 'Kfz-Steuer', 'Reifen', 'Pflege', 'Parken', 'Leasing/Finanzierung', 'Bußgeld', 'Sonstiges'];
// Antriebsarten des Fahrzeugs und Spritsorten beim Tanken (Erdgas wird in kg getankt)
const CAR_FUELS = ['Benzin', 'Super E10', 'Super Plus', 'Diesel', 'Autogas (LPG)', 'Erdgas (CNG)', 'Hybrid', 'Plug-in-Hybrid'];
// Anzeigename im Auswahlfeld (Benziner mit ihrer Sorte)
const fuelLabel = (f) => ({ Benzin: 'Benzin (Super E5)', 'Super E10': 'Benzin (Super E10)', 'Super Plus': 'Benzin (Super Plus)' })[f] || f;
const GRADES = [
  { id: 'Super E5', fam: 'benzin' }, { id: 'Super E10', fam: 'benzin' }, { id: 'Super Plus', fam: 'benzin' },
  { id: 'Diesel', fam: 'diesel' }, { id: 'Premium-Diesel', fam: 'diesel' },
  { id: 'Autogas (LPG)', fam: 'lpg' }, { id: 'Erdgas (CNG)', fam: 'cng', unit: 'kg' },
];
const gradeOf = (id) => GRADES.find((g) => g.id === id) || GRADES[0];
const defaultGrade = (carFuel = state.car.fuel) => ({ Diesel: 'Diesel', 'Super E10': 'Super E10', 'Super Plus': 'Super Plus', 'Autogas (LPG)': 'Autogas (LPG)', 'Erdgas (CNG)': 'Erdgas (CNG)' })[carFuel] || 'Super E5';
const fillGrade = (f) => f.grade || defaultGrade(); // ältere Einträge haben noch keine Sorte
const mainFam = () => gradeOf(defaultGrade()).fam;
const unitOf = (grade) => gradeOf(grade).unit || 'l';
const consUnit = () => unitOf(defaultGrade()) + '/100';

// Daten, die zu einem Fahrzeug gehören. Beim Wechsel des Autos werden genau diese Felder getauscht.
const CAR_KEYS = ['car', 'fuel', 'costs', 'maint', 'trips', 'tires', 'mounted', 'drives', 'accidents', 'parking', 'docs', 'recurring', 'fines', 'values', 'logs', 'notes', 'budget', 'damages', 'leasing', 'specs', 'handovers', 'issues', 'insKm', 'supplies', 'care', 'pool'];

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
    recurring: [], fines: [], values: [], logs: [], notes: [], budget: { monthly: null }, damages: [], leasing: null, specs: {}, handovers: [], issues: [], insKm: null, supplies: [], care: {}, pool: { people: [], rate: null }, quizBest: 0, lock: null, dismissed: [],
    carId: null, otherCars: {}, lastBackup: null, backupSnooze: null,
    home: null, // { order, hidden, tiles } – Aufbau der Übersicht
  };
}

let state = load();

function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return freshState(); } // Speicher nicht verfügbar
  if (!raw) return freshState();
  try {
    return { ...freshState(), ...JSON.parse(raw) };
  } catch (e) {
    // Unlesbare Daten nicht still überschreiben: Kopie aufheben
    try { localStorage.setItem(STORE_KEY + '-defekt', raw); } catch (e2) { /* egal */ }
    return freshState();
  }
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
  const fam = mainFam();
  const fills = state.fuel.filter((f) => gradeOf(fillGrade(f)).fam === fam).sort((a, b) => a.km - b.km);
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
  $('#carLine').innerHTML = esc([c.name, c.variant, c.year, tr(c.fuel)].filter(Boolean).join(' · ')) + ' <span class="chev">▾</span>';

  const km = currentKm();
  const cons = consumption();
  const year = new Date().getFullYear();
  const exp = allExpenses();
  const yearExp = exp.filter((e) => e.date && e.date.startsWith(String(year)));
  const yearSum = yearExp.reduce((s, e) => s + e.amount, 0);

  // Übersicht
  $('#sKm').innerHTML = km != null ? `${fmtNum(km)} <small>km</small>` : '–';
  $('#sCons').innerHTML = cons.avg != null ? `${fmtNum(cons.avg, 1)} <small>${consUnit()}</small>` : '–';
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
  renderNotices();
  renderCarHero();
  renderForecast();
  applyHome();
  renderRecurring();
  renderFines();
  renderValue();
  renderLogs();
  renderAwards();
  renderBudget();
  renderNotes();
  renderAgenda();
  renderFavRoutes();
  renderExtras2();
  renderExtras3();
  renderExtras4();
  renderExtras5();
  renderExtras6();
  renderExtras7();
  renderGuides();
  const lb = $('#lastBackup');
  lb.textContent = state.lastBackup ? tr('Letzte Sicherung: {date}', { date: fmtDate(state.lastBackup) }) : tr('Noch keine Sicherung angelegt.');

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
        <div class="meta">${tr(fillGrade(f))} · ${fmtNum(f.km)} km · ${fmtNum(f.liters, 2)} ${unitOf(fillGrade(f))} · ${fmtEUR(f.total / f.liters, 3)}/${unitOf(fillGrade(f))}${f.station ? ' · ' + esc(f.station) : ''}${f.photos?.length ? ' · 📎' : ''}</div>
      </div>
      <div class="amount">${fmtEUR(f.total)}<div class="meta">${cons.per[f.id] != null ? fmtNum(cons.per[f.id], 1) + ' ' + consUnit() : ''}</div></div>
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
      <div class="meta">${cst.recurringId ? '🔁 ' : ''}${fmtDate(cst.date)}${cst.note ? ' · ' + esc(cst.note) : ''}${cst.km != null ? ' · ' + fmtNum(cst.km) + ' km' : ''}${cst.photos?.length ? ' · 📎 ' + cst.photos.length : ''}</div></div>
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
    tip: (v) => fmtNum(v, 1) + ' ' + consUnit() + ' km',
    axis: (g) => fmtNum(g, g % 1 ? 1 : 0) + ' ' + unitOf(defaultGrade()),
    empty: tr('Ab der zweiten vollen Tankfüllung siehst du hier deinen Verbrauch.'),
  });
}
