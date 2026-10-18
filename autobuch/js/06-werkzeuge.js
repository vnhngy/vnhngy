'use strict';
// Autobuch – Statistik, Checklisten, Reiseplaner und Werkstätten.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Statistik ---------- */

let statYear = String(new Date().getFullYear());

// Bekannte km-Stände mit Datum (für gefahrene km pro Jahr)
function kmPoints() {
  return [
    ...state.fuel.map((f) => [f.date, f.km]), ...state.costs.filter((x) => x.km != null).map((x) => [x.date, x.km]),
    ...state.trips.map((t) => [t.date, t.endKm]), ...state.maint.filter((m) => m.lastDate && m.lastKm != null).map((m) => [m.lastDate, m.lastKm]),
    [state.car.kmDate, state.car.km],
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

  // Preise je Sorte; günstigster/teuerster Tankstopp nur innerhalb der Hauptsorte (gleiche Einheit)
  const fills = state.fuel.filter((x) => x.liters > 0 && gradeOf(fillGrade(x)).fam === mainFam()).map((x) => ({ ...x, ppl: x.total / x.liters }));
  const byGrade = GRADES.map((g) => {
    const gf = state.fuel.filter((x) => x.liters > 0 && fillGrade(x) === g.id);
    return gf.length ? { g, n: gf.length, avg: gf.reduce((s, x) => s + x.total, 0) / gf.reduce((s, x) => s + x.liters, 0) } : null;
  }).filter(Boolean);
  if (fills.length) {
    const lo = fills.reduce((a, b) => (b.ppl < a.ppl ? b : a)), hi = fills.reduce((a, b) => (b.ppl > a.ppl ? b : a));
    const avg = fills.reduce((s, x) => s + x.total, 0) / fills.reduce((s, x) => s + x.liters, 0);
    $('#statPrices').innerHTML = `<ul class="list">
      <li><div class="grow"><div class="title">${tr('Am günstigsten')}</div><div class="meta">${fmtDate(lo.date)}${lo.station ? ' · ' + esc(lo.station) : ''}</div></div><div class="amount">${fmtEUR(lo.ppl, 3)}</div></li>
      <li><div class="grow"><div class="title">${tr('Am teuersten')}</div><div class="meta">${fmtDate(hi.date)}${hi.station ? ' · ' + esc(hi.station) : ''}</div></div><div class="amount">${fmtEUR(hi.ppl, 3)}</div></li>
      <li><div class="grow"><div class="title">${tr('Durchschnitt')}</div><div class="meta">${tr('{n} Tankfüllungen', { n: fills.length })}</div></div><div class="amount">${fmtEUR(avg, 3)}</div></li>
      ${byGrade.length > 1 ? byGrade.map((x) => `<li><div class="grow"><div class="title">Ø ${tr(x.g.id)}</div><div class="meta">${tr('{n} Tankfüllungen', { n: x.n })}</div></div><div class="amount">${fmtEUR(x.avg, 3)}/${unitOf(x.g.id)}</div></li>`).join('') : ''}
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
  renderStatsExtras();
  updateSaveCalc();
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
  { id: 'buy', icon: '🔎', name: 'Gebrauchtwagenkauf', items: [
    'Fahrzeugbrief prüfen: Steht der Verkäufer drin? Mit dem Ausweis vergleichen', 'FIN am Auto mit den Papieren vergleichen',
    'Serviceheft und Rechnungen ansehen: Wurde regelmäßig gewartet?', 'HU-Bericht und Termin der nächsten HU prüfen',
    'Kilometerstand plausibel? Mit Serviceheft und HU-Berichten vergleichen', 'Bei Tageslicht ansehen: Lackunterschiede, Spaltmaße, Rost',
    'Reifen: Profil, Alter (DOT) und gleichmäßige Abnutzung', 'Kaltstart: Geräusche, Rauch, gehen alle Warnleuchten aus?',
    'Probefahrt: Bremsen, Lenkung, Kupplung oder Getriebe, Geräusche', 'Motor und Unterboden auf Öl- oder Wasserverlust prüfen',
    'Bekannte Unfallschäden schriftlich in den Kaufvertrag', 'Rückrufe für das Modell prüfen (KBA)'] },
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

// Ausgaben aller Fahrzeuge, die dieser Werkstatt zugeordnet sind
function garageSpend(id) {
  const list = [state, ...Object.values(state.otherCars || {})].flatMap((d) => d.costs || []).filter((c) => c.garageId === id);
  return { sum: list.reduce((s, c) => s + c.amount, 0), n: list.length, last: list.map((c) => c.date).sort().pop() };
}
const stars = (n) => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';

function renderGarages() {
  $('#garageList').innerHTML = state.garages.map((g) => {
    const sp = garageSpend(g.id);
    return `
    <div class="card">
      <div class="maint-head"><span class="title" style="font-size:17px">🔧 ${esc(g.name)}</span><button class="small" data-edit-garage="${g.id}">${tr('Bearbeiten')}</button></div>
      ${g.rating ? `<div class="stars" aria-label="${tr('{n} von 5 Sternen', { n: g.rating })}">${stars(g.rating)}</div>` : ''}
      ${sp.n ? `<div class="meta">${tr(sp.n === 1 ? '1 Rechnung, zusammen {eur} · zuletzt {date}' : '{n} Rechnungen, zusammen {eur} · zuletzt {date}', { n: sp.n, eur: fmtEUR(sp.sum, 0), date: fmtDate(sp.last) })}</div>` : ''}
      <div class="maint-body">
        ${g.address ? `📍 ${esc(g.address)}<br>` : ''}${g.hours ? `🕘 ${esc(g.hours)}<br>` : ''}${g.contact ? `👤 ${esc(g.contact)}<br>` : ''}${g.note ? esc(g.note) : ''}
      </div>
      <div class="maint-btns">
        ${g.phone ? `<a class="btn primary" href="${tel(g.phone)}">📞 ${tr('Anrufen')}</a>` : ''}
        ${g.address ? `<a class="btn" href="https://maps.apple.com/?daddr=${encodeURIComponent(g.address)}" target="_blank" rel="noopener">🗺️ ${tr('Route')}</a>` : ''}
      </div>
    </div>`;
  }).join('') || `<div class="card"><p class="empty" style="margin:0">${tr('Speichere deine Werkstatt, den Reifenhändler oder die Waschanlage, dann hast du Telefon und Adresse immer dabei.')}</p></div>`;
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
    <label class="field"><span>${tr('Bewertung')}</span><select name="rating">${[0, 5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === (e.rating || 0) ? 'selected' : ''}>${n ? stars(n) : tr('keine')}</option>`).join('')}</select></label>
  `, (d) => {
    if (!d.name.trim()) return tr('Bitte einen Namen eingeben.');
    const rec = { id: entry?.id || uid(), name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(), hours: d.hours.trim(), contact: d.contact.trim(), note: d.note.trim(), rating: Number(d.rating) || 0 };
    if (entry) Object.assign(entry, rec); else state.garages.push(rec);
  }, { deleteFn: entry && (() => { state.garages = state.garages.filter((x) => x !== entry); }) });
}
