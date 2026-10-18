'use strict';
// Drivo – km-Stand schnell eintragen, E5/E10-Rechner, Fahrtkosten teilen, echte Monatskosten,
// monatliche Prüf-Erinnerung, Fahrzeugvergleich, Hinweis bei Safari statt Home-Bildschirm-App.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- km-Stand schnell eintragen ---------- */

function kmForm() {
  const known = currentKm();
  openSheet('Kilometerstand eintragen', `
    ${field('Kilometerstand', 'km', '', 'inputmode="numeric" required placeholder="z. B. 98500"')}
    ${known != null ? `<p class="hint">${tr('Letzter bekannter Stand: {km} km', { km: fmtNum(known) })}</p>` : ''}
  `, (d) => {
    const km = num(d.km);
    if (km == null || km <= 0) return tr('Bitte einen Kilometerstand eingeben.');
    if (known != null && km < known) return tr('Der km-Stand kann nicht kleiner sein als der zuletzt bekannte ({km} km).', { km: fmtNum(known) });
    state.car.km = km;
    state.car.kmDate = today();
  });
  setTimeout(() => sheetForm.km.focus(), 300);
}

/* ---------- Kosten pro km ---------- */

// Ø Spritpreis der letzten Füllungen (Hauptsorte)
function recentPrice(grade) {
  const fills = state.fuel.filter((x) => x.liters > 0 && (grade ? fillGrade(x) === grade : gradeOf(fillGrade(x)).fam === mainFam()))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return fills.length ? fills.reduce((s, x) => s + x.total, 0) / fills.reduce((s, x) => s + x.liters, 0) : null;
}

// Sprit pro km und alle Kosten pro km (seit der ersten Tankfüllung)
function costPerKm() {
  const cons = consumption().avg, price = recentPrice();
  const fuel = cons && price ? cons / 100 * price : null;
  const kms = state.fuel.map((f) => f.km);
  const driven = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0;
  let all = null;
  if (driven > 0) {
    const first = [...state.fuel].sort((a, b) => a.km - b.km)[0];
    all = (allExpenses().filter((e) => e.date >= first.date).reduce((s, e) => s + e.amount, 0) - first.total) / driven;
  }
  return { fuel, all };
}

/* ---------- Fahrtkosten teilen ---------- */

function shareTripCost(t) {
  sheet.close();
  setTimeout(() => {
    const k = costPerKm(), dist = t.endKm - t.startKm;
    openSheet('Fahrtkosten teilen', `
      <p class="note" style="margin-top:0">${esc(t.from || '?')} → ${esc(t.to || '?')} · ${fmtNum(dist)} km · ${fmtDate(t.date)}</p>
      <label class="field"><span>${tr('Abrechnen nach')}</span><select name="mode">
        <option value="fuel">${tr('Nur Sprit')}${k.fuel ? ` (${fmtNum(k.fuel * 100, 1)} ct/km)` : ''}</option>
        <option value="all" ${k.all ? '' : 'disabled'}>${tr('Alle Autokosten')}${k.all ? ` (${fmtNum(k.all * 100, 1)} ct/km)` : ''}</option>
        <option value="biz">${tr('Pauschale 0,30 €/km')}</option>
      </select></label>
      ${field('Personen im Auto (mit dir)', 'people', 2, 'inputmode="numeric"')}
      <div class="bignum" id="splitOut" style="text-align:center;margin:6px 0">–</div>
      <p class="hint" id="splitHint" style="text-align:center"></p>
      <button type="button" class="primary" id="splitShare" style="width:100%">${tr('Teilen')}</button>
    `, () => {}, { submitLabel: 'Fertig' });
    const rate = (m) => (m === 'all' ? k.all : m === 'biz' ? BIZ_RATE : k.fuel ?? (7 / 100 * 1.8));
    let text = '';
    const calc = () => {
      const people = Math.max(1, Math.round(num(sheetForm.people.value) || 1));
      const total = dist * rate(sheetForm.mode.value), each = total / people;
      $('#splitOut').textContent = tr('{eur} pro Person', { eur: fmtEUR(each) });
      $('#splitHint').textContent = tr('Gesamt {eur} für {km} km', { eur: fmtEUR(total), km: fmtNum(dist) });
      text = tr('Fahrt {from} → {to} am {date}: {km} km, zusammen {total}. Anteil pro Person: {each}.', {
        from: t.from || '?', to: t.to || '?', date: fmtDate(t.date), km: fmtNum(dist), total: fmtEUR(total), each: fmtEUR(each),
      });
    };
    sheetForm.mode.addEventListener('change', calc);
    sheetForm.people.addEventListener('input', calc);
    calc();
    $('#splitShare').onclick = async () => {
      if (navigator.share) { try { return await navigator.share({ text }); } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(text); alert(tr('In die Zwischenablage kopiert')); } catch (e) { prompt(tr('Link kopieren:'), text); }
    };
  }, 50);
}

/* ---------- E5 oder E10? ---------- */

const E10_EXTRA = 0.015; // E10 braucht bis zu ca. 1,5 % mehr (ADAC)

function renderE10() {
  const card = $('#e10Card');
  card.hidden = mainFam() !== 'benzin';
  if (card.hidden) return;
  const f = $('#e10Form');
  if (!f.e5.dataset.touched && !f.e5.value) f.e5.value = fmtIn(recentPrice('Super E5'), 3);
  if (!f.e10.dataset.touched && !f.e10.value) f.e10.value = fmtIn(recentPrice('Super E10'), 3);
  const e5 = num(f.e5.value), e10 = num(f.e10.value);
  if (!e5 || !e10) { $('#e10Out').innerHTML = `<p class="empty" style="margin:0">${tr('Trag die beiden Preise von der Zapfsäule ein.')}</p>`; return; }
  const cons = consumption().avg || 6.5, kpd = kmPerDay(), year = kpd ? kpd * 365 : 12000;
  const per100e5 = cons * e5, per100e10 = cons * (1 + E10_EXTRA) * e10;
  const save = (per100e5 - per100e10) / 100 * year;
  const breakEven = e5 / (1 + E10_EXTRA);
  $('#e10Out').innerHTML = `<div class="split">
      <div><div class="label">${tr('E5 pro 100 km')}</div><div class="bignum">${fmtEUR(per100e5)}</div></div>
      <div><div class="label">${tr('E10 pro 100 km')}</div><div class="bignum">${fmtEUR(per100e10)}</div></div>
    </div>
    <p class="note" style="margin-bottom:0"><b>${save > 0 ? tr('E10 lohnt sich: ca. {eur} Ersparnis im Jahr.', { eur: fmtEUR(save, 0) }) : tr('E5 ist hier günstiger, trotz höherem Preis.')}</b>
      ${tr('E10 lohnt sich, solange es mindestens {ct} ct billiger ist als E5 (wegen bis zu 1,5 % Mehrverbrauch).', { ct: fmtNum((e5 - breakEven) * 100, 1) })}</p>`;
}
$('#e10Form').addEventListener('input', (e) => { e.target.dataset.touched = '1'; renderE10(); });
$('#e10Form').addEventListener('submit', (e) => e.preventDefault());

/* ---------- Echte Monatskosten ---------- */

const TICKET = { year: 2026, price: 63 }; // Deutschlandticket pro Monat

function trueMonthly() {
  const since = addDays(-365);
  const exp = allExpenses().filter((e) => e.date && e.date > since);
  if (!exp.length) return null;
  const first = exp.map((e) => e.date).sort()[0];
  const months = Math.max(1, Math.min(12, -daysUntil(first) / 30.44));
  const group = { fuel: 0, fixed: 0, repair: 0, other: 0 };
  exp.forEach((e) => {
    const g = e.cat === 'Kraftstoff' ? 'fuel' : ['Versicherung', 'Kfz-Steuer', 'Leasing/Finanzierung'].includes(e.cat) ? 'fixed' : ['Werkstatt', 'Reifen'].includes(e.cat) ? 'repair' : 'other';
    group[g] += e.amount;
  });
  Object.keys(group).forEach((k) => { group[k] /= months; });
  const vals = [...state.values].sort((a, b) => a.date.localeCompare(b.date));
  let loss = null;
  if (vals.length >= 2) {
    const yrs = (daysUntil(vals[vals.length - 1].date) - daysUntil(vals[0].date)) / 365.25;
    if (yrs >= 0.15) loss = Math.max(0, (vals[0].value - vals[vals.length - 1].value) / yrs / 12);
  }
  const total = group.fuel + group.fixed + group.repair + group.other + (loss || 0);
  return { ...group, loss, total, months };
}

function renderTrueCost() {
  const m = trueMonthly();
  if (!m) { $('#trueCost').innerHTML = `<p class="empty" style="margin:0">${tr('Noch keine Ausgaben (Tankfüllungen werden automatisch mitgezählt).')}</p>`; return; }
  const row = (label, v, note = '') => v ? `<li><div class="grow"><div class="title">${tr(label)}</div>${note ? `<div class="meta">${note}</div>` : ''}</div><div class="amount">${fmtEUR(v, 0)}</div></li>` : '';
  const tickets = m.total / TICKET.price;
  $('#trueCost').innerHTML = `<div class="bignum">≈ ${fmtEUR(m.total, 0)} <small>${tr('pro Monat')}</small></div>
    <ul class="list" style="margin-top:8px">
      ${row('Sprit', m.fuel)}${row('Versicherung, Steuer, Leasing', m.fixed)}${row('Werkstatt & Reifen', m.repair)}${row('Sonstiges', m.other)}
      ${m.loss != null ? row('Wertverlust', m.loss, tr('aus deinem Wertverlauf')) : ''}
    </ul>
    <p class="note" style="margin-bottom:0">${tr('🚆 Das sind so viel wie {n} Deutschlandtickets ({price} im Monat, Stand {year}).', { n: fmtNum(tickets, 1), price: fmtEUR(TICKET.price, 0), year: TICKET.year })}
      ${m.loss == null ? ' ' + tr('Der Wertverlust fehlt noch: Trag unter „Wert“ ab und zu den Marktwert ein.') : ''}
      ${m.months < 11 ? ' ' + tr('Hochgerechnet aus {n} Monaten.', { n: fmtNum(m.months, 0) }) : ''}</p>`;
}

/* ---------- Monatliche Prüf-Erinnerung (Kalender) ---------- */

function checkReminderFile() {
  // erster Samstag des nächsten Monats um 10 Uhr, danach jeden ersten Samstag
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const esc2 = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const title = tr('{car}: Monats-Check', { car: state.car.name || tr('Auto') });
  const desc = tr('Reifendruck (kalte Reifen), Ölstand, Kühlwasser, Scheibenwaschwasser, Licht und Blinker prüfen. Danach in Drivo unter „Öl & Druck“ eintragen.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Drivo//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:monthly-check-${state.carId}@autobuch`, `DTSTAMP:${stamp}`, `DTSTART:${ymd}T100000`, `DTEND:${ymd}T101500`,
    'RRULE:FREQ=MONTHLY;BYDAY=1SA', `SUMMARY:${esc2(title)}`, `DESCRIPTION:${esc2(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

/* ---------- Fahrzeugvergleich ---------- */

// Rechnet kurz mit den Daten eines anderen Fahrzeugs und stellt danach alles wieder her
function withCar(data, fn) {
  const saved = pickCar(state), fresh = freshState();
  CAR_KEYS.forEach((k) => { state[k] = data[k] !== undefined ? data[k] : fresh[k]; });
  try { return fn(); } finally { Object.assign(state, saved); }
}

function carFigures() {
  const since = addDays(-365);
  const cost = allExpenses().filter((e) => e.date && e.date > since).reduce((s, e) => s + e.amount, 0);
  const pts = kmPoints(), inside = pts.filter(([d]) => d > since).map(([, k]) => k), before = pts.filter(([d]) => d <= since).map(([, k]) => k);
  const driven = inside.length ? Math.max(...inside) - (before.length ? Math.max(...before) : Math.min(...inside)) : null;
  return { name: state.car.name || tr('Auto'), cons: consumption().avg, unit: consUnit(), cost, driven: driven > 0 ? driven : null };
}

function renderCompare() {
  const others = Object.values(state.otherCars || {});
  $('#compareCard').hidden = !others.length;
  if (!others.length) return;
  const rows = [carFigures(), ...others.map((d) => withCar(d, carFigures))];
  $('#compareBody').innerHTML = `<table class="ytable">
    <tr><th></th><th>km</th><th>${tr('Verbrauch')}</th><th>${tr('Kosten')}</th><th>ct/km</th></tr>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.driven ? fmtNum(r.driven) : '–'}</td><td>${r.cons ? fmtNum(r.cons, 1) : '–'}</td><td>${fmtEUR(r.cost, 0)}</td><td>${r.cost && r.driven ? fmtNum(r.cost / r.driven * 100, 0) : '–'}</td></tr>`).join('')}
  </table><p class="note" style="margin-bottom:0">${tr('Die letzten 12 Monate. Verbrauch in l/100 km (Erdgas: kg/100 km).')}</p>`;
}

/* ---------- Safari statt Home-Bildschirm-App ---------- */

// iOS öffnet Links aus Kurzbefehlen in Safari. Safari hat einen eigenen Speicher, getrennt von der Home-Bildschirm-App.
const inSafariOnIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;

function safariNotice() {
  if (!inSafariOnIos() || !hasNoData()) return '';
  return `<div class="card notice"><span class="ico">⚠</span><div class="grow">
    <div class="title">${tr('Du bist in Safari, nicht in der Drivo-App')}</div>
    <div class="meta">${tr('Safari speichert getrennt von der App auf deinem Home-Bildschirm. Öffne Drivo über das Symbol auf dem Home-Bildschirm, dann siehst du deine Daten.')}</div></div></div>`;
}

function renderExtras3() {
  renderE10();
  renderTrueCost();
  renderCompare();
}
