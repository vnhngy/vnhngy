'use strict';
// Drivo – Parkplatz, Spritpreise, Fahrtenbuch und Reifen.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

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
    ${p.photos?.length ? `<img class="park-photo" data-photo="${p.photos[0]}" alt="${tr('Foto vom Parkplatz')}">` : ''}
    ${p.lat == null ? `<div class="meta">${tr('Ohne Standort gespeichert')}</div>` : ''}
    ${meter ? `<div style="margin-top:6px">${meter}</div>` : ''}
    <div class="maint-btns">
      ${p.lat != null ? `<a class="btn primary" href="https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w" target="_blank" rel="noopener">${tr('🚶 Zum Auto')}</a><button class="small" data-park="compass">${tr('🧭 Kompass')}</button>` : ''}
      <button class="small" data-park="edit">${tr('Notiz &amp; Parkuhr')}</button>
      <button class="small" data-park="clear">${tr('Weggefahren')}</button>
    </div>`;
  body.querySelectorAll('img[data-photo]').forEach(async (img) => { img.src = await photoUrl(img.dataset.photo) || ''; });
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
    ${photoField(p.photos, 'Foto (z. B. Schild mit Ebene und Platz)')}
  `, (d) => {
    p.note = d.note.trim();
    p.photos = commitPhotos();
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
  wirePhotos();
}

setInterval(() => { if (state.parking) renderPark(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* ---------- Spritpreise (Tankerkönig) ---------- */

let prices = { loading: false, error: '', list: null, time: null };
const FUEL_NAMES = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };

// Ohne Tankerkönig-Schlüssel: Preise auf einer Website bzw. Tankstellen in Apple Karten öffnen
function priceLinks() {
  const q = { de: 'Tankstelle', en: 'petrol station', vi: 'cây xăng' }[LANG] || 'Tankstelle';
  return `<div class="actions" style="margin:10px 0 0">
    <a class="btn" style="text-align:center;padding:12px" href="https://www.clever-tanken.de/" target="_blank" rel="noopener">${tr('⛽ clever-tanken.de')}</a>
    <a class="btn" style="text-align:center;padding:12px" href="https://maps.apple.com/?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${tr('🗺️ Apple Karten')}</a>
  </div>`;
}

function renderPrices() {
  const cfg = state.prices, body = $('#priceBody');
  if (!cfg.key) {
    body.innerHTML = `<p class="note" style="margin:0 0 10px">${tr('Ohne Schlüssel: Öffne die Preise direkt auf clever-tanken.de (dort „Standort verwenden“) oder such Tankstellen in Apple Karten.')}</p>
      ${priceLinks()}
      <p class="note">${tr('Mit einem kostenlosen Schlüssel von Tankerkönig zeigt Drivo die günstigsten Tankstellen direkt hier an, inklusive Wunschpreis.')}</p>
      <button data-view="more" style="width:100%">${tr('Schlüssel einrichten')}</button>`;
    return;
  }
  let html = `<button class="primary" data-prices="load" style="width:100%" ${prices.loading ? 'disabled' : ''}>
    ${prices.loading ? tr('Lade …') : tr('🔄 {fuel} im Umkreis von {rad} km', { fuel: FUEL_NAMES[cfg.type], rad: cfg.rad })}</button>`;
  if (prices.error) html += `<p class="note" style="color:var(--bad)">${esc(prices.error)}</p>`;
  if (prices.list) {
    html += prices.list.length ? `<ul class="list" style="margin-top:12px">${prices.list.map((s, i) => `
      <li>
        <div class="grow">
          <div class="title">${esc(s.brand || s.name)}${i === 0 ? ` <span class="pill ok">${tr('Am günstigsten')}</span>` : ''}${cfg.target && s.price <= cfg.target ? ` <span class="pill ok">${tr('unter Wunschpreis')}</span>` : ''}</div>
          <div class="meta">${esc(s.street)} ${esc(s.houseNumber || '')}, ${esc(s.place)} · ${fmtNum(s.dist, 1)} km</div>
        </div>
        <div class="amount">${fmtEUR(s.price, 3)}<br><a class="btn" href="https://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d" target="_blank" rel="noopener">${tr('Route')}</a></div>
      </li>`).join('')}</ul>`
      : `<p class="empty">${tr('Keine geöffnete Tankstelle mit diesem Kraftstoff im Umkreis.')}</p>`;
    if (cfg.target && prices.list.length) {
      const hits = prices.list.filter((s) => s.price <= cfg.target).length;
      html += `<p class="note ${hits ? 'good-text' : ''}">${hits ? tr('🎯 {n} Tankstellen liegen unter deinem Wunschpreis von {price}.', { n: hits, price: fmtEUR(cfg.target, 3) }) : tr('Keine Tankstelle liegt gerade unter deinem Wunschpreis von {price}.', { price: fmtEUR(cfg.target, 3) })}</p>`;
    }
    html += `<p class="note" style="margin-bottom:0">${tr('Stand {time} Uhr · Daten: MTS-K über Tankerkönig (CC BY 4.0)', { time: prices.time })}</p>`;
  }
  html += `<button class="link" data-open="priceTarget" style="width:100%;margin-top:6px">${cfg.target ? tr('Wunschpreis: {price}', { price: fmtEUR(cfg.target, 3) }) : tr('🎯 Wunschpreis festlegen')}</button>`;
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
    ${state.pool.people.length ? `<fieldset><legend>${tr('Mitfahrer')}</legend>${state.pool.people.map((p, i) => `<label class="check"><input type="checkbox" name="rider${i}" ${(e.riders || []).includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}</fieldset>` : ''}
    ${entry ? `<div class="actions" style="margin-bottom:0"><button type="button" data-return-trip="${entry.id}">${tr('🔁 Rückfahrt eintragen')}</button><button type="button" data-share-trip="${entry.id}">${tr('€ Kosten teilen')}</button></div>` : ''}
  `, (d) => {
    const startKm = num(d.startKm), endKm = num(d.endKm);
    if (startKm == null || endKm == null) return tr('Bitte km-Stand Start und Ende eingeben.');
    if (endKm <= startKm) return tr('Der km-Stand am Ende muss größer sein als am Start.');
    if (d.type === 'Geschäftlich' && !d.purpose.trim()) return tr('Bei Geschäftsfahrten ist der Zweck Pflicht (z. B. „Kundentermin“).');
    const rec = { id: entry?.id || uid(), date: d.date, type: d.type, from: d.from.trim(), to: d.to.trim(), startKm, endKm, purpose: d.purpose.trim(), partner: d.partner.trim(), riders: state.pool.people.filter((_, i) => d['rider' + i]) };
    if (entry) Object.assign(entry, rec); else state.trips.push(rec);
    tripYear = d.date.slice(0, 4);
    const drive = !entry && prefill.driveId && state.drives.find((x) => x.id === prefill.driveId);
    if (drive) drive.tripId = rec.id;
  }, { deleteFn: entry && (() => { state.trips = state.trips.filter((x) => x !== entry); }) });
}

// Rückfahrt: Orte getauscht, gleiche Strecke ab dem letzten km-Stand
function returnTrip(t) {
  const last = Math.max(t.endKm, ...state.trips.map((x) => x.endKm));
  sheet.close();
  setTimeout(() => tripForm(null, { date: t.date, type: t.type, from: t.to, to: t.from, startKm: last, endKm: last + (t.endKm - t.startKm), purpose: t.purpose, partner: t.partner }), 50);
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
