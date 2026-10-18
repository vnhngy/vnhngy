'use strict';
// Drivo – Akzentfarbe, App-Sperre (Face ID/PIN), Chronik, Saison- und Versicherungs-Hinweise,
// Rettungskarte & Rückrufe, Übergabe-Protokoll mit Unterschrift, Reisekosten-Abrechnung.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Akzentfarbe (pro Fahrzeug) ---------- */

// [Name, Akzent hell, Akzent dunkel, Diagramm hell, Diagramm dunkel]
const ACCENTS = {
  blue: ['Blau', '#3d6694', '#4f78a8', '#6f8db0', '#7d98b8'],
  red: ['Rot', '#9b4545', '#c06565', '#b88080', '#c99090'],
  green: ['Grün', '#3d7457', '#5a9a76', '#7fa58e', '#8fb59e'],
  teal: ['Petrol', '#2f7378', '#4f9aa0', '#78a5a8', '#88b5b8'],
  orange: ['Orange', '#a3622a', '#cc8a4e', '#c49a72', '#d4aa82'],
  purple: ['Lila', '#6a5394', '#8f7bb8', '#9a8bb5', '#ab9cc6'],
  graphite: ['Graphit', '#4d5560', '#8a94a3', '#8a929c', '#9aa3ae'],
};
const isDark = () => state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

function applyAccent() {
  const a = ACCENTS[state.car.accent], st = document.documentElement.style;
  if (!a || state.car.accent === 'blue') { st.removeProperty('--accent'); st.removeProperty('--bar'); }
  else { st.setProperty('--accent', isDark() ? a[2] : a[1]); st.setProperty('--bar', isDark() ? a[4] : a[3]); }
  const cur = state.car.accent || 'blue';
  $('#accentSeg').innerHTML = Object.entries(ACCENTS).map(([k, [name, light, dark]]) =>
    `<button type="button" class="swatch" data-accent="${k}" aria-pressed="${k === cur}" aria-label="${tr(name)}" title="${tr(name)}" style="--c:${isDark() ? dark : light}"></button>`).join('');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAccent);

/* ---------- App-Sperre mit Face ID (Passkey) und Ersatz-PIN ---------- */

// Sichtschutz: Die Daten bleiben unverschlüsselt auf dem iPhone, die App zeigt sie aber erst nach dem Entsperren.
let appLocked = false, hiddenAt = 0;
const RELOCK_MS = 60 * 1000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

async function pinHash(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  return b64(await crypto.subtle.digest('SHA-256', data));
}

function renderLock() {
  const l = state.lock;
  $('#lockBody').innerHTML = l
    ? `<p class="note" style="margin-top:0">${tr(l.credId ? '✓ Aktiv: Drivo fragt beim Öffnen nach Face ID (oder deiner Ersatz-PIN).' : '✓ Aktiv: Drivo fragt beim Öffnen nach deiner PIN.')}</p>
       <button data-lock="off" style="width:100%">${tr('Sperre ausschalten')}</button>`
    : `<p class="note" style="margin-top:0">${tr('Schützt Kennzeichen, FIN, Versicherung und Fotos vor neugierigen Blicken, wenn jemand dein entsperrtes iPhone in der Hand hat.')}</p>
       <button class="primary" data-lock="setup" style="width:100%">${tr('🔒 Sperre mit Face ID einrichten')}</button>`;
}

function lockSetup() {
  openSheet('App-Sperre einrichten', `
    <p class="note" style="margin-top:0">${tr('Lege zuerst eine Ersatz-PIN fest. Mit ihr kommst du immer rein, auch wenn Face ID einmal nicht klappt.')}</p>
    ${field('Ersatz-PIN (4–8 Ziffern)', 'pin', '', 'type="password" inputmode="numeric" autocomplete="new-password" required')}
    ${field('PIN wiederholen', 'pin2', '', 'type="password" inputmode="numeric" autocomplete="new-password" required')}
    <p class="hint">${tr('Danach fragt das iPhone, ob es für Drivo einen Passkey sichern darf. Bestätige mit Face ID.')}</p>
  `, (d) => {
    if (!/^\d{4,8}$/.test(d.pin)) return tr('Die PIN muss 4 bis 8 Ziffern haben.');
    if (d.pin !== d.pin2) return tr('Die beiden PINs stimmen nicht überein.');
    // Passkey direkt beim Tippen anlegen: iOS verlangt dafür eine Nutzeraktion
    const created = window.PublicKeyCredential && navigator.credentials?.create ? navigator.credentials.create({ publicKey: {
      challenge: randomBytes(32), rp: { name: 'Drivo', id: location.hostname },
      user: { id: randomBytes(16), name: 'Drivo', displayName: 'Drivo' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000,
    } }) : Promise.reject(new Error('unsupported'));
    const pin = d.pin, salt = b64(randomBytes(12));
    created.then((cred) => b64(cred.rawId), () => null).then(async (credId) => {
      if (!credId && !confirm(tr('Face ID ist hier nicht verfügbar. Nur mit PIN sperren?'))) return;
      state.lock = { credId, salt, pinHash: await pinHash(pin, salt) };
      save();
      alert(tr('App-Sperre ist aktiv.'));
    });
  }, { submitLabel: 'Weiter' });
}

function showLock(auto = true) {
  if (!state.lock) return;
  const dlg = $('#lockDlg');
  appLocked = true;
  if (sheet.open) sheet.close();
  $('#lockFace').hidden = !state.lock.credId;
  $('#lockDlg h3').textContent = tr('Drivo ist gesperrt');
  $('#lockFace').textContent = tr('Mit Face ID entsperren');
  $('#lockPin').value = '';
  $('#lockErr').textContent = '';
  if (!dlg.open) dlg.showModal();
  if (auto && state.lock.credId) unlockFace(true);
}

function unlockDone() {
  appLocked = false;
  $('#lockDlg').close();
  setTimeout(maybeWhatsNew, 300);
}

function unlockFace(silent) {
  navigator.credentials.get({ publicKey: {
    challenge: randomBytes(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
    allowCredentials: [{ type: 'public-key', id: unb64(state.lock.credId) }],
  } }).then(unlockDone, () => { if (!silent) $('#lockErr').textContent = tr('Face ID hat nicht geklappt. Versuch es nochmal oder nimm die PIN.'); });
}

async function unlockPin() {
  const pin = $('#lockPin').value;
  if (await pinHash(pin, state.lock.salt) === state.lock.pinHash) return unlockDone();
  $('#lockErr').textContent = tr('Falsche PIN.');
  $('#lockPin').value = '';
}

$('#lockDlg').addEventListener('cancel', (e) => e.preventDefault()); // nicht mit Wischen/Escape schließen
$('#lockFace').addEventListener('click', () => unlockFace(false));
$('#lockForm').addEventListener('submit', (e) => { e.preventDefault(); unlockPin(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (state.lock && !appLocked && hiddenAt && Date.now() - hiddenAt > RELOCK_MS) showLock();
});

/* ---------- Chronik ---------- */

let histFilter = 'all';
const HIST_FILTERS = [['all', 'Alles'], ['fuel', 'Tanken'], ['cost', 'Kosten'], ['maint', 'Wartung & Schäden'], ['trip', 'Fahrten'], ['note', 'Notizen']];

function historyItems() {
  const out = [];
  const add = (kind, date, icon, title, meta, amount, open) => { if (date) out.push({ kind, date: date.slice(0, 10), icon, title, meta, amount, open }); };
  state.fuel.forEach((f) => add('fuel', f.date, '⛽', tr('Getankt: {grade}', { grade: tr(fillGrade(f)) }), `${fmtNum(f.liters, 1)} ${unitOf(fillGrade(f))} · ${fmtNum(f.km)} km${f.station ? ' · ' + esc(f.station) : ''}`, f.total, () => fuelForm(f)));
  state.costs.forEach((c) => add('cost', c.date, c.recurringId ? '🔁' : '€', esc(tr(c.cat)), esc(c.note || ''), c.amount, () => costForm(c)));
  state.maint.forEach((m) => add('maint', m.lastDate, '🔧', esc(tr(m.name)), m.lastKm != null ? `${fmtNum(m.lastKm)} km` : '', null, () => maintForm(m)));
  state.damages.forEach((d) => {
    add('maint', d.date, '📷', tr('Schaden: {zone}', { zone: tr(zoneName(d.zone)) }), esc(d.desc || ''), null, () => damageForm(d));
    if (d.repaired) add('maint', d.repairedDate, '🔧', tr('Repariert: {zone}', { zone: tr(zoneName(d.zone)) }), '', null, () => damageForm(d));
  });
  state.logs.forEach((l) => add('maint', l.date, l.kind === 'oil' ? '🛢' : '🛞', tr(l.kind === 'oil' ? 'Öl nachgefüllt' : 'Reifendruck geprüft'), esc(l.note || ''), null, () => logForm(l, l.kind)));
  state.accidents.forEach((a) => add('maint', a.date, '🚨', tr('Unfall'), esc(a.place || ''), null, () => accidentForm(a)));
  state.fines.forEach((f) => add('cost', f.date, '🧾', esc(tr(f.type)), esc(f.authority || ''), f.amount, () => fineForm(f)));
  state.notes.forEach((n) => add('note', n.date, '📒', esc(n.title || tr('Notiz')), esc((n.text || '').slice(0, 80)), null, () => noteForm(n)));
  state.values.forEach((v) => add('note', v.date, '📉', tr('Wert: {eur}', { eur: fmtEUR(v.value, 0) }), esc(v.note || ''), null, () => valueForm(v)));
  state.handovers.forEach((h) => add('note', h.date, '📝', esc(tr(h.type)), esc([h.from, h.to].filter(Boolean).join(' → ')), null, () => handoverReport(h)));
  state.trips.forEach((t) => add('trip', t.date, '🛣', `${esc(t.from || '?')} → ${esc(t.to || '?')}`, `${fmtNum(t.endKm - t.startKm)} km · ${tr(TRIP_LABEL[t.type])}`, null, () => tripForm(t)));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function renderHistory() {
  $('#histSeg').innerHTML = HIST_FILTERS.map(([k, label]) => `<button type="button" data-hist="${k}" aria-pressed="${k === histFilter}">${tr(label)}</button>`).join('');
  // Fahrten nur im eigenen Filter, sonst verdrängen tägliche Wege alles andere
  const all = historyItems().filter((x) => (histFilter === 'all' ? x.kind !== 'trip' : x.kind === histFilter));
  const items = all.slice(0, 300);
  renderHistory.items = items;
  let year = '', month = '';
  $('#histList').innerHTML = items.map((x, i) => {
    let head = '';
    if (x.date.slice(0, 4) !== year) { year = x.date.slice(0, 4); head += `<li class="hist-year">${year}</li>`; month = ''; }
    if (x.date.slice(0, 7) !== month) { month = x.date.slice(0, 7); head += `<li class="agenda-month">${esc(fmtMonth(x.date).replace(/\s*\d{4}$/, ''))}</li>`; }
    return `${head}<li data-hist-item="${i}"><span class="agenda-date"><b>${new Date(x.date + 'T12:00:00').getDate()}.</b></span>
      <div class="grow"><div class="title">${x.icon} ${x.title}</div>${x.meta ? `<div class="meta">${x.meta}</div>` : ''}</div>
      ${x.amount != null ? `<div class="amount">${fmtEUR(x.amount)}</div>` : ''}</li>`;
  }).join('') || `<li class="empty">${tr('Noch keine Einträge')}</li>`;
  $('#histMore').hidden = all.length <= items.length;
}

/* ---------- Saison- und Versicherungs-Hinweise ---------- */

function seasonNotices() {
  const now = new Date(), m = now.getMonth() + 1, d = now.getDate(), y = now.getFullYear();
  const mounted = state.tires.find((t) => t.id === state.mounted?.id);
  const list = [];
  const add = (id, icon, title, meta, extra = '') => {
    const key = `${y}-${id}-${state.carId}`;
    if (!(state.dismissed || []).includes(key)) list.push({ key, icon, title, meta, extra });
  };
  if ((m === 10 || m === 11) && !['Winter', 'Ganzjahr'].includes(mounted?.season)) {
    add('winter-tires', '❄', tr('Zeit für Winterreifen'), tr('Faustregel: von O bis O (Oktober bis Ostern). Bei Glätte, Schnee oder Eis sind Winterreifen Pflicht.'),
      `<button class="small" data-view="maint" data-sub="reifen">${tr('Reifen ansehen')}</button>`);
  }
  if ((m === 4 || (m === 5 && d <= 15)) && mounted?.season === 'Winter') {
    add('summer-tires', '☀', tr('Sommerreifen wieder drauf?'), tr('Ab Ostern lohnt sich der Wechsel: Winterreifen verschleißen bei Wärme schneller und haben längere Bremswege.'),
      `<button class="small" data-view="maint" data-sub="reifen">${tr('Reifen ansehen')}</button>`);
  }
  if (m === 11 || m === 12) add('frost', '❄', tr('Winter-Check'), tr('Frostschutz im Kühlwasser und Winter-Scheibenwasser bis mindestens −20 °C, Eiskratzer und Handbesen ins Auto.'));
  if (m === 3 || m === 4) add('spring', '🌱', tr('Frühjahrs-Check'), tr('Salz abwaschen (mit Unterbodenwäsche), Klimaanlage einmal laufen lassen, Wischerblätter prüfen.'));
  if (m === 6 || m === 7) add('holiday', '🧳', tr('Urlaubs-Check'), tr('Vor der großen Fahrt: Reifendruck für volle Beladung, Öl, Licht und Warnweste prüfen.'),
    `<button class="small" data-view="checks">${tr('Checkliste öffnen')}</button>`);
  const insuranceDue = `${y}-11-30`, left = daysUntil(insuranceDue);
  if (left >= 0 && left <= 46) {
    add('insurance', '🛡', tr('Kfz-Versicherung: Wechsel bis 30. November'),
      tr('Noch {n} Tage. Läuft dein Vertrag zum 1. Januar (das ist meist so), kannst du bis zum 30.11. kündigen. Ein Vergleich spart oft über 100 € im Jahr.', { n: left }));
  }
  return list.map((x) => `<div class="card notice"><span class="ico">${x.icon}</span><div class="grow">
    <div class="title">${x.title}</div><div class="meta">${x.meta}</div>
    <div class="maint-btns">${x.extra}<button class="small" data-dismiss="${x.key}">${tr('Erledigt')}</button></div></div></div>`).join('');
}

/* ---------- Rettungskarte & Rückrufe ---------- */

function renderRescue() {
  const c = state.car, s = state.specs || {}, d = state.docs;
  const model = [c.name, c.year].filter(Boolean).join(' ');
  const search = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);
  $('#rescueBody').innerHTML = `
    <p class="note" style="margin-top:0">${tr('Die Rettungskarte zeigt Feuerwehr und Rettungsdienst, wo Airbags, Batterie und Tank sitzen. Ausdrucken und hinter die Sonnenblende auf der Fahrerseite stecken.')}</p>
    <a class="btn" style="display:block;text-align:center;padding:12px" href="${search('Rettungskarte ' + model)}" target="_blank" rel="noopener">${tr('🔎 Rettungskarte für {model} suchen', { model: esc(model || tr('Auto')) })}</a>
    <p class="note">${tr('Rückrufe: In der Rückrufdatenbank des Kraftfahrt-Bundesamts siehst du, ob es für dein Modell einen Rückruf gibt. Dafür brauchst du Herstellerschlüssel (HSN) und Typschlüssel (TSN) aus dem Fahrzeugschein.')}</p>
    ${s.hsn || s.tsn || d.vin ? `<dl class="kv">${[['HSN', s.hsn], ['TSN', s.tsn], ['FIN', d.vin]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : `<p class="hint">${tr('Tipp: HSN und TSN kannst du im Steckbrief eintragen.')}</p>`}
    <a class="btn" style="display:block;text-align:center;padding:12px;margin-top:8px" href="${search('KBA Rückrufdatenbank')}" target="_blank" rel="noopener">${tr('🔎 KBA-Rückrufdatenbank öffnen')}</a>`;
}

/* ---------- Übergabe-Protokoll mit Unterschrift ---------- */

const HANDOVER_TYPES = ['Verkauf', 'Mietwagen-Übergabe', 'Mietwagen-Rückgabe', 'Verleih', 'Rückgabe nach Verleih'];
const HANDOVER_ITEMS = ['Fahrzeugschein', 'Fahrzeugbrief', 'Serviceheft', 'Warndreieck', 'Verbandkasten', 'Warnweste', 'Reparaturset / Ersatzrad', 'Zweitschlüssel'];
const FUEL_LEVELS = ['leer', '1/4', '1/2', '3/4', 'voll'];

function signaturePad(canvas) {
  const ratio = window.devicePixelRatio || 1, g = canvas.getContext('2d');
  canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio;
  g.scale(ratio, ratio); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#15181d';
  let last = null;
  canvas.drawn = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); last = pos(e); });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke();
    last = p; canvas.drawn = true;
  });
  const up = () => { last = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.clear = () => { g.clearRect(0, 0, canvas.width, canvas.height); canvas.drawn = false; };
}

// Unterschrift als Bild in der Foto-Datenbank ablegen (kommt so auch in die Sicherung)
function saveSignature(canvas) {
  if (!canvas.drawn) return null;
  const id = uid();
  fetch(canvas.toDataURL('image/png')).then((r) => r.blob()).then((blob) => photoPut(id, blob));
  return id;
}

function handoverForm() {
  const now = new Date(), local = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const open = state.damages.filter((x) => !x.repaired);
  openSheet('Übergabe-Protokoll', `
    <label class="field"><span>${tr('Anlass')}</span><select name="type">${HANDOVER_TYPES.map((x) => `<option value="${x}">${tr(x)}</option>`).join('')}</select></label>
    ${field('Datum & Uhrzeit', 'date', local, 'type="datetime-local" required')}
    <div class="row2">
      ${field('Übergeben von', 'from', '', 'placeholder="Name"')}
      ${field('Übernommen von', 'to', '', 'placeholder="Name"')}
    </div>
    <div class="row2">
      ${field('Kilometerstand', 'km', currentKm() ?? '', 'inputmode="numeric" required')}
      <label class="field"><span>${tr('Tank')}</span><select name="fuel">${FUEL_LEVELS.map((x) => `<option value="${x}" ${x === '3/4' ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></label>
    </div>
    ${field('Anzahl Schlüssel', 'keys', 2, 'inputmode="numeric"')}
    <fieldset><legend>${tr('Übergeben wurde')}</legend>
      ${HANDOVER_ITEMS.map((x, i) => `<label class="check"><input type="checkbox" name="item${i}" ${i < 2 && x !== 'Fahrzeugbrief' ? 'checked' : ''}> ${tr(x)}</label>`).join('')}
    </fieldset>
    ${open.length ? `<p class="hint">${tr('{n} offene Schäden aus „Schäden“ werden automatisch aufgeführt.', { n: open.length })}</p>` : ''}
    ${field('Bemerkungen', 'note', '', 'placeholder="z. B. Kratzer an der Felge hinten rechts, Innenraum sauber"')}
    ${photoField([], 'Fotos bei Übergabe')}
    <div class="field"><span>${tr('Unterschrift Übergeber')}</span><canvas class="sign" id="signFrom"></canvas><button type="button" class="link" data-clear="signFrom">${tr('Löschen')}</button></div>
    <div class="field"><span>${tr('Unterschrift Übernehmer')}</span><canvas class="sign" id="signTo"></canvas><button type="button" class="link" data-clear="signTo">${tr('Löschen')}</button></div>
  `, (d) => {
    const km = num(d.km);
    if (km == null) return tr('Bitte einen Kilometerstand eingeben.');
    const rec = {
      id: uid(), type: d.type, date: d.date, from: d.from.trim(), to: d.to.trim(), km, fuel: d.fuel, keys: num(d.keys),
      items: HANDOVER_ITEMS.filter((_, i) => d['item' + i]), note: d.note.trim(), photos: commitPhotos(),
      damages: open.map((x) => ({ zone: x.zone, desc: x.desc, date: x.date })),
      signFrom: saveSignature($('#signFrom')), signTo: saveSignature($('#signTo')),
    };
    state.handovers.push(rec);
    setTimeout(() => handoverReport(rec), 400);
  }, { submitLabel: 'Speichern & anzeigen' });
  wirePhotos();
  ['signFrom', 'signTo'].forEach((id) => signaturePad($('#' + id)));
  sheetForm.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = () => $('#' + b.dataset.clear).clear(); });
}

function renderHandovers() {
  $('#handoverList').innerHTML = [...state.handovers].sort((a, b) => b.date.localeCompare(a.date)).map((h) => `
    <li data-handover="${h.id}"><div class="grow"><div class="title">${esc(tr(h.type))}</div>
    <div class="meta">${fmtDate(h.date.slice(0, 10))} · ${esc([h.from, h.to].filter(Boolean).join(' → ') || '–')} · ${fmtNum(h.km)} km</div></div>
    <span class="pill ${h.signFrom && h.signTo ? 'ok' : 'unknown'}">${tr(h.signFrom && h.signTo ? 'unterschrieben' : 'ohne Unterschrift')}</span></li>`).join('')
    || `<li class="empty">${tr('Noch keine Protokolle. Praktisch beim Verkauf, beim Mietwagen oder wenn du dein Auto verleihst.')}</li>`;
}

async function handoverReport(h) {
  const c = state.car, dc = state.docs;
  const row = (k, v) => v ? `<tr><td>${k}</td><td>${v}</td></tr>` : '';
  const img = async (id) => { const blob = id && await photoGet(id).catch(() => null); return blob ? `<img class="sig" src="${URL.createObjectURL(blob)}" alt="">` : '<div class="sig-empty"></div>'; };
  let html = `<div class="report">
    <h1>${tr('Übergabe-Protokoll')}</h1>
    <p class="sub">${esc(tr(h.type))} · ${fmtDate(h.date.slice(0, 10))}, ${esc(h.date.slice(11, 16))} ${tr('Uhr')}</p>
    <h2>${tr('Fahrzeug')}</h2><table>
      ${row(tr('Modell'), esc([c.name, c.variant, c.year].filter(Boolean).join(' · ')))}${row(tr('Kennzeichen'), esc(dc.plate))}${row(tr('FIN'), esc(dc.vin))}
      ${row(tr('Kilometerstand'), fmtNum(h.km) + ' km')}${row(tr('Tank'), esc(tr(h.fuel)))}${row(tr('Anzahl Schlüssel'), h.keys != null ? fmtNum(h.keys) : '')}
    </table>
    <h2>${tr('Übergeben wurde')}</h2><p>${h.items.length ? h.items.map((x) => esc(tr(x))).join(', ') : '–'}</p>
    <h2>${tr('Bekannte Schäden')}</h2>${h.damages.length ? `<table>${h.damages.map((x) => row(esc(tr(zoneName(x.zone))), esc(x.desc || '–'))).join('')}</table>` : `<p>${tr('Keine')}</p>`}
    ${h.note ? `<h2>${tr('Bemerkungen')}</h2><p>${esc(h.note)}</p>` : ''}
    <div class="sig-row">
      <div>${await img(h.signFrom)}<div class="sig-line">${tr('Übergeben von')}: ${esc(h.from || '')}</div></div>
      <div>${await img(h.signTo)}<div class="sig-line">${tr('Übernommen von')}: ${esc(h.to || '')}</div></div>
    </div>`;
  for (const id of h.photos || []) {
    const blob = await photoGet(id).catch(() => null);
    if (blob) html += `<div class="receipt"><img src="${URL.createObjectURL(blob)}" alt="${tr('Foto')}"></div>`;
  }
  html += `<p class="fine">${tr('Erstellt mit Drivo.')}</p></div>
    <button class="link danger no-print" data-del-handover="${h.id}" style="width:100%;margin-top:12px">${tr('Protokoll löschen')}</button>`;
  $('#reportBody').innerHTML = html;
  $('#reportBack').dataset.view = 'handover';
  showView('report');
  $('#viewTitle').textContent = tr('Übergabe-Protokoll');
}

function deleteHandover(id) {
  const h = state.handovers.find((x) => x.id === id);
  if (!h || !confirm(tr('Wirklich löschen?'))) return;
  [...(h.photos || []), h.signFrom, h.signTo].filter(Boolean).forEach(photoDel);
  state.handovers = state.handovers.filter((x) => x !== h);
  save();
  showView('handover');
}

/* ---------- Reisekosten-Abrechnung ---------- */

function travelForm() {
  const y = new Date().getFullYear(), m = String(new Date().getMonth() + 1).padStart(2, '0');
  openSheet('Reisekosten-Abrechnung', `
    <div class="row2">
      ${field('Von', 'from', `${y}-${m}-01`, 'type="date" required')}
      ${field('Bis', 'to', today(), 'type="date" required')}
    </div>
    ${field('Dein Name', 'name', state.travelName || '', 'placeholder="für die Abrechnung"')}
    ${field('Satz pro km (€)', 'rate', fmtIn(BIZ_RATE, 2), 'inputmode="decimal"')}
    <p class="hint">${tr('Enthält alle Fahrten mit der Art „Geschäftlich“ im Zeitraum.')}</p>
  `, (d) => {
    const rate = num(d.rate);
    if (!rate) return tr('Bitte einen Betrag über 0 eingeben.');
    const trips = state.trips.filter((t) => t.type === 'Geschäftlich' && t.date >= d.from && t.date <= d.to);
    if (!trips.length) return tr('Im Zeitraum gibt es keine Geschäftsfahrten.');
    state.travelName = d.name.trim();
    setTimeout(() => travelReport(trips, d.from, d.to, rate, d.name.trim()), 50);
  }, { submitLabel: 'Erstellen' });
}

function travelReport(trips, from, to, rate, name) {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date) || a.startKm - b.startKm);
  const km = sorted.reduce((s, t) => s + t.endKm - t.startKm, 0);
  const R = (v) => `<td class="r">${v}</td>`;
  $('#reportBody').innerHTML = `<div class="report">
    <h1>${tr('Reisekosten-Abrechnung')}</h1>
    <p class="sub">${esc(name || '')}${name ? ' · ' : ''}${fmtDate(from)} – ${fmtDate(to)} · ${esc([state.car.name, state.docs.plate].filter(Boolean).join(' · '))}</p>
    <table><tr><th>${tr('Datum')}</th><th>${tr('Strecke')}</th><th>${tr('Zweck')}</th><th class="r">km</th><th class="r">${tr('Betrag')}</th></tr>
      ${sorted.map((t) => `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.from || '?')} → ${esc(t.to || '?')}</td><td>${esc([t.purpose, t.partner].filter(Boolean).join(', '))}</td>${R(fmtNum(t.endKm - t.startKm))}${R(fmtEUR((t.endKm - t.startKm) * rate))}</tr>`).join('')}
      <tr><td></td><td><b>${tr('Summe')}</b></td><td>${tr('{n} Fahrten', { n: sorted.length })}</td>${R(`<b>${fmtNum(km)}</b>`)}${R(`<b>${fmtEUR(km * rate)}</b>`)}</tr>
    </table>
    <p>${tr('Erstattung mit {rate} pro gefahrenem Kilometer mit dem privaten Fahrzeug.', { rate: fmtEUR(rate) })}</p>
    <div class="sig-row"><div><div class="sig-empty"></div><div class="sig-line">${tr('Datum, Unterschrift')}</div></div><div><div class="sig-empty"></div><div class="sig-line">${tr('Geprüft')}</div></div></div>
    <p class="fine">${tr('Erstellt mit Drivo aus dem Fahrtenbuch.')}</p></div>`;
  $('#reportBack').dataset.view = 'trips';
  showView('report');
  $('#viewTitle').textContent = tr('Reisekosten-Abrechnung');
}

function renderExtras4() {
  applyAccent();
  renderLock();
  renderHistory();
  renderRescue();
  renderHandovers();
}
