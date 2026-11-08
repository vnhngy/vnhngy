'use strict';
// Drivo – „Heute“-Karte, Monatsrückblick, Werkstatt-Termine, Kundenkarten mit Strichcode, Verbrauchsziel.
// (Die Startansicht wird beim Start in js/19-… ausgewertet.)
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Werkstatt-Termine ---------- */

const apptWhen = (a) => `${fmtDate(a.date)}${a.time ? ', ' + tr('{time} Uhr', { time: a.time }) : ''}`;
const upcomingAppts = () => state.appointments.filter((a) => a.date >= today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

function renderAppts() {
  const list = upcomingAppts();
  $('#apptList').innerHTML = list.map((a) => {
    const g = state.garages.find((x) => x.id === a.garageId), days = daysUntil(a.date);
    return `<li data-edit-appt="${a.id}" style="cursor:pointer"><div class="grow"><div class="title">${esc(a.title || tr('Werkstatttermin'))}</div>
      <div class="meta">${apptWhen(a)}${g ? ' · ' + esc(g.name) : ''}${a.note ? ' · ' + esc(a.note) : ''}</div></div>
      <span class="pill ${days <= 1 ? 'soon' : 'ok'}">${days === 0 ? tr('Heute') : days === 1 ? tr('Morgen') : tr('in {n} Tagen', { n: days })}</span></li>`;
  }).join('') || `<li class="empty">${tr('Keine Werkstatttermine geplant.')}</li>`;
}

function apptForm(entry, title = '') {
  const e = entry || { date: addDays(7), time: '08:00', garageId: state.garages[0]?.id || '', title, note: '' };
  openSheet(entry ? 'Werkstatttermin bearbeiten' : 'Werkstatttermin eintragen', `
    ${field('Was wird gemacht?', 'title', e.title, 'placeholder="z. B. Service B, Reifenwechsel"')}
    <div class="row2">
      ${field('Datum', 'date', e.date, 'type="date" required')}
      ${field('Uhrzeit', 'time', e.time, 'type="time"')}
    </div>
    ${state.garages.length ? `<label class="field"><span>${tr('Werkstatt')}</span><select name="garageId"><option value="">–</option>${state.garages.map((g) => `<option value="${g.id}" ${g.id === e.garageId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : `<p class="hint">${tr('Tipp: Unter „Werkstätten“ kannst du deine Werkstatt mit Adresse und Telefon speichern.')}</p>`}
    ${field('Notiz (optional)', 'note', e.note, 'placeholder="z. B. Ersatzwagen reserviert"')}
    ${state.issues.some((x) => !x.done) ? `<p class="hint">${tr('Denk an deine Mängelliste: {n} offene Punkte.', { n: state.issues.filter((x) => !x.done).length })}</p>` : ''}
  `, (d) => {
    const rec = { date: d.date, time: d.time, garageId: d.garageId || '', title: d.title.trim(), note: d.note.trim() };
    if (entry) Object.assign(entry, rec); else state.appointments.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.appointments = state.appointments.filter((x) => x !== entry); }) });
}

function apptNotice() {
  const soon = upcomingAppts().filter((a) => daysUntil(a.date) <= 1);
  if (!soon.length) return '';
  return `<div class="card notice"><span class="ico">🔧</span><div class="grow">
    <div class="title">${tr(daysUntil(soon[0].date) === 0 ? 'Heute Werkstatttermin' : 'Morgen Werkstatttermin')}</div>
    <div class="meta">${soon.map((a) => `${esc(a.title || tr('Werkstatttermin'))}: ${apptWhen(a)}`).join('<br>')}</div>
    <div class="maint-btns"><button class="small primary" data-view="maint">${tr('Ansehen')}</button></div></div></div>`;
}

/* ---------- „Heute“-Karte ---------- */

function greeting() {
  const h = new Date().getHours();
  return tr(h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend');
}

function todayLines() {
  const out = [];
  const add = (icon, text, view) => out.push({ icon, text, view });
  const appt = upcomingAppts()[0];
  if (appt && daysUntil(appt.date) <= 3) add('🔧', tr('{what}: {when}', { what: esc(appt.title || tr('Werkstatttermin')), when: apptWhen(appt) }), 'maint');
  const p = state.parking;
  if (p?.until) {
    const left = Math.round((p.until - Date.now()) / 60000);
    add('⏱', left >= 0 ? tr('Parkuhr: noch {n} Min', { n: left }) : tr('Parkuhr abgelaufen seit {n} Min', { n: -left }), 'start');
  }
  const fc = fuelForecast();
  if (fc) add('⛽', fc.days <= 0 ? tr('Bald tanken: Reserve erreicht') : tr('Tank reicht noch ca. {km} km', { km: fmtNum(fc.kmLeft) }), 'fuel');
  // nächste Frist, aber nicht noch einmal den Werkstatttermin von oben
  const next = agendaItems().find((x) => !(appt && x.date === appt.date && x.title === (appt.title || tr('Werkstatttermin'))));
  if (next) {
    const d = daysUntil(next.date);
    add(d < 0 ? '⚠' : '📅', d < 0 ? tr('{what} ist überfällig', { what: esc(next.title) }) : tr('{what} in {n} Tagen', { what: esc(next.title), n: d }), 'agenda');
  }
  const b = budgetState();
  if (b) add('€', b.share >= 1 ? tr('Budget um {eur} überschritten', { eur: fmtEUR(b.spent - b.limit, 0) }) : tr('Budget: noch {eur} diesen Monat', { eur: fmtEUR(b.limit - b.spent, 0) }), 'costs');
  return out.slice(0, 4);
}

function renderToday() {
  const lines = todayLines();
  $('#todayCard').innerHTML = `<div class="today-hello">${greeting()}${state.car.name ? `<span>${esc(state.car.name)}</span>` : ''}</div>
    ${lines.length ? `<div class="today-lines">${lines.map((l) => `<button type="button" data-view="${l.view}"><span class="today-ico">${l.icon}</span><span class="grow">${l.text}</span><span class="chev">›</span></button>`).join('')}</div>`
      : `<p class="meta" style="margin:6px 0 0">${tr('Alles im grünen Bereich. Gute Fahrt!')}</p>`}`;
}

/* ---------- Monatsrückblick ---------- */

const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function monthFigures(m) {
  const end = addMonths(m + '-01', 1);
  const exp = allExpenses().filter((e) => e.date && e.date.startsWith(m));
  const fills = state.fuel.filter((f) => f.date.startsWith(m));
  const k0 = kmAtDate(m + '-01'), k1 = kmAtDate(end < today() ? end : today());
  return { m, cost: exp.reduce((s, e) => s + e.amount, 0), fills: fills.length, liters: fills.reduce((s, f) => s + f.liters, 0),
    km: k0 != null && k1 != null && k1 > k0 ? k1 - k0 : null, trips: state.trips.filter((t) => t.date.startsWith(m)).length };
}

function monthCompareHtml(m) {
  const a = monthFigures(m), b = monthFigures(prevMonth(m));
  if (!a.cost && !a.fills && !a.trips) return '';
  const delta = (x, y, fmt, lowerIsGood = true) => {
    if (!y || x == null) return '';
    const p = (x - y) / y * 100;
    if (Math.abs(p) < 1) return `<span class="meta">±0 %</span>`;
    const good = lowerIsGood ? p < 0 : p > 0;
    return `<span class="${good ? 'good-text' : 'bad-text'}">${p > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(p), 0)} %</span>`;
  };
  return `<ul class="list">
    <li><div class="grow"><div class="title">${tr('Kosten')}</div><div class="meta">${tr('Vormonat: {v}', { v: fmtEUR(b.cost, 0) })}</div></div><div class="amount">${fmtEUR(a.cost, 0)}<br>${delta(a.cost, b.cost)}</div></li>
    ${a.km != null ? `<li><div class="grow"><div class="title">${tr('Gefahren')}</div><div class="meta">${b.km != null ? tr('Vormonat: {v}', { v: fmtNum(b.km) + ' km' }) : ''}</div></div><div class="amount">${fmtNum(a.km)} km<br>${delta(a.km, b.km, null, false)}</div></li>` : ''}
    <li><div class="grow"><div class="title">${tr('Tankfüllungen')}</div><div class="meta">${tr('Vormonat: {v}', { v: b.fills })}</div></div><div class="amount">${a.fills}${a.liters ? ` · ${fmtNum(a.liters)} ${unitOf(defaultGrade())}` : ''}</div></li>
  </ul>`;
}

function renderMonthReview() {
  const last = prevMonth(today().slice(0, 7));
  const key = `${last}-month-${state.carId}`;
  const html = new Date().getDate() <= 10 && !(state.dismissed || []).includes(key) ? monthCompareHtml(last) : '';
  const box = $('#monthCard');
  box.hidden = !html;
  if (html) box.innerHTML = `<div class="maint-head"><h2 style="margin:0">${tr('Dein {month}', { month: fmtMonth(last + '-15') })}</h2><button class="small" data-dismiss="${key}">${tr('Erledigt')}</button></div>${html}`;
  const m = today().slice(0, 7);
  $('#statMonth').innerHTML = monthCompareHtml(m) || monthCompareHtml(prevMonth(m)) || `<p class="empty" style="margin:0">${tr('Noch keine Daten.')}</p>`;
}

/* ---------- Kundenkarten mit Strichcode (Code 128) ---------- */

// Balkenbreiten der 107 Code-128-Zeichen (Werte 0–105, danach das Stoppzeichen)
const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
  + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
  + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
  + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
  + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
  + '114131 311141 411131 211412 211214 211232 2331112').split(' ');

// Code 128 B: Startzeichen, Daten, Prüfzeichen, Stopp
function code128(text) {
  const vals = [...String(text)].map((ch) => ch.charCodeAt(0) - 32).filter((v) => v >= 0 && v < 96);
  const check = (104 + vals.reduce((s, v, i) => s + v * (i + 1), 0)) % 103;
  return [104, ...vals, check, 106].map((v) => C128[v]).join('');
}

function barcodeSvg(text) {
  const widths = code128(text).split('').map(Number), quiet = 10;
  const total = widths.reduce((s, w) => s + w, 0) + quiet * 2;
  let x = quiet, bars = '';
  widths.forEach((w, i) => { if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="60"/>`; x += w; });
  return `<svg class="barcode" viewBox="0 0 ${total} 60" preserveAspectRatio="none" role="img" aria-label="${esc(text)}"><rect width="${total}" height="60" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
}

function renderCards() {
  $('#cardList').innerHTML = state.cards.map((c) => `<li><div class="grow" data-show-card="${c.id}" style="cursor:pointer"><div class="title">${esc(c.name)}</div><div class="meta">${esc(c.number)}</div></div>
    <button class="small" data-edit-card="${c.id}">${tr('Bearbeiten')}</button></li>`).join('')
    || `<li class="empty">${tr('Speichere Payback, Tankkarte, ADAC-Mitgliedschaft oder Waschanlagen-Abo. An der Kasse zeigst du den Strichcode direkt vom iPhone.')}</li>`;
}

function cardForm(entry) {
  const e = entry || { name: '', number: '', barcode: true };
  openSheet(entry ? 'Karte bearbeiten' : 'Karte hinzufügen', `
    ${field('Name', 'name', e.name, 'required placeholder="z. B. Payback, ADAC"')}
    ${field('Kartennummer', 'number', e.number, 'required inputmode="text" autocapitalize="characters"')}
    <label class="check"><input type="checkbox" name="barcode" ${e.barcode ? 'checked' : ''}> ${tr('Als Strichcode anzeigen')}</label>
    <p class="hint">${tr('Die App zeigt die Nummer als Code-128-Strichcode. Die meisten Kassen lesen ihn; klappt es nicht, nenn die Nummer einfach.')}</p>
  `, (d) => {
    if (!d.name.trim() || !d.number.trim()) return tr('Bitte Name und Nummer eingeben.');
    const rec = { name: d.name.trim(), number: d.number.trim(), barcode: d.barcode === 'on' };
    if (entry) Object.assign(entry, rec); else state.cards.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.cards = state.cards.filter((x) => x !== entry); }) });
}

function showCard(c) {
  const dlg = $('#cardDlg');
  dlg.innerHTML = `<div class="card-show">
    <div class="title" style="font-size:22px">${esc(c.name)}</div>
    ${c.barcode ? barcodeSvg(c.number) : ''}
    <div class="card-num">${esc(c.number)}</div>
    <p class="meta">${tr('Tipp: Bildschirm-Helligkeit hochdrehen, dann liest der Scanner besser.')}</p>
    <button type="button" class="primary" style="width:100%">${tr('Schließen')}</button></div>`;
  dlg.querySelector('button').onclick = () => dlg.close();
  dlg.showModal();
}

/* ---------- Verbrauchsziel ---------- */

// Verbrauch eines Monats aus den Abschnitten zwischen vollen Tankfüllungen
function monthCons(m) {
  const segs = consumption().segs.filter((s) => s.date.startsWith(m));
  const dist = segs.reduce((s, x) => s + x.dist, 0);
  return dist ? segs.reduce((s, x) => s + x.liters, 0) / dist * 100 : null;
}

function renderGoal() {
  const g = state.consGoal?.target, box = $('#goalBody');
  if (!g) {
    box.innerHTML = `<p class="note" style="margin-top:0">${tr('Setz dir ein Ziel, z. B. unter 6,5 l/100 km. Die App zeigt jeden Monat, ob du es geschafft hast.')}</p>
      <button data-open="goal" style="width:100%">${tr('Ziel festlegen')}</button>`;
    return;
  }
  const months = Array.from({ length: 6 }, (_, i) => { let m = today().slice(0, 7); for (let k = 0; k < i; k++) m = prevMonth(m); return m; }).reverse();
  const vals = months.map((m) => ({ m, v: monthCons(m) }));
  const now = vals[vals.length - 1].v;
  let streak = 0;
  for (const x of [...vals].reverse()) { if (x.v == null) continue; if (x.v <= g) streak++; else break; }
  box.innerHTML = `<div class="maint-head"><span class="title">${tr('Ziel: unter {v} {unit}', { v: fmtNum(g, 1), unit: consUnit() })}</span><button class="small" data-open="goal">${tr('Ändern')}</button></div>
    <div class="goal-months">${vals.map((x) => `<div class="${x.v == null ? '' : x.v <= g ? 'ok' : 'miss'}"><b>${x.v == null ? '–' : fmtNum(x.v, 1)}</b><span>${esc(new Date(x.m + '-15T12:00:00').toLocaleDateString(LOCALE, { month: 'short' }))}</span></div>`).join('')}</div>
    <p class="note" style="margin-bottom:0">${now == null ? tr('Für diesen Monat gibt es noch keine volle Tankfüllung.') : now <= g ? tr('✓ Diesen Monat im Ziel.') : tr('Diesen Monat noch {d} {unit} über dem Ziel.', { d: fmtNum(now - g, 1), unit: consUnit() })}${streak > 1 ? ' ' + tr('{n} Monate in Folge geschafft!', { n: streak }) : ''}</p>`;
}

function goalForm() {
  openSheet('Verbrauchsziel', `
    ${field('Ziel (unter … pro 100 km)', 'target', fmtIn(state.consGoal?.target, 1), 'inputmode="decimal" placeholder="z. B. 6,5"')}
    <p class="hint">${tr('Dein Durchschnitt bisher: {v}. Feld leer lassen zum Abschalten.', { v: consumption().avg ? `${fmtNum(consumption().avg, 1)} ${consUnit()}` : '–' })}</p>
  `, (d) => { const v = num(d.target); state.consGoal = v ? { target: v } : null; });
}

function renderExtras9() {
  renderAppts();
  renderToday();
  renderMonthReview();
  renderCards();
  renderGoal();
}
