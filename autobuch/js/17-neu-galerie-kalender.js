'use strict';
// Drivo – „Neu in dieser Version“, Belege-Galerie, Monatskalender, Ersatzteile, Spritpreis-Verlauf.
// (Parkplatz-Foto steckt beim Parkplatz, die Gebrauchtwagen-Checkliste bei den Checklisten.)
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Neu in dieser Version ---------- */

const CHANGELOG = [
  ['1.2.0', ['Neuer Name: Autobuch heißt jetzt Drivo', 'Neues Logo']],
  ['1.1.2', ['Übersicht aufgeräumt: Termine und Chronik findest du jetzt im Kalender (oben umschalten)']],
  ['1.1.1', ['Fahrzeugfoto wird schärfer gespeichert']],
  ['1.1.0', ['Spritpreise auch ohne Tankerkönig-Schlüssel: direkt zu clever-tanken.de oder Apple Karten']],
  ['1.0.0', ['Neue Versionsnummern: ab jetzt 1.0.0, mit neuen Funktionen 1.1.0 und so weiter']],
  ['0.32', ['Belege-Galerie: alle Fotos auf einen Blick', 'Monatskalender mit allen Einträgen', 'Parkplatz mit Foto', 'Ersatzteil-Liste im Steckbrief', 'Spritpreis-Verlauf beim Tanken', 'Checkliste für den Gebrauchtwagenkauf']],
  ['0.31', ['Pflege-Plan', 'Fahrgemeinschaft mit Monatsabrechnung', 'Zuladungs-Rechner', 'Warnleuchten-Quiz', 'Tanken per Sprache', 'Garantie-Tracker']],
  ['0.30', ['Versicherte Kilometer', 'Haltbarkeit von Verbandkasten & Co.', 'Pannenhilfe zum Nachlesen', 'Werkstatt-Bewertung', 'Fahrgewohnheiten', 'Lohnt sich die Reparatur?']],
  ['0.29', ['Mängelliste für die Werkstatt', 'Datencheck', 'Tankdaten importieren und exportieren', 'Kfz-Steuer-Rechner', 'Fahrmodus mit großen Knöpfen', 'Wunschpreis beim Tanken']],
];

function whatsNewSheet(all = false) {
  const seen = state.seenVersion;
  const list = CHANGELOG.filter(([v]) => all || !seen || cmpVer(v, seen) > 0).slice(0, all ? 4 : 2);
  openSheet('Neu in Drivo', list.map(([v, items]) => `
    <h4 style="margin:12px 0 6px">${tr('Version {v}', { v })}</h4>
    <ul class="tips">${items.map((x) => `<li>${tr(x)}</li>`).join('')}</ul>`).join(''), () => {}, { submitLabel: 'Alles klar' });
}

// Nach einem Update einmal zeigen; beim allerersten Start nicht (da läuft der Assistent)
function maybeWhatsNew() {
  if (appLocked || (state.seenVersion && cmpVer(state.seenVersion, APP_VERSION) >= 0)) return;
  if (!hasNoData()) whatsNewSheet();
  state.seenVersion = APP_VERSION;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* egal */ }
}

/* ---------- Belege-Galerie ---------- */

let galFilter = 'all';
const GAL_FILTERS = [['all', 'Alles'], ['receipt', 'Belege'], ['damage', 'Schäden & Unfälle'], ['doc', 'Dokumente'], ['other', 'Sonstiges']];

function galleryItems() {
  const out = [];
  const add = (kind, photos, date, label) => (photos || []).forEach((id) => out.push({ id, kind, date: (date || '').slice(0, 10), label }));
  state.fuel.forEach((f) => add('receipt', f.photos, f.date, tr('Tankbeleg')));
  state.costs.forEach((c) => add('receipt', c.photos, c.date, tr(c.cat)));
  state.fines.forEach((f) => add('receipt', f.photos, f.date, tr(f.type)));
  state.damages.forEach((d) => add('damage', d.photos, d.date, tr(zoneName(d.zone))));
  state.accidents.forEach((a) => add('damage', a.photos, a.date, tr('Unfall')));
  state.documents.forEach((d) => add('doc', d.photos, d.expires || '', d.title || tr(d.type)));
  state.notes.forEach((n) => add('other', n.photos, n.date, n.title || tr('Notiz')));
  state.handovers.forEach((h) => add('other', h.photos, h.date, tr(h.type)));
  if (state.parking) add('other', state.parking.photos, new Date(state.parking.time).toISOString(), tr('Parkplatz'));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function renderGallery() {
  $('#galSeg').innerHTML = GAL_FILTERS.map(([k, l]) => `<button type="button" data-gal="${k}" aria-pressed="${k === galFilter}">${tr(l)}</button>`).join('');
  const items = galleryItems().filter((x) => galFilter === 'all' || x.kind === galFilter);
  $('#galGrid').innerHTML = items.map((x) => `<figure class="gal-item"><img data-photo="${x.id}" alt="${esc(x.label)}">
    <figcaption>${esc(x.label)}${x.date ? `<br>${fmtDate(x.date)}` : ''}</figcaption></figure>`).join('')
    || `<p class="empty">${tr('Noch keine Fotos. Fotos von Belegen, Schäden und Dokumenten erscheinen hier gesammelt.')}</p>`;
  $('#galGrid').querySelectorAll('img[data-photo]').forEach(async (img) => { img.src = await photoUrl(img.dataset.photo) || ''; });
}

$('#galGrid').addEventListener('click', (e) => {
  const img = e.target.closest('img[data-photo]');
  if (img?.src) { $('#viewer img').src = img.src; $('#viewer').showModal(); }
});

/* ---------- Monatskalender ---------- */

let calMonth = today().slice(0, 7), calDay = today();

function calEvents() {
  const past = historyItems().map((x) => ({ ...x, dot: x.kind === 'fuel' ? 'fuel' : x.kind === 'trip' ? 'trip' : x.kind === 'cost' ? 'cost' : 'other' }));
  const future = agendaItems().filter((x) => x.date >= today()).map((x) => ({ date: x.date, icon: x.icon, title: esc(x.title), meta: esc(x.meta || ''), dot: 'due', open: x.open || (() => showView(x.view)) }));
  return [...past, ...future];
}

function renderCalendar() {
  const events = calEvents(), byDay = {};
  events.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), offset = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div></div>');
  for (let d = 1; d <= days; d++) {
    const date = `${calMonth}-${String(d).padStart(2, '0')}`, ev = byDay[date] || [];
    const dots = [...new Set(ev.map((x) => x.dot))].map((k) => `<i class="cd-${k}"></i>`).join('');
    cells.push(`<button type="button" class="cal-day${date === today() ? ' today' : ''}${date === calDay ? ' sel' : ''}" data-cal-day="${date}">${d}<span>${dots}</span></button>`);
  }
  $('#calTitle').textContent = fmtMonth(calMonth + '-15');
  $('#calGrid').innerHTML = WEEKDAYS.map((w) => `<div class="cal-head">${tr(w)}</div>`).join('') + cells.join('');
  const list = byDay[calDay] || [];
  renderCalendar.list = list;
  $('#calList').innerHTML = `<li class="agenda-month">${fmtDate(calDay)}</li>` + (list.map((x, i) => `<li data-cal-item="${i}" style="cursor:pointer">
    <div class="grow"><div class="title">${x.icon} ${x.title}</div>${x.meta ? `<div class="meta">${x.meta}</div>` : ''}</div>
    ${x.amount != null ? `<div class="amount">${fmtEUR(x.amount)}</div>` : ''}</li>`).join('') || `<li class="empty">${tr('Keine Einträge an diesem Tag.')}</li>`);
}

function calShift(n) {
  const [y, m] = calMonth.split('-').map(Number), d = new Date(y, m - 1 + n, 1);
  calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  calDay = calMonth === today().slice(0, 7) ? today() : calMonth + '-01';
  renderCalendar();
}

/* ---------- Ersatzteile ---------- */

function renderParts() {
  $('#partList').innerHTML = state.parts.map((x) => `<li data-edit-part="${x.id}" style="cursor:pointer">
    <div class="grow"><div class="title">${esc(x.name)}</div><div class="meta">${esc([x.number && tr('Nr. {n}', { n: x.number }), x.source].filter(Boolean).join(' · '))}</div></div>
    ${x.price ? `<div class="amount">${fmtEUR(x.price)}</div>` : ''}</li>`).join('')
    || `<li class="empty">${tr('Trag die Teilenummern ein, z. B. von Ölfilter, Luftfilter, Wischerblättern oder Lampen. Dann kaufst du beim nächsten Mal sofort das Richtige.')}</li>`;
}

function partForm(entry) {
  const e = entry || { name: '', number: '', source: '', price: '', note: '' };
  openSheet(entry ? 'Ersatzteil bearbeiten' : 'Ersatzteil hinzufügen', `
    ${field('Teil', 'name', e.name, 'required placeholder="z. B. Ölfilter"')}
    ${field('Teilenummer', 'number', e.number, 'placeholder="z. B. A 270 180 02 10"')}
    <div class="row2">
      ${field('Gekauft bei', 'source', e.source, 'placeholder="z. B. Autohaus, Online-Shop"')}
      ${field('Preis (€)', 'price', fmtIn(e.price, 2), 'inputmode="decimal"')}
    </div>
    ${field('Notiz (optional)', 'note', e.note)}
  `, (d) => {
    if (!d.name.trim()) return tr('Bitte einen Namen eingeben.');
    const rec = { name: d.name.trim(), number: d.number.trim(), source: d.source.trim(), price: num(d.price), note: d.note.trim() };
    if (entry) Object.assign(entry, rec); else state.parts.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.parts = state.parts.filter((x) => x !== entry); }) });
}

/* ---------- Spritpreis-Verlauf ---------- */

function renderPriceTrend() {
  const fills = state.fuel.filter((x) => x.liters > 0 && gradeOf(fillGrade(x)).fam === mainFam()).sort((a, b) => a.date.localeCompare(b.date)).slice(-24);
  const box = $('#priceTrend');
  if (fills.length < 2) { box.innerHTML = `<p class="empty" style="margin:0">${tr('Ab zwei Tankfüllungen siehst du hier, wie sich dein Literpreis entwickelt.')}</p>`; return; }
  const pts = fills.map((f) => f.total / f.liters), lo = Math.min(...pts), hi = Math.max(...pts), pad = Math.max(0.02, (hi - lo) * 0.15);
  const W = 340, H = 150, L = 6, R = 6, T = 14, B = 22;
  const x = (i) => L + (W - L - R) * i / (pts.length - 1), y = (v) => T + (H - T - B) * (1 - (v - (lo - pad)) / (hi - lo + 2 * pad));
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const iLo = pts.indexOf(lo), iHi = pts.indexOf(hi), avg = pts.reduce((s, v) => s + v, 0) / pts.length;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Spritpreis-Verlauf')}">
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" stroke-dasharray="4 4"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === iLo || i === iHi ? 4 : 2.5}" fill="${i === iLo ? 'var(--good)' : i === iHi ? 'var(--bad)' : 'var(--accent)'}"/>`).join('')}
      <text x="${L}" y="${H - 6}" class="axis">${fmtDate(fills[0].date)}</text>
      <text x="${W - R}" y="${H - 6}" class="axis" text-anchor="end">${fmtDate(fills[fills.length - 1].date)}</text>
    </svg>
    <p class="note" style="margin-bottom:0">${tr('Günstigste {lo}, teuerste {hi}, Durchschnitt {avg} (gestrichelt).', { lo: fmtEUR(lo, 3), hi: fmtEUR(hi, 3), avg: fmtEUR(avg, 3) })}</p>`;
}

function renderExtras8() {
  renderParts();
  renderPriceTrend();
  if (currentView === 'gallery') renderGallery();
  if (currentView === 'calendar') renderCalendar();
}
