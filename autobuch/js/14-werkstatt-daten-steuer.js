'use strict';
// Autobuch – Mängelliste für die Werkstatt, Datencheck, Tankdaten-Import/-Export, Kfz-Steuer-Rechner,
// Fahrmodus, Spritpreis-Ziel, „Dein Autojahr“ als Bild.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Mängelliste (für den nächsten Werkstattbesuch) ---------- */

async function shareText(title, text) {
  if (navigator.share) { try { return await navigator.share({ title, text }); } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); alert(tr('In die Zwischenablage kopiert')); } catch (e) { prompt(tr('Link kopieren:'), text); }
}

function renderIssues() {
  const open = state.issues.filter((x) => !x.done), done = state.issues.filter((x) => x.done);
  const item = (x) => `<li class="checkitem">
    <label class="grow" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-issue="${x.id}" ${x.done ? 'checked' : ''}>
      <span><span class="title"${x.done ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${esc(x.text)}</span>
      <span class="meta" style="display:block">${fmtDate(x.date)}${x.done ? ' · ' + tr('erledigt {date}', { date: fmtDate(x.doneDate) }) : ''}</span></span></label>
    <button class="small" data-del-issue="${x.id}" aria-label="${tr('Löschen')}">×</button></li>`;
  $('#issueList').innerHTML = open.map(item).join('') || `<li class="empty">${tr('Keine offenen Punkte. Schreib hier auf, was dir am Auto auffällt, z. B. „Klappern vorne links bei Bodenwellen“.')}</li>`;
  $('#issueDone').innerHTML = done.length ? `<details><summary class="meta">${tr('Erledigt ({n})', { n: done.length })}</summary><ul class="list">${done.map(item).join('')}</ul></details>` : '';
  $('#issueShare').hidden = !open.length;
}

$('#issueForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = e.target.text.value.trim();
  if (!text) return;
  state.issues.push({ id: uid(), date: today(), text, done: false, doneDate: '' });
  e.target.text.value = '';
  save();
});
document.addEventListener('change', (e) => {
  const id = e.target.dataset?.issue;
  if (!id) return;
  const x = state.issues.find((i) => i.id === id);
  x.done = e.target.checked;
  x.doneDate = x.done ? today() : '';
  save();
});

function shareIssues() {
  const c = state.car, open = state.issues.filter((x) => !x.done);
  const text = `${tr('Mängelliste')} – ${[c.name, c.variant, c.year, state.docs.plate].filter(Boolean).join(' · ')}${currentKm() != null ? `, ${fmtNum(currentKm())} km` : ''}\n\n`
    + open.map((x, i) => `${i + 1}. ${x.text} (${tr('seit {date}', { date: fmtDate(x.date) })})`).join('\n');
  shareText(tr('Mängelliste'), text);
}

/* ---------- Datencheck ---------- */

function dataCheck() {
  const out = [];
  const add = (level, text, open) => out.push({ level, text, open });
  const byDate = [...state.fuel].sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  byDate.forEach((f, i) => {
    const prev = byDate[i - 1];
    if (prev && f.km < prev.km) add('bad', tr('Tankfüllung vom {date}: km-Stand {km} ist kleiner als bei der Tankfüllung davor ({prev}).', { date: fmtDate(f.date), km: fmtNum(f.km), prev: fmtNum(prev.km) }), () => fuelForm(f));
    if (f.date > today()) add('bad', tr('Tankfüllung vom {date} liegt in der Zukunft.', { date: fmtDate(f.date) }), () => fuelForm(f));
    const ppl = f.total / f.liters;
    if (unitOf(fillGrade(f)) === 'l' && (ppl < 0.8 || ppl > 3)) add('bad', tr('Tankfüllung vom {date}: {price} pro Liter ist unrealistisch. Liter und Betrag vertauscht?', { date: fmtDate(f.date), price: fmtEUR(ppl, 3) }), () => fuelForm(f));
    if (prev && f.date === prev.date && f.km === prev.km && f.total === prev.total) add('warn', tr('Tankfüllung vom {date} ist doppelt eingetragen.', { date: fmtDate(f.date) }), () => fuelForm(f));
  });
  const cons = consumption();
  if (cons.avg) {
    Object.entries(cons.per).forEach(([id, v]) => {
      if (v > cons.avg * 1.6 || v < cons.avg * 0.55) {
        const f = state.fuel.find((x) => x.id === id);
        add('warn', tr('Tankfüllung vom {date}: {cons} weicht stark vom Durchschnitt ab. Vielleicht eine Tankfüllung vergessen oder „Vollgetankt“ falsch gesetzt?', { date: fmtDate(f.date), cons: `${fmtNum(v, 1)} ${consUnit()}` }), () => fuelForm(f));
      }
    });
  }
  const costs = [...state.costs].filter((c) => !c.recurringId).sort((a, b) => a.date.localeCompare(b.date));
  costs.forEach((c, i) => {
    const p = costs[i - 1];
    if (p && p.date === c.date && p.cat === c.cat && p.amount === c.amount) add('warn', tr('Ausgabe „{cat}“ vom {date} ist doppelt eingetragen.', { cat: tr(c.cat), date: fmtDate(c.date) }), () => costForm(c));
  });
  const trips = [...state.trips].sort((a, b) => a.startKm - b.startKm);
  const overlaps = trips.filter((t, i) => i && t.startKm < trips[i - 1].endKm).length;
  if (overlaps) add('warn', tr('{n} Fahrten im Fahrtenbuch überschneiden sich beim km-Stand.', { n: overlaps }), () => showView('trips'));
  const unknown = state.maint.filter((m) => !m.lastDate && m.lastKm == null).length;
  if (unknown) add('info', tr('Bei {n} Wartungspunkten fehlt, wann sie zuletzt gemacht wurden. Dann kann die App keine Fälligkeit berechnen.', { n: unknown }), () => showView('maint'));
  if (state.fuel.some((f) => !f.station)) add('info', tr('Bei manchen Tankfüllungen fehlt die Tankstelle. Mit ihr funktioniert das Tankstellen-Ranking.'), () => showView('fuel'));
  return out;
}

function dataCheckSheet() {
  const list = dataCheck();
  dataCheckSheet.list = list;
  openSheet('Datencheck', list.length
    ? `<p class="note" style="margin-top:0">${tr('{n} Hinweise. Tipp auf einen Eintrag, um ihn zu öffnen.', { n: list.length })}</p>
      <ul class="list">${list.map((x, i) => `<li data-check="${i}" style="cursor:pointer"><span class="pill ${x.level === 'bad' ? 'over' : x.level === 'warn' ? 'soon' : 'unknown'}">${tr(x.level === 'bad' ? 'Fehler' : x.level === 'warn' ? 'Prüfen' : 'Tipp')}</span><div class="grow meta" style="margin-left:8px">${esc(x.text)}</div></li>`).join('')}</ul>`
    : `<p style="text-align:center;font-size:40px;margin:8px 0">✅</p><p class="note" style="text-align:center">${tr('Alles in Ordnung. Keine Auffälligkeiten gefunden.')}</p>`,
  () => {}, { submitLabel: 'Fertig' });
  sheetForm.querySelectorAll('[data-check]').forEach((li) => {
    li.onclick = () => { const x = list[li.dataset.check]; sheet.close(); setTimeout(x.open, 50); };
  });
}

/* ---------- Tankbuch als CSV ---------- */

function fuelCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cons = consumption();
  const rows = [['Datum', 'Kilometerstand', 'Spritsorte', 'Menge', 'Einheit', 'Betrag (€)', 'Preis pro Einheit (€)', 'Vollgetankt', 'Tankstelle', 'Verbrauch'].map((h) => tr(h))];
  [...state.fuel].sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km).forEach((f) => rows.push([
    fmtDate(f.date), f.km, tr(fillGrade(f)), fmtIn(f.liters, 2), unitOf(fillGrade(f)), fmtIn(f.total, 2), fmtIn(f.total / f.liters, 3),
    tr(f.full ? 'ja' : 'nein'), f.station || '', cons.per[f.id] != null ? fmtIn(cons.per[f.id], 2) : '',
  ]));
  return '﻿' + rows.map((r) => r.map(q).join(LANG === 'en' ? ',' : ';')).join('\r\n') + '\r\n';
}

/* ---------- Tankdaten aus CSV übernehmen ---------- */

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// 31.12.2025, 31/12/2025, 2025-12-31 (auch mit Uhrzeit dahinter)
function parseDate(s) {
  s = String(s).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Erkennung der Spalten: zuerst die eindeutigen Begriffe, dann allgemeinere
const CSV_FIELDS = [
  ['date', 'Datum', [/^(datum|date|ngày)/i, /dat/i], true],
  ['km', 'Kilometerstand', [/kilometerstand|odometer|tacho|mileage/i, /km/i], true],
  ['liters', 'Menge (Liter)', [/getankt|menge|liter|quantit|lít/i, /^l$/i], true],
  ['total', 'Betrag (€)', [/kosten|betrag|gesamt|total|cost/i, /€|eur/i], true],
  ['station', 'Tankstelle (optional)', [/tankstelle|station/i, /ort|location/i], false],
  ['full', 'Vollgetankt (optional)', [/vollgetankt|full|voll/i, /teil|partial/i], false],
];

function csvImportSheet() {
  let rows = null;
  openSheet('Tankdaten übernehmen', `
    <p class="note" style="margin-top:0">${tr('Übernimm alte Tankfüllungen aus einer CSV-Datei, z. B. aus Spritmonitor, einer anderen App oder Excel (als CSV gespeichert).')}</p>
    <label class="btn-file" style="display:block;text-align:center">${tr('📁 CSV-Datei wählen')}<input type="file" accept=".csv,text/csv,text/plain" hidden id="csvFile"></label>
    <div id="csvMap"></div>
  `, () => {
    if (!rows) return tr('Bitte zuerst eine CSV-Datei wählen.');
    const col = Object.fromEntries(CSV_FIELDS.map(([k]) => [k, sheetForm['col_' + k] ? Number(sheetForm['col_' + k].value) : -1]));
    if (['date', 'km', 'liters', 'total'].some((k) => col[k] < 0)) return tr('Bitte Datum, Kilometerstand, Menge und Betrag zuordnen.');
    let added = 0, skipped = 0;
    rows.slice(1).forEach((r) => {
      const date = parseDate(r[col.date]), km = num(r[col.km]), liters = num(r[col.liters]), total = num(r[col.total]);
      if (!date || km == null || !liters || total == null) { skipped++; return; }
      if (state.fuel.some((f) => f.date === date && f.km === km)) { skipped++; return; }
      const fullTxt = col.full >= 0 ? String(r[col.full] || '').trim().toLowerCase() : '';
      const full = !/^(0|nein|no|false|falsch|teil|partial|n)$/.test(fullTxt);
      state.fuel.push({ id: uid(), date, km, liters, total, full, station: col.station >= 0 ? String(r[col.station] || '').trim() : '', grade: defaultGrade() });
      added++;
    });
    setTimeout(() => alert(tr('{n} Tankfüllungen übernommen, {s} übersprungen (unvollständig oder schon vorhanden).', { n: added, s: skipped })), 300);
  }, { submitLabel: 'Übernehmen' });
  $('#csvFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    rows = parseCsv(await file.text());
    if (rows.length < 2) { rows = null; $('#csvMap').innerHTML = `<p class="hint bad-text">${tr('In der Datei wurden keine Zeilen gefunden.')}</p>`; return; }
    const head = rows[0];
    // Spalten anhand der Überschrift vorbelegen; ohne Treffer bleiben optionale Felder auf „nicht vorhanden“
    const select = (k, res, required) => {
      const hit = res.map((re) => head.findIndex((h) => re.test(h))).find((i) => i >= 0) ?? -1;
      return `<select name="col_${k}">${required ? '' : `<option value="-1">${tr('– nicht vorhanden –')}</option>`}${head.map((h, i) =>
        `<option value="${i}" ${i === hit ? 'selected' : ''}>${esc(h || tr('Spalte {n}', { n: i + 1 }))}</option>`).join('')}</select>`;
    };
    $('#csvMap').innerHTML = `<p class="hint">${tr('{n} Zeilen gefunden. Ordne die Spalten zu:', { n: rows.length - 1 })}</p>
      ${CSV_FIELDS.map(([k, label, re, required]) => `<label class="field"><span>${tr(label)}</span>${select(k, re, required)}</label>`).join('')}
      <p class="hint">${tr('Erste Zeile: {row}', { row: esc(rows[1].join(' | ')) })}</p>`;
  });
}

/* ---------- Kfz-Steuer-Rechner ---------- */

// Für Erstzulassungen ab Juli 2009: Hubraum-Sockel plus CO₂-Anteil (Stand 2026, ohne Gewähr)
function kfzTax(s, fuel) {
  const ccm = num(s.ccm), co2 = num(s.co2), reg = s.firstReg;
  if (!ccm || co2 == null || !reg) return null;
  if (reg < '2009-07') return { old: true };
  const base = Math.ceil(ccm / 100) * (fuel === 'Diesel' ? 9.5 : 2);
  let co2Part = 0;
  if (reg >= '2021-01') {
    const steps = [[95, 0], [115, 2], [135, 2.2], [155, 2.5], [175, 2.9], [195, 3.4], [Infinity, 4]];
    let lower = 0;
    for (const [upper, rate] of steps) { co2Part += Math.max(0, Math.min(co2, upper) - lower) * rate; lower = upper; if (co2 <= upper) break; }
  } else {
    const free = reg < '2012-01' ? 120 : reg < '2014-01' ? 110 : 95;
    co2Part = Math.max(0, co2 - free) * 2;
  }
  return { base, co2Part, total: base + co2Part };
}

function renderTax() {
  const s = state.specs || {}, t = kfzTax(s, state.car.fuel);
  const paid = state.costs.filter((c) => c.cat === 'Kfz-Steuer' && c.date > addDays(-365)).reduce((sum, c) => sum + c.amount, 0);
  $('#taxBody').innerHTML = !t ? `<p class="note" style="margin-top:0">${tr('Trag Hubraum, CO₂-Wert und Erstzulassung ein (alles im Fahrzeugschein: Felder P.1, V.7 und B). Dann rechnet die App deine Kfz-Steuer aus.')}</p>`
    : t.old ? `<p class="note" style="margin-top:0">${tr('Für Autos mit Erstzulassung vor Juli 2009 hängt die Steuer von der Schadstoffklasse ab. Das kann der Rechner nicht.')}</p>`
    : `<div class="bignum">${fmtEUR(t.total, 0)} <small>${tr('pro Jahr')}</small></div>
      <ul class="list" style="margin-top:6px">
        <li><div class="grow"><div class="title">${tr('Sockel für den Hubraum')}</div><div class="meta">${fmtNum(num(s.ccm))} cm³</div></div><div class="amount">${fmtEUR(t.base)}</div></li>
        <li><div class="grow"><div class="title">${tr('CO₂-Anteil')}</div><div class="meta">${fmtNum(num(s.co2))} g/km</div></div><div class="amount">${fmtEUR(t.co2Part)}</div></li>
        ${paid ? `<li><div class="grow"><div class="title">${tr('Laut deinen Ausgaben bezahlt')}</div><div class="meta">${tr('letzte 12 Monate')}</div></div><div class="amount">${fmtEUR(paid)}</div></li>` : ''}
      </ul>
      <p class="note" style="margin-bottom:0">${tr('Schätzung nach dem Kfz-Steuergesetz, ohne Gewähr. Den genauen Betrag findest du im Steuerbescheid vom Zoll.')}</p>`;
}

function taxForm() {
  const s = state.specs || {};
  openSheet('Kfz-Steuer berechnen', `
    ${field('Hubraum (cm³, Feld P.1)', 'ccm', s.ccm || '', 'inputmode="numeric" placeholder="z. B. 1595"')}
    ${field('CO₂ (g/km, Feld V.7)', 'co2', s.co2 || '', 'inputmode="numeric" placeholder="z. B. 128"')}
    ${field('Erstzulassung (Feld B)', 'firstReg', s.firstReg || (state.car.year ? state.car.year + '-01' : ''), 'type="month"')}
  `, (d) => {
    state.specs = { ...state.specs, ccm: d.ccm.trim(), co2: d.co2.trim(), firstReg: d.firstReg };
  });
}

/* ---------- Fahrmodus ---------- */

function openDriveMode() {
  const dlg = $('#driveMode'), p = state.parking;
  dlg.innerHTML = `
    <div class="dm-grid">
      <button type="button" data-dm="fuel">⛽<span>${tr('Tanken')}</span></button>
      <button type="button" data-dm="park">📍<span>${tr('Hier geparkt')}</span></button>
      <button type="button" data-dm="drive">▶<span>${tr('Fahrt aufzeichnen')}</span></button>
      <button type="button" data-dm="${p?.lat != null ? 'car' : 'trip'}">${p?.lat != null ? '🧭' : '🛣'}<span>${tr(p?.lat != null ? 'Zum Auto' : 'Fahrt eintragen')}</span></button>
      <a class="dm-sos" href="tel:112">🚑<span>${tr('Notruf 112')}</span></a>
      <button type="button" data-dm="close">×<span>${tr('Schließen')}</span></button>
    </div>`;
  dlg.showModal();
}

$('#driveMode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dm]');
  if (!b) return;
  const a = b.dataset.dm;
  $('#driveMode').close();
  if (a === 'fuel') fuelForm();
  else if (a === 'park') setParking();
  else if (a === 'drive') startDrive();
  else if (a === 'car') parkCompass();
  else if (a === 'trip') tripForm();
});

/* ---------- Spritpreis-Ziel ---------- */

function priceTargetForm() {
  openSheet('Wunschpreis', `
    ${field('Wunschpreis pro Liter (€)', 'target', fmtIn(state.prices.target, 3), 'inputmode="decimal" placeholder="z. B. 1,699"')}
    <p class="hint">${tr('Bei der Preissuche markiert die App alle Tankstellen, die darunter liegen. Feld leer lassen zum Abschalten.')}</p>
  `, (d) => { state.prices.target = num(d.target); });
}

/* ---------- „Dein Autojahr“ als Bild ---------- */

function storyImage(y) {
  const W = 1080, H = 1920, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d6694';
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, accent); bg.addColorStop(1, '#0c1016');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const font = (w, px) => `${w} ${px}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  const text = (t, x, y2, px, w = 700, color = '#fff') => { g.font = font(w, px); g.fillStyle = color; g.fillText(t, x, y2); };
  text(tr('Mein Autojahr'), 90, 300, 64, 600, 'rgba(255,255,255,.8)');
  text(y, 90, 470, 190, 800);
  text([state.car.name, state.car.variant].filter(Boolean).join(' · '), 90, 560, 52, 500, 'rgba(255,255,255,.85)');
  const inY = (d) => d && d.startsWith(y);
  const f = yearFigures(y, allExpenses(), kmPoints(), consumption().segs);
  const fills = state.fuel.filter((x) => inY(x.date));
  const kg = co2Of(fills);
  const rows = [
    [tr('Gefahren'), f.driven ? `${fmtNum(f.driven)} km` : null],
    [tr('Getankt'), fills.length ? `${fills.length}× · ${fmtNum(fills.reduce((s, x) => s + x.liters, 0))} ${unitOf(defaultGrade())}` : null],
    [tr('Ø Verbrauch'), f.cons ? `${fmtNum(f.cons, 1)} ${consUnit()} km` : null],
    [tr('Kosten'), f.cost ? fmtEUR(f.cost, 0) : null],
    [tr('CO₂'), kg ? `${fmtNum(kg)} kg` : null],
    [tr('Fahrten'), state.trips.filter((t) => inY(t.date)).length || null],
  ].filter(([, v]) => v != null);
  let yy = 760;
  rows.forEach(([label, value]) => {
    g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); (g.roundRect ? g.roundRect(70, yy - 92, W - 140, 150, 36) : g.rect(70, yy - 92, W - 140, 150)); g.fill();
    text(label, 120, yy, 44, 500, 'rgba(255,255,255,.75)');
    g.font = font(800, 64); const wv = g.measureText(String(value)).width;
    text(String(value), W - 120 - wv, yy + 20, 64, 800);
    yy += 185;
  });
  text(tr('Erstellt mit Autobuch'), 90, H - 110, 36, 500, 'rgba(255,255,255,.55)');
  return cv;
}

function shareStoryImage(y) {
  storyImage(y).toBlob(async (blob) => {
    const file = new File([blob], `autobuch-${y}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { return await navigator.share({ files: [file] }); } catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadFile(file);
  }, 'image/png');
}

function renderExtras5() {
  renderIssues();
  renderTax();
}
