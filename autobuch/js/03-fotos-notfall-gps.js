'use strict';
// Autobuch – Fotos (IndexedDB), Notfall & Unfall, GPS-Fahrtaufzeichnung.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

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
// Fotos aller Fahrzeuge (für Sicherung) plus Dokumente
const allPhotoIds = () => [state, ...Object.values(state.otherCars || {})]
  .flatMap((d) => [...(d.costs || []), ...(d.accidents || []), ...(d.fines || [])])
  .concat(state.documents).flatMap((x) => x.photos || []);

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
