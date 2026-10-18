'use strict';
// Autobuch – Mehrere Fahrzeuge, Hinweise, Fixkosten, Strafzettel, Wert, Öl & Druck, Erfolge.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Mehrere Fahrzeuge ---------- */

const pickCar = (src) => Object.fromEntries(CAR_KEYS.map((k) => [k, src[k]]));
function freshCar(fields) {
  const c = pickCar(freshState());
  c.car = { ...c.car, name: '', variant: '', year: '', km: null, ...fields };
  c.maint = defaultMaint(c.car.fuel);
  return c;
}

function allCars() {
  return [{ id: state.carId, car: state.car, active: true }, ...Object.entries(state.otherCars).map(([id, d]) => ({ id, car: d.car }))];
}

function switchCar(id) {
  if (id === state.carId || !state.otherCars[id]) return;
  state.otherCars[state.carId] = pickCar(state);
  Object.assign(state, state.otherCars[id]);
  delete state.otherCars[id];
  state.carId = id;
  prices = { loading: false, error: '', list: null, time: null };
  bookRecurring();
  save();
  showView('start');
}

function carsSheet() {
  const cars = allCars();
  openSheet('Fahrzeuge', `
    ${cars.map(({ id, car, active }) => `<div style="display:flex;gap:8px;align-items:center">
      <button type="button" class="car-row${active ? ' active' : ''}" ${active ? '' : `data-car="${id}"`}>
        <span style="font-size:22px">🚗</span>
        <span class="grow"><span class="title" style="display:block">${esc(car.name || tr('Auto'))}</span>
        <span class="meta">${esc([car.variant, car.year, tr(car.fuel)].filter(Boolean).join(' · '))}</span></span>
        ${active ? `<span class="pill ok">${tr('Aktiv')}</span>` : ''}
      </button>
      ${cars.length > 1 && !active ? `<button type="button" class="small danger" data-del-car="${id}" aria-label="${tr('Fahrzeug löschen')}" style="margin-bottom:8px">🗑</button>` : ''}
    </div>`).join('')}
    <fieldset style="margin-top:14px"><legend>${tr('Neues Fahrzeug')}</legend>
      ${field('Bezeichnung', 'name', '', 'placeholder="z. B. VW Golf"')}
      <div class="row2">
        ${field('Baujahr', 'year', '', 'inputmode="numeric"')}
        <label class="field"><span>${tr('Kraftstoff')}</span><select name="fuel"><option value="Benzin">${tr('Benzin')}</option><option value="Diesel">${tr('Diesel')}</option></select></label>
      </div>
    </fieldset>
  `, (d) => {
    if (!d.name.trim()) return tr('Tippe ein Fahrzeug an, um es auszuwählen, oder gib einen Namen für ein neues Fahrzeug ein.');
    state.otherCars[state.carId] = pickCar(state);
    Object.assign(state, freshCar({ name: d.name.trim(), year: d.year.trim(), fuel: d.fuel }));
    state.carId = uid();
    setTimeout(() => { showView('start'); openWizard(1); }, 50);
  }, { submitLabel: 'Fahrzeug hinzufügen' });
}

function deleteCar(id) {
  const d = state.otherCars[id];
  if (!d || !confirm(tr('„{name}“ mit allen Einträgen löschen? Das kann nicht rückgängig gemacht werden.', { name: d.car.name || tr('Auto') }))) return;
  [...(d.costs || []), ...(d.accidents || []), ...(d.fines || [])].flatMap((x) => x.photos || []).forEach(photoDel);
  delete state.otherCars[id];
  sheet.close();
  save();
  carsSheet();
}

/* ---------- Hinweise auf der Übersicht ---------- */

function renderNotices() {
  const out = [];
  const open = state.fines.filter((f) => !f.paid && f.due && daysUntil(f.due) <= 7);
  if (open.length) {
    out.push(`<div class="card notice"><span class="ico">🧾</span><div class="grow">
      <div class="title">${tr(open.length > 1 ? '{n} Strafzettel bald fällig' : 'Strafzettel bald fällig', { n: open.length })}</div>
      <div class="meta">${open.map((f) => `${esc(tr(f.type))}: ${fmtEUR(f.amount || 0)} · ${fineStatus(f).label}`).join('<br>')}</div>
      <div class="maint-btns"><button class="small primary" data-view="fines">${tr('Ansehen')}</button></div></div></div>`);
  }
  const backupAge = state.lastBackup ? -daysUntil(state.lastBackup) : null;
  const snoozed = state.backupSnooze && today() < state.backupSnooze;
  if (!hasNoData() && !snoozed && (backupAge == null || backupAge >= 30)) {
    out.push(`<div class="card notice"><span class="ico">💾</span><div class="grow">
      <div class="title">${backupAge == null ? tr('Noch keine Sicherung') : tr('Letzte Sicherung vor {n} Tagen', { n: backupAge })}</div>
      <div class="meta">${tr('Deine Daten liegen nur auf diesem iPhone. Eine Sicherung in iCloud Drive schützt sie, falls das iPhone verloren geht.')}</div>
      <div class="maint-btns"><button class="small primary" data-backup="now">${tr('💾 Jetzt sichern')}</button><button class="small" data-backup="later">${tr('Später')}</button></div>
    </div></div>`);
  }
  $('#notices').innerHTML = out.join('');
}

/* ---------- Wiederkehrende Kosten ---------- */

const INTERVALS = { monthly: 1, quarterly: 3, yearly: 12 };
const INTERVAL_LABEL = { monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich' };
const recDate = (r, n) => addMonths(r.start, n * INTERVALS[r.interval]);

// Bucht alle fälligen Zahlungen des aktiven Fahrzeugs als Ausgaben (auch rückwirkend)
function bookRecurring() {
  let added = 0;
  for (const r of state.recurring || []) {
    for (let d = recDate(r, r.booked || 0); d <= today() && (!r.end || d <= r.end) && (r.booked || 0) < 600; d = recDate(r, r.booked)) {
      state.costs.push({ id: uid(), date: d, cat: r.cat, amount: r.amount, note: r.name, km: null, photos: [], recurringId: r.id });
      r.booked = (r.booked || 0) + 1;
      added++;
    }
  }
  return added;
}

function renderRecurring() {
  const perMonth = state.recurring.filter((r) => !r.end || r.end >= today()).reduce((s, r) => s + r.amount / INTERVALS[r.interval], 0);
  $('#recList').innerHTML = state.recurring.map((r) => {
    const next = recDate(r, r.booked || 0), ended = r.end && next > r.end;
    return `<li data-edit-rec="${r.id}" style="cursor:pointer">
      <div class="grow"><div class="title">🔁 ${esc(r.name)}</div>
      <div class="meta">${esc(tr(r.cat))} · ${tr(INTERVAL_LABEL[r.interval])} · ${ended ? tr('beendet') : tr('nächste Zahlung {date}', { date: fmtDate(next) })}</div></div>
      <div class="amount">${fmtEUR(r.amount)}</div></li>`;
  }).join('') + (state.recurring.length ? `<li><div class="grow"><div class="title">${tr('Fixkosten pro Monat')}</div></div><div class="amount">≈ ${fmtEUR(perMonth)}</div></li>` : '')
    || `<li class="empty">${tr('Noch keine wiederkehrenden Kosten')}</li>`;
}

function recurringForm(entry) {
  const e = entry || { name: '', cat: 'Versicherung', amount: '', interval: 'monthly', start: today(), end: '' };
  openSheet(entry ? 'Wiederkehrende Kosten bearbeiten' : 'Wiederkehrende Kosten', `
    ${field('Bezeichnung', 'name', e.name, 'required placeholder="z. B. Kfz-Versicherung"')}
    <div class="row2">
      ${field('Betrag (€)', 'amount', fmtIn(e.amount, 2), 'inputmode="decimal" required placeholder="z. B. 45,00"')}
      <label class="field"><span>${tr('Wie oft')}</span><select name="interval">${Object.keys(INTERVALS).map((k) => `<option value="${k}" ${k === e.interval ? 'selected' : ''}>${tr(INTERVAL_LABEL[k])}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>${tr('Kategorie')}</span><select name="cat">${COST_CATS.map((c) => `<option value="${c}" ${c === e.cat ? 'selected' : ''}>${tr(c)}</option>`).join('')}</select></label>
    <div class="row2">
      ${field('Erste Zahlung am', 'start', e.start, 'type="date" required')}
      ${field('Endet am (optional)', 'end', e.end, 'type="date"')}
    </div>
    <p class="hint">${tr('Zahlungen seit der ersten Zahlung werden automatisch bei den Kosten eingetragen.')}</p>
  `, (d) => {
    const amount = num(d.amount);
    if (!d.name.trim() || amount == null) return tr('Bitte Bezeichnung und Betrag eingeben.');
    const rec = { name: d.name.trim(), cat: d.cat, amount, interval: d.interval, start: d.start, end: d.end };
    if (entry) {
      // Neuer Rhythmus oder Start: bisherige automatische Buchungen neu berechnen
      if (entry.start !== rec.start || entry.interval !== rec.interval) {
        state.costs = state.costs.filter((c) => c.recurringId !== entry.id);
        entry.booked = 0;
      }
      Object.assign(entry, rec);
    } else {
      state.recurring.push({ id: uid(), booked: 0, ...rec });
    }
    bookRecurring();
  }, { deleteFn: entry && (() => { state.recurring = state.recurring.filter((x) => x !== entry); }) });
}

function costsCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Kategorie', 'Betrag (€)', 'Kilometerstand', 'Notiz'].map((h) => tr(h))];
  [...state.fuel.map((f) => ({ date: f.date, cat: 'Kraftstoff', amount: f.total, km: f.km, note: `${fmtIn(f.liters, 2)} l${f.station ? ' · ' + f.station : ''}` })), ...state.costs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((x) => rows.push([fmtDate(x.date), tr(x.cat), fmtIn(x.amount, 2), x.km ?? '', x.note || '']));
  return '﻿' + rows.map((r) => r.map(q).join(LANG === 'en' ? ',' : ';')).join('\r\n') + '\r\n';
}

/* ---------- Strafzettel & Fristen ---------- */

const FINE_TYPES = ['Parkverstoß', 'Geschwindigkeit', 'Rotlicht', 'Handy am Steuer', 'Abstand', 'Sonstiges'];

function fineStatus(f) {
  if (f.paid) return { cls: 'ok', label: tr('✓ Bezahlt am {date}', { date: fmtDate(f.paidDate) }) };
  if (!f.due) return { cls: 'unknown', label: tr('Keine Frist') };
  const days = daysUntil(f.due);
  return days < 0 ? { cls: 'over', label: tr('⚠︎ Frist abgelaufen') } : days <= 7 ? { cls: 'soon', label: days === 0 ? tr('⏱ Heute fällig') : tr('⏱ Noch {n} Tage', { n: days }) } : { cls: 'ok', label: tr('✓ Bis {date}', { date: fmtDate(f.due) }) };
}

function renderFines() {
  const card = (f) => {
    const st = fineStatus(f);
    return `<div class="card">
      <div class="maint-head"><span class="title" style="font-size:17px">${esc(tr(f.type))}</span><span class="amount" style="font-weight:700">${fmtEUR(f.amount || 0)}</span></div>
      <div class="maint-body">${[fmtDate(f.date), f.authority, f.ref && tr('Az. {ref}', { ref: f.ref }), f.points && tr('{n} Punkt(e)', { n: f.points })].filter(Boolean).map(esc).join(' · ')}
        ${f.note ? `<br>${esc(f.note)}` : ''}${f.photos?.length ? ` · 📎 ${f.photos.length}` : ''}</div>
      <div class="maint-btns"><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="maint-btns">
        ${f.paid ? '' : `<button class="small primary" data-pay-fine="${f.id}">${tr('✓ Bezahlt')}</button>`}
        <button class="small" data-edit-fine="${f.id}">${tr('Bearbeiten')}</button>
      </div></div>`;
  };
  const open = state.fines.filter((f) => !f.paid).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const paid = state.fines.filter((f) => f.paid).sort((a, b) => b.date.localeCompare(a.date));
  $('#fineList').innerHTML = (open.map(card).join('') || `<div class="card"><p class="empty" style="margin:0">${tr('Keine offenen Strafzettel. 👍')}</p></div>`)
    + (paid.length ? `<details class="card"><summary class="title">${tr('Erledigt ({n})', { n: paid.length })}</summary><div style="margin-top:12px">${paid.map(card).join('')}</div></details>` : '');
}

function fineForm(entry) {
  const e = entry || { type: 'Parkverstoß', date: today(), authority: '', ref: '', amount: '', due: addDays(14), points: '', note: '', photos: [], paid: false };
  openSheet(entry ? 'Strafzettel bearbeiten' : 'Strafzettel erfassen', `
    <div class="row2">
      <label class="field"><span>${tr('Art')}</span><select name="type">${FINE_TYPES.map((x) => `<option value="${x}" ${x === e.type ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></label>
      ${field('Betrag (€)', 'amount', fmtIn(e.amount, 2), 'inputmode="decimal" placeholder="z. B. 35,00"')}
    </div>
    <div class="row2">
      ${field('Datum des Verstoßes', 'date', e.date, 'type="date" required')}
      ${field('Zahlen bis', 'due', e.due, 'type="date"')}
    </div>
    ${field('Behörde / Stadt', 'authority', e.authority, 'placeholder="z. B. Stadt Stuttgart"')}
    <div class="row2">
      ${field('Aktenzeichen', 'ref', e.ref)}
      ${field('Punkte in Flensburg', 'points', e.points, 'inputmode="numeric" placeholder="0"')}
    </div>
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Einspruch eingelegt am …"')}
    ${photoField(e.photos, 'Fotos (Strafzettel, Bescheid)')}
  `, (d) => {
    const rec = { type: d.type, date: d.date, due: d.due, authority: d.authority.trim(), ref: d.ref.trim(), amount: num(d.amount), points: num(d.points) || '', note: d.note.trim(), photos: commitPhotos() };
    if (entry) Object.assign(entry, rec); else state.fines.push({ id: uid(), paid: false, paidDate: '', ...rec });
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.fines = state.fines.filter((x) => x !== entry); }) });
  wirePhotos();
}

function payFine(f) {
  if (!confirm(tr('Als bezahlt markieren? Der Betrag wird bei den Kosten eingetragen.'))) return;
  f.paid = true;
  f.paidDate = today();
  if (f.amount) state.costs.push({ id: uid(), date: today(), cat: 'Bußgeld', amount: f.amount, note: [tr(f.type), f.ref].filter(Boolean).join(' · '), km: null, photos: [] });
  save();
}

/* ---------- Wertverlauf ---------- */

function renderValue() {
  const vals = [...state.values].sort((a, b) => a.date.localeCompare(b.date));
  const first = vals[0], last = vals[vals.length - 1];
  $('#vNow').textContent = last ? fmtEUR(last.value, 0) : '–';
  const years = first && last !== first ? -daysUntil(first.date) / 365.25 + daysUntil(last.date) / 365.25 : 0;
  $('#vYear').textContent = years >= 0.15 ? fmtEUR((first.value - last.value) / years, 0) : '–';
  barChart($('#valueChart'), vals.slice(-12).map((v) => ({ label: v.date.slice(5, 7) + '/' + v.date.slice(2, 4), full: fmtDate(v.date), value: v.value })), {
    aria: tr('Wertverlauf'), tip: (v) => fmtEUR(v, 0), axis: (g) => tr('{n} T€', { n: fmtNum(g / 1000, g % 1000 ? 1 : 0) }),
    empty: tr('Trag den Wert deines Autos ein, dann siehst du hier den Verlauf.'),
  });
  let info = '';
  if (first && last !== first) {
    const loss = first.value - last.value;
    const exp = allExpenses().filter((x) => x.date >= first.date && x.date <= last.date).reduce((s, x) => s + x.amount, 0);
    const pts = kmPoints();
    const kmAt = (date, before) => { const k = pts.filter(([d]) => (before ? d <= date : d >= date)).map(([, k2]) => k2); return k.length ? (before ? Math.max(...k) : Math.min(...k)) : null; };
    const k0 = kmAt(first.date, true) ?? kmAt(first.date, false), k1 = kmAt(last.date, true);
    const driven = k0 != null && k1 != null ? k1 - k0 : 0;
    info = `<ul class="list" style="margin-top:12px">
      <li><div class="grow"><div class="title">${tr('Wertverlust seit {date}', { date: fmtDate(first.date) })}</div><div class="meta">${fmtNum(loss / first.value * 100, 0)} %</div></div><div class="amount">${fmtEUR(loss, 0)}</div></li>
      ${driven > 0 ? `<li><div class="grow"><div class="title">${tr('Echte Kosten pro km')}</div><div class="meta">${tr('alle Ausgaben plus Wertverlust, {km} km', { km: fmtNum(driven) })}</div></div><div class="amount">${fmtNum((exp + loss) / driven * 100, 0)} ct</div></li>` : ''}
    </ul>`;
  }
  $('#valueInfo').innerHTML = info;
  $('#valueList').innerHTML = [...vals].reverse().map((v) => `<li data-edit-value="${v.id}" style="cursor:pointer">
    <div class="grow"><div class="title">${fmtDate(v.date)}</div><div class="meta">${esc(v.note || '')}</div></div><div class="amount">${fmtEUR(v.value, 0)}</div></li>`).join('')
    || `<li class="empty">${tr('Noch keine Einträge')}</li>`;
}

function valueForm(entry) {
  const e = entry || { date: today(), value: '', note: state.values.length ? '' : tr('Kaufpreis') };
  openSheet(entry ? 'Wert bearbeiten' : 'Wert eintragen', `
    <div class="row2">
      ${field('Datum', 'date', e.date, 'type="date" required')}
      ${field('Wert (€)', 'value', fmtIn(e.value, 0), 'inputmode="decimal" required placeholder="z. B. 14500"')}
    </div>
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Kaufpreis, Online-Schätzung"')}
  `, (d) => {
    const value = num(d.value);
    if (value == null) return tr('Bitte einen Betrag eingeben.');
    const rec = { date: d.date, value, note: d.note.trim() };
    if (entry) Object.assign(entry, rec); else state.values.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.values = state.values.filter((x) => x !== entry); }) });
}

/* ---------- Öl & Reifendruck ---------- */

function renderLogs() {
  const oil = state.logs.filter((l) => l.kind === 'oil').sort((a, b) => a.date.localeCompare(b.date));
  const withKm = oil.filter((l) => l.km != null);
  let oilHtml = oil.length ? `<div class="split">
      <div><div class="label">${tr('Zuletzt nachgefüllt')}</div><div class="bignum" style="font-size:22px">${fmtDate(oil[oil.length - 1].date)}</div></div>
      <div><div class="label">${tr('Insgesamt')}</div><div class="bignum" style="font-size:22px">${fmtNum(oil.reduce((s, l) => s + (l.liters || 0), 0), 1)} l</div></div>
    </div>` : `<p class="empty" style="margin:0">${tr('Noch nichts nachgefüllt.')}</p>`;
  if (withKm.length >= 2) {
    const dist = withKm[withKm.length - 1].km - withKm[0].km;
    const liters = withKm.slice(1).reduce((s, l) => s + (l.liters || 0), 0);
    if (dist > 0) oilHtml += `<p style="margin:12px 0 0"><b>${tr('Ölverbrauch ≈ {l} l pro 1.000 km', { l: fmtNum(liters / dist * 1000, 2) })}</b></p>
      <p class="note" style="margin-bottom:0">${tr('Ein paar Zehntel Liter pro 1.000 km sind normal. Steigt der Wert deutlich, frag die Werkstatt.')}</p>`;
  }
  $('#oilInfo').innerHTML = oilHtml;

  const pr = state.logs.filter((l) => l.kind === 'pressure').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (pr) {
    const age = -daysUntil(pr.date);
    $('#pressureInfo').innerHTML = `<div class="split">
        <div><div class="label">${tr('Vorne')}</div><div class="bignum">${pr.front != null ? fmtNum(pr.front, 1) : '–'}</div><div class="label">bar</div></div>
        <div><div class="label">${tr('Hinten')}</div><div class="bignum">${pr.rear != null ? fmtNum(pr.rear, 1) : '–'}</div><div class="label">bar</div></div>
      </div>
      <div class="maint-btns"><span class="pill ${age > 30 ? 'soon' : 'ok'}">${age > 30 ? tr('⏱ Wieder prüfen (vor {n} Tagen)', { n: age }) : tr('✓ Geprüft am {date}', { date: fmtDate(pr.date) })}</span></div>`;
  } else {
    $('#pressureInfo').innerHTML = `<p class="empty" style="margin:0">${tr('Noch nicht geprüft.')}</p>`;
  }

  $('#logList').innerHTML = [...state.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((l) => `<li data-edit-log="${l.id}" style="cursor:pointer">
    <div class="grow"><div class="title">${l.kind === 'oil' ? '🛢️ ' + tr('Öl nachgefüllt') : '🛞 ' + tr('Reifendruck geprüft')}</div>
    <div class="meta">${[fmtDate(l.date), l.km != null && fmtNum(l.km) + ' km', l.note].filter(Boolean).map(esc).join(' · ')}</div></div>
    <div class="amount">${l.kind === 'oil' ? fmtNum(l.liters || 0, 1) + ' l' : `${l.front != null ? fmtNum(l.front, 1) : '–'} / ${l.rear != null ? fmtNum(l.rear, 1) : '–'} bar`}</div></li>`).join('')
    || `<li class="empty">${tr('Noch keine Einträge')}</li>`;
}

function logForm(entry, kind) {
  const oil = kind === 'oil';
  const e = entry || { date: today(), km: currentKm() ?? '', liters: '', front: '', rear: '', note: '' };
  openSheet(oil ? (entry ? 'Öl nachgefüllt (bearbeiten)' : 'Öl nachgefüllt') : (entry ? 'Reifendruck (bearbeiten)' : 'Reifendruck geprüft'), `
    <div class="row2">
      ${field('Datum', 'date', e.date, 'type="date" required')}
      ${field('Kilometerstand', 'km', e.km ?? '', 'inputmode="numeric"')}
    </div>
    ${oil ? field('Menge (Liter)', 'liters', fmtIn(e.liters, 1), 'inputmode="decimal" required placeholder="z. B. 0,5"')
      : `<div class="row2">${field('Vorne (bar)', 'front', fmtIn(e.front, 1), 'inputmode="decimal" placeholder="z. B. 2,3"')}${field('Hinten (bar)', 'rear', fmtIn(e.rear, 1), 'inputmode="decimal" placeholder="z. B. 2,1"')}</div>`}
    ${field('Notiz', 'note', e.note, oil ? 'placeholder="z. B. Ölsorte laut Serviceheft"' : 'placeholder="z. B. alle vier Reifen angepasst"')}
  `, (d) => {
    const rec = { kind, date: d.date, km: num(d.km), note: d.note.trim() };
    if (oil) { rec.liters = num(d.liters); if (!rec.liters) return tr('Bitte die Menge eingeben.'); }
    else { rec.front = num(d.front); rec.rear = num(d.rear); if (rec.front == null && rec.rear == null) return tr('Bitte mindestens einen Wert eingeben.'); }
    if (entry) Object.assign(entry, rec); else state.logs.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.logs = state.logs.filter((x) => x !== entry); }) });
}

/* ---------- Erfolge ---------- */

const AWARDS = [
  { icon: '⛽', name: 'Erste Tankfüllung', desc: 'Trag deine erste Tankfüllung ein.', goal: 1, val: () => state.fuel.length },
  { icon: '🛢️', name: 'Tank-Profi', desc: '10 Tankfüllungen erfasst.', goal: 10, val: () => state.fuel.length },
  { icon: '🏅', name: 'Tank-Meister', desc: '50 Tankfüllungen erfasst.', goal: 50, val: () => state.fuel.length },
  { icon: '🌱', name: 'Sparfuchs', desc: 'Ø Verbrauch unter 6 l/100 km.', goal: 1, val: () => { const a = consumption().avg; return a && a < 6 ? 1 : 0; } },
  { icon: '🍃', name: 'Spar-Fahrer', desc: 'Eine Fahrt mit Fahrstil-Note 90 oder besser.', goal: 1, val: () => state.drives.filter((d) => d.score >= 90).length },
  { icon: '🛣️', name: 'Kilometerfresser', desc: '1.000 km mit GPS aufgezeichnet.', goal: 1000, val: () => Math.round(state.drives.reduce((s, d) => s + d.km, 0)) },
  { icon: '📒', name: 'Buchhalter', desc: '25 Fahrten im Fahrtenbuch.', goal: 25, val: () => state.trips.length },
  { icon: '🔧', name: 'Vorsorger', desc: 'Bei allen Wartungsterminen das letzte Datum eingetragen.', goal: () => state.maint.length, val: () => state.maint.filter((m) => m.lastDate || m.lastKm != null).length },
  { icon: '⏰', name: 'Pünktlich', desc: 'Alle Termine eingetragen und keiner überfällig.', goal: 1, val: () => (state.maint.every((m) => maintStatus(m).cls === 'ok' || maintStatus(m).cls === 'soon') ? 1 : 0) },
  { icon: '🛞', name: 'Reifen-Kenner', desc: 'Profiltiefe gemessen.', goal: 1, val: () => state.tires.filter((t) => t.tread).length },
  { icon: '🚨', name: 'Notfall-bereit', desc: 'Kennzeichen, Versicherung und Schadenhotline eingetragen.', goal: 3, val: () => ['plate', 'insurer', 'claimPhone'].filter((k) => state.docs[k]).length },
  { icon: '💾', name: 'Gut gesichert', desc: 'Sicherung in den letzten 30 Tagen.', goal: 1, val: () => (state.lastBackup && -daysUntil(state.lastBackup) <= 30 ? 1 : 0) },
  { icon: '✅', name: 'Gut vorbereitet', desc: 'Eine Checkliste komplett abgehakt.', goal: 1, val: () => CHECKLISTS.filter((cl) => cl.items.every((_, i) => state.checks[cl.id]?.[i])).length },
  { icon: '📸', name: 'Ordnung muss sein', desc: '5 Belege oder Dokumente fotografiert.', goal: 5, val: () => allPhotoIds().length },
];

function renderAwards() {
  let won = 0;
  $('#awardList').innerHTML = AWARDS.map((a) => {
    const goal = typeof a.goal === 'function' ? a.goal() : a.goal, v = Math.min(a.val(), goal), ok = goal > 0 && v >= goal;
    if (ok) won++;
    return `<div class="card award${ok ? '' : ' locked'}"><div class="ico">${a.icon}</div><div class="title">${tr(a.name)}</div><div class="meta">${tr(a.desc)}</div>
      ${ok ? `<span class="pill ok">✓ ${tr('Geschafft')}</span>` : `<div class="progress"><i style="width:${goal ? v / goal * 100 : 0}%"></i></div><div class="meta" style="min-height:0">${fmtNum(v)} / ${fmtNum(goal)}</div>`}</div>`;
  }).join('');
  $('#awardSummary').innerHTML = `<div class="bignum">🏆 ${won} / ${AWARDS.length}</div><div class="note">${tr('Erfolge freigeschaltet')}</div>`;
}
