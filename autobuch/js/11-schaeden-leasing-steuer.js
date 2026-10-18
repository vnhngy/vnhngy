'use strict';
// Autobuch – Schäden, Leasing, Pendlerpauschale, Spritspar-Rechner, Steckbrief, Notfall-Sperrbildschirm.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Schäden (Kratzer, Dellen, Steinschläge) ---------- */

// [id, Name, Position in der Skizze in % (Draufsicht, Front oben)]; ohne Position nur in der Auswahl
const DAMAGE_ZONES = [
  ['front', 'Stoßstange vorne', 50, 6], ['hood', 'Motorhaube', 50, 21], ['windshield', 'Frontscheibe', 50, 34],
  ['fl', 'Vorne links', 13, 22], ['fr', 'Vorne rechts', 87, 22], ['l', 'Seite links', 13, 52], ['r', 'Seite rechts', 87, 52],
  ['roof', 'Dach', 50, 55], ['rl', 'Hinten links', 13, 80], ['rr', 'Hinten rechts', 87, 80], ['rear', 'Heck', 50, 92],
  ['wheels', 'Felgen & Reifen'], ['inside', 'Innenraum'],
];
const zoneName = (id) => (DAMAGE_ZONES.find((z) => z[0] === id) || DAMAGE_ZONES[0])[1];

function renderDamages() {
  const open = state.damages.filter((d) => !d.repaired);
  const count = (z) => open.filter((d) => d.zone === z).length;
  $('#dmgCar').innerHTML = `<svg viewBox="0 0 100 160" aria-hidden="true">
      <rect x="22" y="4" width="56" height="152" rx="22" class="body"/>
      <path d="M28 52 Q50 42 72 52 L69 66 Q50 61 31 66z" class="glass"/>
      <path d="M31 120 Q50 125 69 120 L71 132 Q50 138 29 132z" class="glass"/>
      <rect x="31" y="70" width="38" height="46" rx="6" class="roof"/>
    </svg>
    ${DAMAGE_ZONES.filter((z) => z[2] != null).map(([id, name, x, y]) => {
      const n = count(id);
      return `<button type="button" class="dmg-spot${n ? ' has' : ''}" style="left:${x}%;top:${y}%" data-dmg-zone="${id}" aria-label="${esc(tr(name))}${n ? ': ' + n : ''}">${n || '+'}</button>`;
    }).join('')}`;
  const item = (d) => `<li data-edit-dmg="${d.id}">
      <div class="grow"><div class="title">${esc(tr(zoneName(d.zone)))}</div>
      <div class="meta">${[fmtDate(d.date), d.desc && esc(d.desc), d.photos?.length && '📎 ' + d.photos.length, d.repaired && tr('repariert {date}', { date: fmtDate(d.repairedDate) })].filter(Boolean).join(' · ')}</div></div>
      <span class="pill ${d.repaired ? 'ok' : 'soon'}">${tr(d.repaired ? 'Repariert' : 'Offen')}</span></li>`;
  const fixed = state.damages.filter((d) => d.repaired).sort((a, b) => b.date.localeCompare(a.date));
  $('#dmgList').innerHTML = open.sort((a, b) => b.date.localeCompare(a.date)).map(item).join('')
    || `<li class="empty">${tr('Keine offenen Schäden. Tipp auf eine Stelle am Auto, um einen Kratzer oder eine Delle festzuhalten.')}</li>`;
  $('#dmgFixed').innerHTML = fixed.length ? `<details class="card"><summary class="title">${tr('Repariert ({n})', { n: fixed.length })}</summary><ul class="list">${fixed.map(item).join('')}</ul></details>` : '';
}

function damageForm(entry, zone = 'front') {
  const e = entry || { date: today(), zone, desc: '', photos: [], repaired: false, repairedDate: '' };
  openSheet(entry ? 'Schaden bearbeiten' : 'Schaden festhalten', `
    <label class="field"><span>${tr('Stelle')}</span><select name="zone">${DAMAGE_ZONES.map(([id, name]) => `<option value="${id}" ${id === e.zone ? 'selected' : ''}>${tr(name)}</option>`).join('')}</select></label>
    ${field('Datum', 'date', e.date, 'type="date" required')}
    ${field('Beschreibung', 'desc', e.desc, 'placeholder="z. B. Kratzer ca. 10 cm, Parkplatz Edeka"')}
    ${photoField(e.photos, 'Fotos vom Schaden')}
    <label class="check"><input type="checkbox" name="repaired" ${e.repaired ? 'checked' : ''}> ${tr('Repariert')}</label>
  `, (d) => {
    const repaired = d.repaired === 'on';
    const rec = { zone: d.zone, date: d.date, desc: d.desc.trim(), photos: commitPhotos(), repaired, repairedDate: repaired ? (e.repairedDate || today()) : '' };
    if (entry) Object.assign(entry, rec); else state.damages.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.damages = state.damages.filter((x) => x !== entry); }) });
  wirePhotos();
}

/* ---------- Leasing / km-Limit ---------- */

function leasingStatus() {
  const l = state.leasing;
  if (!l || !l.start || !l.end || !l.kmPerYear) return null;
  const total = daysUntil(l.end) - daysUntil(l.start);
  if (total <= 0) return null;
  const elapsed = Math.min(total, Math.max(0, -daysUntil(l.start)));
  const km = currentKm();
  const driven = km != null && l.kmStart != null ? Math.max(0, km - l.kmStart) : null;
  const allowedTotal = l.kmPerYear * total / 365.25;
  const allowedNow = allowedTotal * elapsed / total;
  const projected = driven != null && elapsed >= 30 ? driven / elapsed * total : null;
  const over = projected != null ? projected - allowedTotal : null;
  return { l, total, elapsed, driven, allowedTotal, allowedNow, projected, over, cost: over > 0 && l.rate ? over * l.rate / 100 : 0, left: daysUntil(l.end) };
}

function renderLeasing() {
  const s = leasingStatus();
  if (!s) {
    $('#leaseBody').innerHTML = `<p class="note" style="margin-top:0">${tr('Für Leasing- oder Finanzierungsverträge mit Kilometer-Limit: Die App rechnet hoch, ob du am Vertragsende zu viele Kilometer hast und was das kostet.')}</p>
      <button class="primary" data-open="leasing" style="width:100%">${tr('Vertrag eintragen')}</button>`;
    return;
  }
  const share = s.driven != null ? s.driven / s.allowedTotal : 0, nowShare = s.allowedNow / s.allowedTotal;
  const cls = s.over == null ? 'good' : s.over > 0 ? (s.over > s.allowedTotal * 0.05 ? 'bad' : 'warn') : 'good';
  $('#leaseBody').innerHTML = `
    <div class="maint-head"><span class="title">${tr('Gefahren seit Vertragsbeginn')}</span><span class="amount" style="font-weight:700">${s.driven != null ? fmtNum(s.driven) : '–'} / ${fmtNum(s.allowedTotal)} km</span></div>
    <div class="progress lease"><i style="width:${Math.min(share, 1) * 100}%;background:var(--${cls})"></i><b style="left:${nowShare * 100}%" title="${tr('Soll heute')}"></b></div>
    <div class="meta">${tr('Soll bis heute: {km} km', { km: fmtNum(s.allowedNow) })} · ${s.left > 0 ? tr('noch {n} Tage', { n: fmtNum(s.left) }) : tr('Vertrag beendet')}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="label">${tr('Hochrechnung Ende')}</div><div class="value">${s.projected != null ? fmtNum(s.projected) + ' <small>km</small>' : '–'}</div></div>
      <div class="stat"><div class="label">${s.over > 0 ? tr('Mehr-km') : tr('Puffer')}</div><div class="value ${s.over > 0 ? 'bad-text' : 'good-text'}">${s.over != null ? fmtNum(Math.abs(s.over)) + ' <small>km</small>' : '–'}</div></div>
    </div>
    ${s.over > 0 ? `<p class="note">${tr('⚠︎ Bei diesem Tempo fährst du ca. {km} km zu viel.', { km: fmtNum(s.over) })}${s.cost ? ' ' + tr('Das kostet etwa {eur}.', { eur: fmtEUR(s.cost, 0) }) : ''} ${tr('Erlaubt wären ab heute noch ca. {n} km pro Monat.', { n: fmtNum(Math.max(0, (s.allowedTotal - s.driven) / Math.max(1, s.left / 30.44))) })}</p>`
      : s.over != null ? `<p class="note">${tr('✓ Du liegst im Limit.')}</p>` : `<p class="note">${tr('Eine Hochrechnung gibt es nach den ersten 30 Tagen und mit aktuellem Kilometerstand.')}</p>`}
    <button data-open="leasing" style="width:100%">${tr('Vertrag bearbeiten')}</button>`;
}

function leasingNotice() {
  const s = leasingStatus();
  if (!s || !(s.over > 1000) || s.left <= 0) return '';
  return `<div class="card notice"><span class="ico">🚗</span><div class="grow">
    <div class="title">${tr('Leasing: ca. {km} km zu viel', { km: fmtNum(s.over) })}</div>
    <div class="meta">${s.cost ? tr('Das kostet etwa {eur}.', { eur: fmtEUR(s.cost, 0) }) : tr('Hochrechnung bis zum Vertragsende.')}</div>
    <div class="maint-btns"><button class="small primary" data-view="leasing">${tr('Ansehen')}</button></div></div></div>`;
}

function leasingForm() {
  const l = state.leasing || { start: today(), end: addMonths(today(), 36), kmStart: currentKm() ?? '', kmPerYear: 10000, rate: '' };
  openSheet('Leasing-Vertrag', `
    <div class="row2">
      ${field('Vertragsbeginn', 'start', l.start, 'type="date" required')}
      ${field('Vertragsende', 'end', l.end, 'type="date" required')}
    </div>
    <div class="row2">
      ${field('km-Stand bei Übernahme', 'kmStart', l.kmStart ?? '', 'inputmode="numeric" required')}
      ${field('Freie km pro Jahr', 'kmPerYear', l.kmPerYear, 'inputmode="numeric" required placeholder="z. B. 10000"')}
    </div>
    ${field('Preis pro Mehr-km (Cent)', 'rate', fmtIn(l.rate, 1), 'inputmode="decimal" placeholder="steht im Vertrag, z. B. 8,5"')}
  `, (d) => {
    const kmStart = num(d.kmStart), kmPerYear = num(d.kmPerYear);
    if (kmStart == null || !kmPerYear) return tr('Bitte km-Stand und freie km pro Jahr eingeben.');
    if (d.end <= d.start) return tr('Das Vertragsende muss nach dem Beginn liegen.');
    state.leasing = { start: d.start, end: d.end, kmStart, kmPerYear, rate: num(d.rate) };
  }, { deleteFn: state.leasing && (() => { state.leasing = null; }) });
}

/* ---------- Pendlerpauschale ---------- */

// Entfernungspauschale je Arbeitstag: ab 2026 einheitlich 0,38 €/km, vorher 0,30 € bis 20 km und 0,38 € darüber
const commuteDay = (y, km) => +y >= 2026 ? km * 0.38 : Math.min(km, 20) * 0.30 + Math.max(km - 20, 0) * 0.38;

function commuteFigures(y) {
  const trips = state.trips.filter((t) => t.type === 'Arbeitsweg' && t.date.startsWith(y));
  if (!trips.length) return null;
  const dists = trips.map((t) => t.endKm - t.startKm).sort((a, b) => a - b);
  const km = Math.round(dists[Math.floor(dists.length / 2)]);
  const days = new Set(trips.map((t) => t.date)).size;
  return { km, days, amount: commuteDay(y, km) * days };
}

function renderCommute() {
  const c = commuteFigures(tripYear);
  $('#commuteBody').innerHTML = (c ? `<ul class="list">
      <li><div class="grow"><div class="title">${tr('Arbeitstage mit Fahrt')}</div></div><div class="amount">${fmtNum(c.days)}</div></li>
      <li><div class="grow"><div class="title">${tr('Entfernung (einfach)')}</div><div class="meta">${tr('typische Strecke im Fahrtenbuch')}</div></div><div class="amount">${fmtNum(c.km)} km</div></li>
      <li><div class="grow"><div class="title">${tr('Pendlerpauschale {year}', { year: tripYear })}</div></div><div class="amount">${fmtEUR(c.amount, 0)}</div></li>
    </ul>` : `<p class="note" style="margin-top:0">${tr('Trag Fahrten mit der Art „Wohnung ↔ Arbeit“ ein, dann rechnet die App die Pendlerpauschale für die Steuererklärung aus.')}</p>`)
    + `<p class="note">${tr('Wirkt sich erst aus, wenn deine Werbungskosten zusammen über 1.230 € im Jahr liegen. Schätzung, keine Steuerberatung.')}</p>
    <button data-open="commute" style="width:100%">${tr('Mit eigenen Werten rechnen')}</button>`;
}

function commuteForm() {
  const c = commuteFigures(tripYear) || { km: '', days: 220 };
  openSheet('Pendlerpauschale', `
    <div class="row2">
      ${field('Entfernung (km, einfach)', 'km', c.km, 'inputmode="decimal" placeholder="z. B. 23"')}
      ${field('Arbeitstage', 'days', c.days, 'inputmode="numeric" placeholder="z. B. 220"')}
    </div>
    <div class="bignum" id="commuteOut" style="text-align:center;margin:8px 0">–</div>
    <p class="hint">${tr('Gezählt wird nur die einfache Strecke zwischen Wohnung und Arbeit, je Arbeitstag einmal. Ab 2026 gibt es 0,38 € ab dem ersten Kilometer.')}</p>
  `, () => {}, { submitLabel: 'Fertig' });
  const calc = () => {
    const km = num(sheetForm.km.value), days = num(sheetForm.days.value);
    $('#commuteOut').textContent = km && days ? fmtEUR(commuteDay(tripYear, km) * days, 0) : '–';
  };
  sheetForm.km.addEventListener('input', calc);
  sheetForm.days.addEventListener('input', calc);
  calc();
}

/* ---------- Spritspar-Rechner ---------- */

function updateSaveCalc() {
  const f = $('#saveForm');
  if (!f) return;
  if (!f.km.dataset.touched) {
    const kpd = kmPerDay();
    f.km.value = fmtIn(kpd ? Math.round(kpd * 365 / 500) * 500 : 12000, 0);
  }
  const fills = state.fuel.filter((x) => x.liters > 0 && gradeOf(fillGrade(x)).fam === mainFam()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const price = fills.length ? fills.reduce((s, x) => s + x.total, 0) / fills.reduce((s, x) => s + x.liters, 0) : 1.8;
  const less = Number(f.less.value), km = num(f.km.value) || 0;
  const liters = less * km / 100;
  $('#saveLess').textContent = `${fmtNum(less, 1)} ${consUnit()} km`;
  $('#saveOut').innerHTML = `<div class="split">
      <div><div class="label">${tr('Ersparnis pro Jahr')}</div><div class="bignum">${fmtEUR(liters * price, 0)}</div></div>
      <div><div class="label">${tr('Weniger CO₂')}</div><div class="bignum">${fmtNum(liters * (CO2_FACTOR[mainFam()] || 2.37))} kg</div></div>
    </div>
    <p class="note" style="margin-bottom:0">${tr('{l} Liter weniger im Jahr, gerechnet mit {price} pro Liter (Ø deiner letzten Tankfüllungen).', { l: fmtNum(liters), price: fmtEUR(price, 3) })}</p>`;
}
$('#saveForm').addEventListener('input', (e) => { if (e.target.name === 'km') e.target.dataset.touched = '1'; updateSaveCalc(); });
$('#saveForm').addEventListener('submit', (e) => e.preventDefault());

/* ---------- Fahrzeug-Steckbrief ---------- */

const SPEC_FIELDS = [
  ['tireSize', 'Reifengröße', 'z. B. 205/55 R16 91V'], ['pressFront', 'Reifendruck vorne (bar)', 'z. B. 2,3'], ['pressRear', 'Reifendruck hinten (bar)', 'z. B. 2,1'],
  ['oil', 'Motoröl', 'z. B. 5W-30, MB 229.5'], ['oilQty', 'Ölmenge mit Filter', 'z. B. 5,5 Liter'], ['power', 'Leistung', 'z. B. 90 kW / 122 PS'],
  ['engine', 'Hubraum', 'z. B. 1.595 cm³'], ['color', 'Farbe / Farbcode', 'z. B. Polarsilber 761'], ['battery', 'Batterie', 'z. B. 12 V, 70 Ah, AGM'],
  ['wipers', 'Scheibenwischer', 'z. B. 650 / 475 mm'], ['keyNo', 'Schlüsselnummer', ''], ['radioCode', 'Radio-Code', ''],
];

function specRows() {
  const c = state.car, d = state.docs, s = state.specs || {};
  return [
    ['Fahrzeug', [c.name, c.variant].filter(Boolean).join(' · ')], ['Baujahr', c.year], ['Kraftstoff', c.fuel && tr(c.fuel)], ['Tankgröße', c.tank && `${fmtNum(c.tank)} l`],
    ['Kennzeichen', d.plate], ['FIN', d.vin], ...SPEC_FIELDS.map(([k, label]) => [label, s[k]]),
  ].filter(([, v]) => v);
}

function renderSpecs() {
  const rows = specRows();
  $('#specBody').innerHTML = `<dl class="kv">${rows.map(([k, v]) => `<dt>${tr(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${Object.values(state.specs || {}).some(Boolean) ? '' : `<p class="note">${tr('Trag Reifengröße, Ölsorte, Reifendruck und mehr ein. Dann hast du es in der Werkstatt, beim Reifenhändler oder an der Tankstelle sofort parat.')}</p>`}`;
}

function specsForm() {
  const s = state.specs || {};
  openSheet('Steckbrief bearbeiten', `
    ${SPEC_FIELDS.map(([k, label, ph]) => field(label, k, s[k] || '', ph ? `placeholder="${ph}"` : '')).join('')}
    <p class="hint">${tr('Reifengröße und Reifendruck stehen meist innen in der Tankklappe, die Ölnorm im Serviceheft.')}</p>
  `, (d) => {
    state.specs = Object.fromEntries(SPEC_FIELDS.map(([k]) => [k, d[k].trim()]));
  });
}

async function shareSpecs() {
  const text = specRows().map(([k, v]) => `${tr(k)}: ${v}`).join('\n');
  if (navigator.share) {
    try { return await navigator.share({ title: tr('Fahrzeug-Steckbrief'), text }); } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); alert(tr('In die Zwischenablage kopiert')); } catch (e) { prompt(tr('Link kopieren:'), text); }
}

/* ---------- Notfall-Sperrbildschirm ---------- */

// Bild in iPhone-Auflösung; der obere Teil bleibt frei für Uhrzeit und Widgets
function lockscreenCanvas() {
  const W = 1179, H = 2556, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), d = state.docs, c = state.car;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d2633'); bg.addColorStop(1, '#0c1016');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const font = (w, px) => `${w} ${px}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  let y = 1020;
  const line = (text, px, color, weight = 600, gap = 1.35) => {
    if (!text) return;
    let size = px;
    g.font = font(weight, size);
    while (g.measureText(text).width > W - 180 && size > 30) g.font = font(weight, --size);
    g.fillStyle = color; g.fillText(text, 90, y);
    y += size * gap;
  };
  line(tr('IM NOTFALL').toUpperCase(), 44, '#e08b8b', 700, 1.8);
  if (d.icePhone) {
    line(tr('Bitte anrufen:'), 44, 'rgba(255,255,255,.7)', 500, 2.1);
    line(`${d.iceName || ''}  ${d.icePhone}`.trim(), 72, '#fff', 700, 1.6);
  }
  line(tr('Notruf 112 · Polizei 110'), 52, '#fff', 600, 2);
  // Fahrzeugdaten in einem hellen Kasten
  const rows = [
    [[c.name, d.plate].filter(Boolean).join(' · '), 50, '#fff', 600],
    d.insurer && [`${tr('Versicherung')}: ${d.insurer}${d.policy ? ' · ' + d.policy : ''}`, 40, 'rgba(255,255,255,.85)', 500],
    d.claimPhone && [`${tr('Schadenhotline')}: ${d.claimPhone}`, 40, 'rgba(255,255,255,.85)', 500],
    d.breakdown && [`${tr('Pannenhilfe')}: ${d.breakdown}`, 40, 'rgba(255,255,255,.85)', 500],
  ].filter((r) => r && r[0]);
  const top = y - 30, height = rows.reduce((sum, r) => sum + r[1] * 1.5, 0) + 60;
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.beginPath(); g.roundRect ? g.roundRect(60, top, W - 120, height, 36) : g.rect(60, top, W - 120, height); g.fill();
  y += 50;
  rows.forEach(([text, px, color, weight]) => line(text, px, color, weight, 1.5));
  return cv;
}

function lockscreenSheet() {
  const d = state.docs;
  openSheet('Notfall-Sperrbildschirm', `
    <p class="note" style="margin-top:0">${tr('Ein Hintergrundbild mit deinen Notfalldaten. Helfer sehen es, ohne dein iPhone zu entsperren.')}</p>
    ${d.icePhone || d.insurer || d.plate ? '' : `<p class="hint warn-text">${tr('Tipp: Trag unter „Meine Daten & Nummern“ zuerst Kennzeichen, Versicherung und einen Notfallkontakt ein.')}</p>`}
    <div class="lock-preview"><img id="lockImg" alt="${tr('Vorschau')}"></div>
    <button type="button" class="primary" id="lockSave" style="width:100%">${tr('Bild sichern')}</button>
    <ol class="steps" style="margin-top:12px">
      <li>${tr('„Bild sichern“ tippen und im Teilen-Menü „Bild sichern“ wählen.')}</li>
      <li>${tr('In der Fotos-App das Bild öffnen → Teilen → „Als Hintergrund verwenden“.')}</li>
    </ol>
  `, () => {}, { submitLabel: 'Fertig' });
  lockscreenCanvas().toBlob((blob) => {
    if (!blob || !$('#lockImg')) return;
    $('#lockImg').src = URL.createObjectURL(blob);
    $('#lockSave').onclick = async () => {
      const file = new File([blob], 'autobuch-notfall.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { return await navigator.share({ files: [file] }); } catch (e) { if (e.name === 'AbortError') return; }
      }
      downloadFile(file);
    };
  }, 'image/png');
}

function renderExtras2() {
  renderDamages();
  renderLeasing();
  renderCommute();
  renderSpecs();
}
