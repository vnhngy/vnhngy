'use strict';
// Autobuch – Dokumente, Siri-Links, Verkaufs-Mappe und Kalender-Export.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Dokumente ---------- */

const DOC_TYPES = ['Fahrzeugschein', 'Fahrzeugbrief', 'Führerschein', 'Versicherungskarte', 'Serviceheft', 'TÜV-Bericht', 'Kaufvertrag', 'Sonstiges'];

function docExpiry(doc) {
  if (!doc.expires) return null;
  const days = daysUntil(doc.expires);
  return days < 0 ? { cls: 'over', label: tr('⚠︎ Abgelaufen') } : days <= 60 ? { cls: 'soon', label: tr('⏱ Noch {n} Tage', { n: days }) } : { cls: 'ok', label: tr('✓ Bis {date}', { date: fmtDate(doc.expires) }) };
}

function renderDocs() {
  const docs = [...state.documents].sort((a, b) => DOC_TYPES.indexOf(a.type) - DOC_TYPES.indexOf(b.type));
  $('#docList').innerHTML = docs.map((doc) => {
    const ex = docExpiry(doc);
    return `<li data-edit-doc="${doc.id}" style="cursor:pointer">
      <div class="grow"><div class="title">📄 ${esc(doc.title || tr(doc.type))}</div>
      <div class="meta">${[doc.title ? tr(doc.type) : '', doc.photos?.length ? tr(doc.photos.length > 1 ? '{n} Fotos' : '{n} Foto', { n: doc.photos.length }) : tr('kein Foto'), doc.note].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${ex ? `<span class="pill ${ex.cls}">${ex.label}</span>` : ''}
    </li>`;
  }).join('') || `<li class="empty">${tr('Noch keine Dokumente. Fotografiere z. B. Fahrzeugschein und Versicherungskarte.')}</li>`;
}

function docForm(entry) {
  const e = entry || { type: 'Fahrzeugschein', title: '', expires: '', note: '', photos: [] };
  openSheet(entry ? esc(e.title || tr(e.type)) : 'Dokument hinzufügen', `
    <label class="field"><span>${tr('Art')}</span><select name="type">${DOC_TYPES.map((t) => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${tr(t)}</option>`).join('')}</select></label>
    ${field('Bezeichnung (optional)', 'title', e.title, 'placeholder="z. B. eVB-Nummer, Rechnung Kauf"')}
    ${field('Gültig bis (optional)', 'expires', e.expires, 'type="date"')}
    ${field('Notiz', 'note', e.note, 'placeholder="z. B. Original liegt im Ordner zu Hause"')}
    ${photoField(e.photos, 'Fotos (Vorder- und Rückseite)')}
  `, (d) => {
    const rec = { id: entry?.id || uid(), type: d.type, title: d.title.trim(), expires: d.expires, note: d.note.trim(), photos: commitPhotos() };
    if (!rec.photos.length && !rec.note) return tr('Bitte ein Foto hinzufügen oder eine Notiz eintragen.');
    if (entry) Object.assign(entry, rec); else state.documents.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.documents = state.documents.filter((x) => x !== entry); }) });
  wirePhotos();
}

/* ---------- Siri & Kurzbefehle ---------- */

const ACTION_LINKS = [
  ['fuel', '⛽ Tanken eintragen'],
  ['drive', '🛰 Fahrt aufzeichnen'],
  ['park', '📍 Hier geparkt'],
  ['cost', '€ Ausgabe eintragen'],
  ['trip', '🚗 Fahrt eintragen'],
  ['help', '🚨 Notfall & Hilfe'],
];
const actionUrl = (a) => location.origin + location.pathname + '?action=' + a;

function renderLinks() {
  $('#linkList').innerHTML = ACTION_LINKS.map(([a, label]) => `
    <li><div class="grow"><div class="title">${tr(label)}</div><div class="linkurl">${esc(actionUrl(a))}</div></div>
    <button class="small" data-copy="${a}">${tr('Kopieren')}</button></li>`).join('');
}

// Wird beim Start mit ?action=… geöffnet (z. B. von einem Kurzbefehl)
function handleUrlAction() {
  const q = new URLSearchParams(location.search);
  const a = q.get('action');
  if (!a) return;
  history.replaceState(null, '', location.pathname);
  if (a === 'fuel') { showView('fuel'); fuelForm(null, { liters: num(q.get('l')) ?? '', total: num(q.get('eur')) ?? '', km: num(q.get('km')) ?? '' }); }
  else if (a === 'cost') { showView('costs'); costForm(); }
  else if (a === 'trip') { showView('trips'); tripForm(); }
  else if (a === 'drive') startDrive();
  else if (a === 'park') { showView('start'); setParking(); }
  else if (a === 'help') showView('help');
}

/* ---------- Verkaufs-Mappe ---------- */

function reportForm() {
  openSheet('Verkaufs-Mappe erstellen', `
    <p class="note" style="margin-top:0">${tr('Was soll im Bericht stehen?')}</p>
    <label class="check"><input type="checkbox" name="amounts" checked> ${tr('Rechnungsbeträge zeigen')}</label>
    <label class="check"><input type="checkbox" name="vin" checked> ${tr('Fahrgestellnummer (FIN) zeigen')}</label>
    <label class="check"><input type="checkbox" name="accidents" checked> ${tr('Unfälle aufführen')}</label>
    <label class="check"><input type="checkbox" name="photos" checked> ${tr('Fotos der Rechnungen anhängen')}</label>
    <p class="hint">${tr('Tipp: Bekannte Unfallschäden musst du beim Verkauf ohnehin angeben. Verschweigen kann teuer werden.')}</p>
  `, (d) => {
    const opt = { amounts: d.amounts === 'on', vin: d.vin === 'on', accidents: d.accidents === 'on', photos: d.photos === 'on' };
    setTimeout(() => buildReport(opt), 50);
  }, { submitLabel: 'Erstellen' });
}

async function buildReport(opt) {
  const c = state.car, d = state.docs, km = currentKm();
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const bills = state.costs.filter((x) => ['Werkstatt', 'Reifen'].includes(x.cat)).sort(byDate);
  const billSum = bills.reduce((s2, x) => s2 + x.amount, 0);
  const cons = consumption().avg;

  // km-Verlauf: höchster bekannter km-Stand je Jahr
  const points = [
    ...state.fuel.map((f) => [f.date, f.km]), ...state.costs.filter((x) => x.km != null).map((x) => [x.date, x.km]),
    ...state.trips.map((t) => [t.date, t.endKm]), ...state.maint.filter((m) => m.lastDate && m.lastKm != null).map((m) => [m.lastDate, m.lastKm]),
  ];
  const perYear = {};
  points.forEach(([date, k]) => { const y = date.slice(0, 4); perYear[y] = Math.max(perYear[y] || 0, k); });
  const years = Object.keys(perYear).sort();

  const row = (cells) => `<tr>${cells.map((x) => `<td${x && x.r ? ' class="r"' : ''}>${x && x.r ? x.v : x ?? ''}</td>`).join('')}</tr>`;
  const R = (v) => ({ r: true, v });
  const maintDone = state.maint.filter((m) => m.lastDate || m.lastKm != null);

  let html = `<div class="report">
    <h1>${tr('Fahrzeug-Dokumentation')}</h1>
    <p class="sub">${esc([c.name, c.variant].filter(Boolean).join(' · '))} · ${tr('erstellt am {date}', { date: fmtDate(today()) })}</p>

    <h2>${tr('Fahrzeug')}</h2>
    <table>
      ${row([tr('Modell'), esc(c.name)])}${c.variant ? row([tr('Ausstattung'), esc(c.variant)]) : ''}
      ${c.year ? row([tr('Baujahr'), esc(c.year)]) : ''}${row([tr('Kraftstoff'), esc(tr(c.fuel))])}
      ${d.plate ? row([tr('Kennzeichen'), esc(d.plate)]) : ''}${opt.vin && d.vin ? row([tr('FIN'), esc(d.vin)]) : ''}
      ${km != null ? row([tr('Kilometerstand'), `${fmtNum(km)} km`]) : ''}
      ${cons ? row([tr('Ø Verbrauch'), tr('{cons} l/100 km (aus {n} Tankfüllungen)', { cons: fmtNum(cons, 1), n: state.fuel.length })]) : ''}
    </table>

    <h2>${tr('Wartung &amp; Prüfungen')}</h2>
    ${maintDone.length ? `<table><tr><th>${tr('Leistung')}</th><th>${tr('Zuletzt')}</th><th class="r">km</th><th>${tr('Nächste Fälligkeit')}</th></tr>
      ${maintDone.map((m) => {
        const due = maintStatus(m).due.replace(/<[^>]+>/g, '');
        return row([esc(tr(m.name)) + (m.lastAlt ? ` (${esc(tr(m.lastAlt))})` : ''), m.lastDate ? fmtDate(m.lastDate) : '–', R(m.lastKm != null ? fmtNum(m.lastKm) : '–'), esc(due || '–')]);
      }).join('')}</table>` : `<p>${tr('Keine Einträge.')}</p>`}

    <h2>${tr('Werkstatt- &amp; Reifenrechnungen')}</h2>
    ${bills.length ? `<table><tr><th>${tr('Datum')}</th><th class="r">km</th><th>${tr('Leistung')}</th>${opt.amounts ? `<th class="r">${tr('Betrag')}</th>` : ''}</tr>
      ${bills.map((x) => row([fmtDate(x.date), R(x.km != null ? fmtNum(x.km) : '–'), esc(x.note || tr(x.cat)) + (opt.photos && x.photos?.length ? ' 📎' : ''), ...(opt.amounts ? [R(fmtEUR(x.amount))] : [])])).join('')}
      ${opt.amounts ? row(['', R(''), `<b>${tr('Summe')}</b>`, R(`<b>${fmtEUR(billSum)}</b>`)]) : ''}</table>` : `<p>${tr('Keine Rechnungen erfasst.')}</p>`}

    <h2>${tr('Kilometer-Verlauf')}</h2>
    ${years.length ? `<table><tr><th>${tr('Jahr')}</th><th class="r">${tr('Höchster bekannter km-Stand')}</th></tr>${years.map((y) => row([y, R(fmtNum(perYear[y]) + ' km')])).join('')}</table>` : `<p>${tr('Keine Daten.')}</p>`}

    <h2>${tr('Reifen')}</h2>
    ${state.tires.length ? `<table><tr><th>${tr('Satz')}</th><th>${tr('Marke / Größe')}</th><th>DOT</th><th class="r">${tr('Profil (min.)')}</th><th class="r">km</th></tr>
      ${state.tires.map((t) => {
        const min = t.tread ? Math.min(...POS.map(([k]) => t.tread[k]).filter((v) => v != null)) : null;
        return row([esc(tr(t.name)) + (state.mounted?.id === t.id ? ` (${tr('montiert')})` : ''), esc([t.brand, t.size].filter(Boolean).join(', ') || '–'), esc(t.dot || '–'),
          R(min != null ? `${fmtNum(min, 1)} mm` : '–'), R(fmtNum(tireKm(t)))]);
      }).join('')}</table>` : `<p>${tr('Keine Reifen erfasst.')}</p>`}`;

  if (opt.accidents) {
    const acc = [...state.accidents].sort(byDate);
    html += `<h2>${tr('Unfälle')}</h2>${acc.length ? `<table><tr><th>${tr('Datum')}</th><th>${tr('Ort')}</th><th>${tr('Hergang')}</th></tr>
      ${acc.map((a) => row([fmtDate(a.date.slice(0, 10)), esc(a.place || '–'), esc(a.notes || '–')])).join('')}</table>` : `<p>${tr('Keine Unfälle erfasst.')}</p>`}`;
  }

  if (opt.photos) {
    const withPhotos = bills.filter((x) => x.photos?.length);
    if (withPhotos.length) {
      html += `<h2>${tr('Belege')}</h2>`;
      for (const x of withPhotos) {
        for (const id of x.photos) {
          const blob = await photoGet(id).catch(() => null);
          if (blob) html += `<div class="receipt"><b>${fmtDate(x.date)}: ${esc(x.note || tr(x.cat))}</b><img src="${URL.createObjectURL(blob)}" alt="${tr('Beleg')}"></div>`;
        }
      }
    }
  }
  html += `<p class="fine">${tr('Die Angaben wurden vom Halter selbst erfasst (Autobuch).')}</p></div>`;

  $('#reportBody').innerHTML = html;
  $('#reportBack').dataset.view = 'more';
  showView('report');
  await Promise.all([...document.querySelectorAll('#reportBody img')].map((img) => img.decode().catch(() => {})));
}

/* ---------- Kalender ---------- */

function calendarFile() {
  const ymd = (s) => s.replace(/-/g, '');
  const icsText = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Autobuch//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let count = 0;
  state.maint.forEach((m) => {
    const st = maintStatus(m);
    if (!st.calDate) return;
    const date = st.calDate < today() ? today() : st.calDate;
    const title = `${state.car.name || tr('Auto')}: ${tr(m.name)}${st.next ? ` (${st.next})` : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}-${ymd(m.lastDate || String(m.lastKm))}@autobuch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(1, date))}`,
      `SUMMARY:${icsText(title)}`,
      `DESCRIPTION:${icsText(plain(st.text) + ' (Autobuch)')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:-P7D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT'
    );
    count++;
  });
  state.fines.filter((f) => !f.paid && f.due).forEach((f) => {
    const title = tr('Zahlen bis heute: {type} ({eur})', { type: tr(f.type), eur: fmtEUR(f.amount || 0) });
    lines.push('BEGIN:VEVENT', `UID:fine-${f.id}@autobuch`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(f.due)}`, `DTEND;VALUE=DATE:${ymd(addDays(1, f.due))}`,
      `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText([f.authority, f.ref].filter(Boolean).join(' · ') + ' (Autobuch)')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:-P3D', 'END:VALARM', 'END:VEVENT');
    count++;
  });
  state.documents.filter((d) => d.expires && d.expires >= today()).forEach((d) => {
    const title = tr('{doc} läuft ab', { doc: d.title || tr(d.type) });
    lines.push('BEGIN:VEVENT', `UID:doc-${d.id}-${ymd(d.expires)}@autobuch`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d.expires)}`, `DTEND;VALUE=DATE:${ymd(addDays(1, d.expires))}`,
      `SUMMARY:${icsText(title)}`, 'DESCRIPTION:Autobuch', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:-P30D', 'END:VALARM', 'END:VEVENT');
    count++;
  });
  lines.push('END:VCALENDAR');
  return count ? lines.join('\r\n') + '\r\n' : null;
}

function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function applyTheme() {
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}
