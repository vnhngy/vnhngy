'use strict';
// Autobuch – Formulare (Eingabe-Blätter) und Klick-/Formular-Ereignisse.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Formulare ---------- */

const sheet = $('#sheet'), sheetForm = $('#sheetForm');
let onSubmit = null;

function openSheet(title, fieldsHtml, submit, { deleteFn, submitLabel = 'Speichern' } = {}) {
  sheetForm.innerHTML = `<h3>${tr(title)}</h3>${fieldsHtml}
    <div class="form-btns"><button type="button" data-close>${tr('Abbrechen')}</button><button class="primary" value="ok">${tr(submitLabel)}</button></div>
    ${deleteFn ? `<button type="button" class="link danger" data-delete style="width:100%;margin-top:12px">${tr('Eintrag löschen')}</button>` : ''}`;
  onSubmit = submit;
  sheet.setAttribute('aria-label', $('h3', sheetForm).textContent);
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
  // Vorbelegt mit der zuletzt getankten Sorte
  const lastGrade = [...state.fuel].sort((a, b) => b.date.localeCompare(a.date))[0]?.grade;
  const e = entry || { date: today(), km: '', liters: '', total: '', full: true, station: '', grade: lastGrade || defaultGrade(), ...prefill };
  const grade = fillGrade(e);
  const kmHint = currentKm() != null && !entry ? `<p class="hint">${tr('Letzter bekannter Stand: {km} km', { km: fmtNum(currentKm()) })}</p>` : '';
  openSheet(entry ? 'Tankfüllung bearbeiten' : 'Tankfüllung eintragen', `
    ${field('Datum', 'date', e.date, 'type="date" required')}
    ${field('Kilometerstand', 'km', e.km, 'inputmode="numeric" required placeholder="z. B. 98500"')}${kmHint}
    <label class="field"><span>${tr('Spritsorte')}</span><select name="grade">${GRADES.map((g) => `<option value="${g.id}" ${g.id === grade ? 'selected' : ''}>${tr(g.id)}</option>`).join('')}</select></label>
    <div class="row2">
      ${field(unitOf(grade) === 'kg' ? 'Kilogramm' : 'Liter', 'liters', fmtIn(e.liters, 2), 'inputmode="decimal" required placeholder="z. B. 42,5"')}
      ${field(unitOf(grade) === 'kg' ? 'Preis pro kg (€)' : 'Preis pro Liter (€)', 'price', e.liters && e.total ? fmtIn(e.total / e.liters, 3) : '', 'inputmode="decimal" placeholder="z. B. 1,749"')}
    </div>
    ${field('Betrag (€)', 'total', fmtIn(e.total, 2), 'inputmode="decimal" required placeholder="z. B. 74,30"')}
    <p class="hint">${tr('Zwei der drei Felder reichen, das dritte rechnet die App aus.')}</p>
    <label class="check"><input type="checkbox" name="full" ${e.full ? 'checked' : ''}> ${tr('Vollgetankt')}</label>
    ${field('Tankstelle (optional)', 'station', e.station)}
    ${photoField(e.photos, 'Tankbeleg (optional)')}
  `, (d) => {
    const km = num(d.km), liters = num(d.liters), total = num(d.total);
    if (km == null || liters == null || total == null || liters <= 0) return tr('Bitte Kilometerstand, Liter und Betrag ausfüllen.');
    // Tankgröße nur bei Benzin/Diesel prüfen (Gastanks sind anders bemessen)
    const fam = gradeOf(d.grade).fam;
    if (state.car.tank && fam === mainFam() && (fam === 'benzin' || fam === 'diesel') && liters > state.car.tank * 1.15) return tr('{l} Liter passen nicht in einen {tank}-Liter-Tank. Bitte prüfen.', { l: fmtNum(liters, 1), tank: state.car.tank });
    const rec = { id: entry?.id || uid(), date: d.date, km, liters, total, full: d.full === 'on', station: d.station.trim(), grade: d.grade, photos: commitPhotos() };
    if (entry) Object.assign(entry, rec); else state.fuel.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.fuel = state.fuel.filter((x) => x !== entry); }) });
  wirePhotos();
  // Erdgas wird in Kilogramm getankt
  const label = (name) => sheetForm[name].closest('.field').querySelector('span');
  sheetForm.grade.addEventListener('change', () => {
    const kg = unitOf(sheetForm.grade.value) === 'kg';
    label('liters').textContent = tr(kg ? 'Kilogramm' : 'Liter');
    label('price').textContent = tr(kg ? 'Preis pro kg (€)' : 'Preis pro Liter (€)');
  });
  wireFuelCalc();
}

// Rechenhilfe: aus zwei der Felder Menge, Preis und Betrag wird das dritte berechnet.
// Berechnet wird das zuletzt automatisch gefüllte oder ein leeres Feld, nie das gerade getippte.
function wireFuelCalc() {
  const names = ['liters', 'price', 'total'];
  let auto = null;
  const calc = {
    liters: (v) => v.total / v.price,
    price: (v) => v.total / v.liters,
    total: (v) => v.liters * v.price,
  };
  const digits = { liters: 2, price: 3, total: 2 };
  names.forEach((name) => sheetForm[name].addEventListener('input', () => {
    if (name === auto) auto = null;
    const v = Object.fromEntries(names.map((n) => [n, num(sheetForm[n].value)]));
    const others = names.filter((n) => n !== name);
    const target = others.includes(auto) ? auto : others.find((n) => v[n] == null);
    if (!target || v[name] == null) return;
    const rest = names.filter((n) => n !== target);
    if (rest.some((n) => v[n] == null || v[n] <= 0)) return;
    const r = calc[target](v);
    if (!isFinite(r)) return;
    sheetForm[target].value = fmtIn(r, digits[target]);
    auto = target;
  }));
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

const TITLES = { search: 'Suchen', damages: 'Schäden', leasing: 'Leasing', specs: 'Steckbrief', notes: 'Notizbuch', agenda: 'Termine', yearReport: 'Jahresbericht', fines: 'Strafzettel & Fristen', value: 'Wertverlauf', logs: 'Öl & Reifendruck', awards: 'Erfolge', stats: 'Statistik', checks: 'Checklisten', plan: 'Reiseplaner', garages: 'Werkstätten', report: 'Verkaufs-Mappe', drive: 'Fahrt läuft', help: 'Notfall & Hilfe', start: 'Übersicht', fuel: 'Tanken', trips: 'Fahrtenbuch', maint: 'Wartung', costs: 'Kosten', more: 'Mehr' };

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
  const t = e.target.closest('button, li[data-edit-fuel], li[data-edit-cost], li[data-edit-trip], [data-edit-acc], li[data-drive], li[data-edit-doc], li[data-edit-rec], li[data-edit-value], li[data-edit-log], li[data-edit-note], li[data-agenda], li[data-edit-dmg], .stat[data-open]');
  if (!t) return;
  if (t.dataset.view) return showView(t.dataset.view);
  if (t.dataset.open === 'fuel') return fuelForm();
  if (t.dataset.open === 'cost') return costForm();
  if (t.dataset.open === 'budget') return budgetForm();
  if (t.dataset.open === 'km') return kmForm();
  if (t.dataset.shareTrip) return shareTripCost(state.trips.find((x) => x.id === t.dataset.shareTrip));
  if (t.dataset.open === 'checkIcs') return downloadFile(new File([checkReminderFile()], 'autobuch-monats-check.ics', { type: 'text/calendar' }));
  if (t.dataset.dmgZone) return damageForm(null, t.dataset.dmgZone);
  if (t.dataset.open === 'damage') return damageForm();
  if (t.dataset.editDmg) return damageForm(state.damages.find((x) => x.id === t.dataset.editDmg));
  if (t.dataset.open === 'leasing') return leasingForm();
  if (t.dataset.open === 'commute') return commuteForm();
  if (t.dataset.open === 'specs') return specsForm();
  if (t.dataset.open === 'shareSpecs') return shareSpecs();
  if (t.dataset.open === 'lockscreen') return lockscreenSheet();
  if (t.dataset.open === 'note') return noteForm();
  if (t.dataset.editNote) return noteForm(state.notes.find((x) => x.id === t.dataset.editNote));
  if (t.dataset.open === 'ics') return $('#calBtn').click();
  if (t.dataset.open === 'yearReport') return buildYearReport(statYear).then(() => { $('#viewTitle').textContent = tr(TITLES.yearReport); });
  if (t.dataset.agenda) { const x = renderAgenda.items[t.dataset.agenda]; return x.open ? x.open() : showView(x.view); }
  if (t.dataset.open === 'maintNew') return maintForm();
  if (t.dataset.done) return doneForm(state.maint.find((m) => m.id === t.dataset.done));
  if (t.dataset.editMaint) return maintForm(state.maint.find((m) => m.id === t.dataset.editMaint));
  if (t.dataset.editFuel) return fuelForm(state.fuel.find((f) => f.id === t.dataset.editFuel));
  if (t.dataset.editCost) return costForm(state.costs.find((c) => c.id === t.dataset.editCost));
  if (t.dataset.theme) { state.theme = t.dataset.theme; save(); }
  if (t.dataset.lang) return setLang(t.dataset.lang);
  if (t.dataset.park === 'set') return setParking();
  if (t.dataset.park === 'edit') return parkForm();
  if (t.dataset.park === 'compass') return parkCompass();
  if (t.dataset.open === 'story') return openStory(statYear);
  if (t.dataset.fav) return favTrip(renderFavRoutes.list[t.dataset.fav]);
  if (t.dataset.park === 'clear') { state.parking = null; save(); }
  if (t.dataset.prices === 'load') loadPrices();
  if (t.dataset.open === 'trip') return tripForm();
  if (t.dataset.editTrip) return tripForm(state.trips.find((x) => x.id === t.dataset.editTrip));
  if (t.dataset.returnTrip) return returnTrip(state.trips.find((x) => x.id === t.dataset.returnTrip));
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
  if (t.dataset.open === 'cars') return carsSheet();
  if (t.dataset.open === 'carphoto') return carPhotoForm();
  if (t.dataset.open === 'search') return searchSheet();
  if (t.dataset.open === 'home') return homeForm();
  if (t.dataset.car) { sheet.close(); return switchCar(t.dataset.car); }
  if (t.dataset.delCar) return deleteCar(t.dataset.delCar);
  if (t.dataset.open === 'recurring') return recurringForm();
  if (t.dataset.editRec) return recurringForm(state.recurring.find((x) => x.id === t.dataset.editRec));
  if (t.dataset.open === 'fine') return fineForm();
  if (t.dataset.editFine) return fineForm(state.fines.find((x) => x.id === t.dataset.editFine));
  if (t.dataset.payFine) return payFine(state.fines.find((x) => x.id === t.dataset.payFine));
  if (t.dataset.open === 'value') return valueForm();
  if (t.dataset.editValue) return valueForm(state.values.find((x) => x.id === t.dataset.editValue));
  if (t.dataset.open === 'oil' || t.dataset.open === 'pressure') return logForm(null, t.dataset.open);
  if (t.dataset.editLog) { const l = state.logs.find((x) => x.id === t.dataset.editLog); return logForm(l, l.kind); }
  if (t.dataset.backup === 'now') return $('#exportBtn').click();
  if (t.dataset.backup === 'later') { state.backupSnooze = addDays(7); save(); }
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
  state.prices.type = { Diesel: 'diesel', 'Super E10': 'e10' }[state.car.fuel] || 'e5'; // Tankerkönig kennt nur E5, E10 und Diesel
}

$('#carForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const oldFuel = state.car.fuel, old = state.car;
  state.car = { ...state.car, name: f.name.value.trim(), variant: f.variant.value.trim(), year: f.year.value.trim(), fuel: f.fuel.value, km: num(f.km.value), tank: num(f.tank.value) };
  if (state.car.km != null && state.car.km !== old.km) state.car.kmDate = today();
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
$('#costCsv').addEventListener('click', () => {
  if (!allExpenses().length) return alert(tr('Noch keine Ausgaben (Tankfüllungen werden automatisch mitgezählt).'));
  downloadFile(new File([costsCsv()], `${tr('kosten')}-${today()}.csv`, { type: 'text/csv' }));
});

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
  const done = () => { state.lastBackup = today(); state.backupSnooze = null; save(); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: tr('Autobuch-Sicherung') }); return done(); } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadFile(file);
  done();
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
    state.carId = state.carId || uid();
    bookRecurring();
    save();
    alert(tr('Sicherung wiederhergestellt'));
  } catch (err) {
    alert(tr('Diese Datei ist keine gültige Autobuch-Sicherung.'));
  } finally { e.target.value = ''; }
});
$('#resetBtn').addEventListener('click', () => {
  if (confirm(tr('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.'))) { idb('readwrite', (st) => st.clear()).catch(() => {}); state = freshState(); save(); showView('start'); }
});
