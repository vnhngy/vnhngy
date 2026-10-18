'use strict';
// Autobuch – Monatsbudget, Notizbuch, Termine-Zeitstrahl, Jahresbericht.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Monatsbudget ---------- */

const monthKey = (d = today()) => d.slice(0, 7);
const monthSpent = (m = monthKey()) => allExpenses().filter((e) => e.date && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);

function budgetState() {
  const limit = state.budget?.monthly;
  if (!limit) return null;
  const spent = monthSpent(), share = spent / limit;
  return { limit, spent, share, cls: share >= 1 ? 'bad' : share >= 0.9 ? 'warn' : 'good' };
}

function renderBudget() {
  const b = budgetState();
  const month = fmtMonth(today());
  $('#budgetCard').innerHTML = b ? `
    <div class="maint-head"><span class="title">${tr('Budget {month}', { month })}</span><span class="amount" style="font-weight:700">${fmtEUR(b.spent, 0)} / ${fmtEUR(b.limit, 0)}</span></div>
    <div class="progress" role="progressbar" aria-label="${tr('Monatsbudget')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(b.share, 1) * 100)}"><i style="width:${Math.min(b.share, 1) * 100}%;background:var(--${b.cls})"></i></div>
    <div class="meta">${b.share >= 1 ? tr('⚠︎ Budget um {eur} überschritten', { eur: fmtEUR(b.spent - b.limit, 0) }) : tr('Noch {eur} übrig', { eur: fmtEUR(b.limit - b.spent, 0) })}</div>
    <div class="maint-btns"><button class="small" data-open="budget">${tr('Budget ändern')}</button></div>`
    : `<div class="title">${tr('🎯 Monatsbudget')}</div>
    <p class="meta" style="margin:4px 0 0">${tr('Leg fest, wie viel das Auto im Monat kosten darf. Die App warnt dich ab 90 %.')}</p>
    <div class="maint-btns"><button class="small primary" data-open="budget">${tr('Budget festlegen')}</button></div>`;
}

// Hinweis für die Übersicht (wird von renderNotices eingebaut)
function budgetNotice() {
  const b = budgetState();
  if (!b || b.share < 0.9) return '';
  return `<div class="card notice"><span class="ico">🎯</span><div class="grow">
    <div class="title">${b.share >= 1 ? tr('Monatsbudget überschritten') : tr('Monatsbudget fast aufgebraucht')}</div>
    <div class="meta">${tr('{spent} von {limit} ausgegeben ({pct} %)', { spent: fmtEUR(b.spent, 0), limit: fmtEUR(b.limit, 0), pct: fmtNum(b.share * 100, 0) })}</div>
    <div class="maint-btns"><button class="small primary" data-view="costs">${tr('Ansehen')}</button></div></div></div>`;
}

function budgetForm() {
  openSheet('Monatsbudget', `
    ${field('Budget pro Monat (€)', 'monthly', fmtIn(state.budget?.monthly, 0), 'inputmode="decimal" placeholder="z. B. 350"')}
    <p class="hint">${tr('Gezählt wird alles: Tanken, Werkstatt, Versicherung, Steuer und andere Ausgaben. Feld leer lassen, um das Budget zu entfernen.')}</p>
  `, (d) => {
    const v = num(d.monthly);
    if (v != null && v <= 0) return tr('Bitte einen Betrag über 0 eingeben.');
    state.budget = { monthly: v };
  });
}

/* ---------- Notizbuch ---------- */

function renderNotes() {
  const list = [...state.notes].sort((a, b) => b.date.localeCompare(a.date));
  $('#noteList').innerHTML = list.map((n) => `
    <li data-edit-note="${n.id}">
      <div class="grow"><div class="title">${esc(n.title || tr('Notiz'))}</div>
      <div class="meta">${fmtDate(n.date)}${n.photos?.length ? ' · 📎 ' + n.photos.length : ''}</div>
      ${n.text ? `<div class="meta note-text">${esc(n.text)}</div>` : ''}</div>
    </li>`).join('') || `<li class="empty">${tr('Noch keine Notizen. Zum Beispiel: Reifengröße, Ölsorte, Code fürs Radio oder wo der Zweitschlüssel liegt.')}</li>`;
}

function noteForm(entry) {
  const e = entry || { date: today(), title: '', text: '', photos: [] };
  openSheet(entry ? 'Notiz bearbeiten' : 'Neue Notiz', `
    ${field('Titel', 'title', e.title, 'required placeholder="z. B. Ölsorte"')}
    ${field('Datum', 'date', e.date, 'type="date" required')}
    <label class="field"><span>${tr('Text')}</span><textarea name="text" rows="6" placeholder="${esc(tr('z. B. 5W-30, MB 229.5 – 5,8 Liter'))}">${esc(e.text)}</textarea></label>
    ${photoField(e.photos, 'Fotos (optional)')}
  `, (d) => {
    if (!d.title.trim() && !d.text.trim()) return tr('Bitte einen Titel oder Text eingeben.');
    const rec = { id: entry?.id || uid(), date: d.date, title: d.title.trim(), text: d.text.trim(), photos: commitPhotos() };
    if (entry) Object.assign(entry, rec); else state.notes.push(rec);
  }, { deleteFn: entry && (() => { (entry.photos || []).forEach(photoDel); state.notes = state.notes.filter((x) => x !== entry); }) });
  wirePhotos();
}

/* ---------- Termine-Zeitstrahl ---------- */

// Alle anstehenden Termine der nächsten 12 Monate, Überfälliges zuerst
function agendaItems() {
  const until = addMonths(today(), 12), out = [];
  const add = (date, icon, title, meta, view, open) => { if (date && date <= until) out.push({ date, icon, title, meta, view, open }); };
  state.maint.forEach((m) => {
    const st = maintStatus(m);
    add(st.calDate, '🔧', tr(m.name), st.next || '', 'maint', () => { showView('maint'); showSub('termine'); });
  });
  state.fines.filter((f) => !f.paid && f.due).forEach((f) => add(f.due, '🧾', tr('Strafzettel zahlen'), `${tr(f.type)} · ${fmtEUR(f.amount || 0)}`, 'fines'));
  state.documents.filter((d) => d.expires).forEach((d) => add(d.expires, '📄', tr('{doc} läuft ab', { doc: d.title || tr(d.type) }), '', 'help'));
  // häufige Zahlungen nur für die nächsten 2 Monate, sonst wird die Liste unübersichtlich
  state.recurring.forEach((r) => {
    const limit = r.interval === 'yearly' ? until : addMonths(today(), 2);
    for (let n = r.booked || 0; n < (r.booked || 0) + 12; n++) {
      const d = recDate(r, n);
      if (d > limit || (r.end && d > r.end)) break;
      add(d, '🔁', r.name, fmtEUR(r.amount), 'costs');
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function renderAgenda() {
  const items = agendaItems();
  let month = '';
  $('#agendaList').innerHTML = items.map((x, i) => {
    const days = daysUntil(x.date);
    const over = days < 0;
    const head = over ? tr('Überfällig') : fmtMonth(x.date);
    const sep = head !== month ? `<li class="agenda-month">${esc(head)}</li>` : '';
    month = head;
    const when = over ? tr('seit {n} Tagen', { n: -days }) : days === 0 ? tr('heute') : tr('in {n} Tagen', { n: days });
    return `${sep}<li data-agenda="${i}">
      <span class="agenda-date${over ? ' bad-text' : days <= 14 ? ' warn-text' : ''}"><b>${new Date(x.date + 'T12:00:00').getDate()}.</b></span>
      <div class="grow"><div class="title">${x.icon} ${esc(x.title)}</div><div class="meta">${[fmtDate(x.date), when, x.meta].filter(Boolean).map(esc).join(' · ')}</div></div>
    </li>`;
  }).join('') || `<li class="empty">${tr('Keine Termine in den nächsten 12 Monaten. Trag bei der Wartung ein, wann zuletzt etwas gemacht wurde.')}</li>`;
  renderAgenda.items = items;
}

/* ---------- Jahresbericht ---------- */

async function buildYearReport(y) {
  const c = state.car, inY = (d) => d && d.startsWith(y);
  const exp = allExpenses().filter((e) => inY(e.date));
  const { segs } = consumption();
  const f = yearFigures(y, allExpenses(), kmPoints(), segs);
  const fuel = state.fuel.filter((x) => inY(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const costs = state.costs.filter((x) => inY(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const trips = state.trips.filter((x) => inY(x.date));
  const row = (cells) => `<tr>${cells.map((x) => `<td${x && x.r ? ' class="r"' : ''}>${x && x.r ? x.v : x ?? ''}</td>`).join('')}</tr>`;
  const R = (v) => ({ r: true, v });

  const byCat = {};
  exp.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amount; });
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = `${y}-${String(i + 1).padStart(2, '0')}`;
    const list = exp.filter((e) => e.date.startsWith(m));
    return { m, sum: list.reduce((s, e) => s + e.amount, 0), fuel: list.filter((e) => e.cat === 'Kraftstoff').reduce((s, e) => s + e.amount, 0) };
  });
  const tripKm = {};
  trips.forEach((t) => { tripKm[t.type] = (tripKm[t.type] || 0) + (t.endKm - t.startKm); });
  const liters = fuel.reduce((s, x) => s + x.liters, 0);

  let html = `<div class="report">
    <h1>${tr('Jahresbericht {year}', { year: y })}</h1>
    <p class="sub">${esc([c.name, c.variant, state.docs.plate].filter(Boolean).join(' · '))} · ${tr('erstellt am {date}', { date: fmtDate(today()) })}</p>

    <h2>${tr('Zusammenfassung')}</h2>
    <table>
      ${row([tr('Gefahren'), R(f.driven ? fmtNum(f.driven) + ' km' : '–')])}
      ${row([tr('Gesamtkosten'), R(fmtEUR(f.cost))])}
      ${row([tr('davon Kraftstoff'), R(fmtEUR(f.fuel))])}
      ${row([tr('Ø pro Monat'), R(fmtEUR(f.cost / (y === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : 12)))])}
      ${f.driven ? row([tr('Kosten pro km'), R(fmtNum(f.cost / f.driven * 100, 0) + ' ct')]) : ''}
      ${f.cons ? row([tr('Ø Verbrauch'), R(fmtNum(f.cons, 1) + ' ' + consUnit() + ' km')]) : ''}
      ${row([tr('Tankfüllungen'), R(fuel.length ? tr('{n} ({l} l)', { n: fuel.length, l: fmtNum(liters, 1) }) : '0')])}
    </table>

    <h2>${tr('Kosten nach Kategorie')}</h2>
    ${Object.keys(byCat).length ? `<table>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => row([esc(tr(cat)), R(fmtNum(v / f.cost * 100, 0) + ' %'), R(fmtEUR(v))])).join('')}</table>` : `<p>${tr('Keine Ausgaben.')}</p>`}

    <h2>${tr('Kosten pro Monat')}</h2>
    <table><tr><th>${tr('Monat')}</th><th class="r">${tr('Kraftstoff')}</th><th class="r">${tr('Gesamt')}</th></tr>
      ${months.map((m) => row([fmtMonth(m.m + '-15'), R(m.fuel ? fmtEUR(m.fuel) : '–'), R(m.sum ? fmtEUR(m.sum) : '–')])).join('')}
      ${row([`<b>${tr('Summe')}</b>`, R(`<b>${fmtEUR(f.fuel)}</b>`), R(`<b>${fmtEUR(f.cost)}</b>`)])}</table>`;

  if (trips.length) {
    const biz = tripKm['Geschäftlich'] || 0;
    html += `<h2>${tr('Fahrtenbuch')}</h2><table>
      ${TRIP_TYPES.filter((k) => tripKm[k]).map((k) => row([tr(TRIP_LABEL[k]), R(fmtNum(tripKm[k]) + ' km')])).join('')}
      ${row([tr('Fahrten'), R(String(trips.length))])}
      ${biz ? row([tr('Pauschale Geschäftsfahrten ({rate} €/km)', { rate: fmtNum(BIZ_RATE, 2) }), R(fmtEUR(biz * BIZ_RATE))]) : ''}</table>`;
  }

  html += `<h2>${tr('Tankfüllungen')}</h2>
    ${fuel.length ? `<table><tr><th>${tr('Datum')}</th><th class="r">km</th><th class="r">${tr('Menge')}</th><th class="r">${tr('Preis')}</th><th class="r">${tr('Betrag')}</th></tr>
      ${fuel.map((x) => row([fmtDate(x.date), R(fmtNum(x.km)), R(fmtNum(x.liters, 2) + ' ' + unitOf(fillGrade(x))), R(fmtEUR(x.total / x.liters, 3)), R(fmtEUR(x.total))])).join('')}</table>` : `<p>${tr('Keine Einträge.')}</p>`}

    <h2>${tr('Ausgaben')}</h2>
    ${costs.length ? `<table><tr><th>${tr('Datum')}</th><th>${tr('Kategorie')}</th><th>${tr('Notiz')}</th><th class="r">${tr('Betrag')}</th></tr>
      ${costs.map((x) => row([fmtDate(x.date), esc(tr(x.cat)), esc(x.note || ''), R(fmtEUR(x.amount))])).join('')}</table>` : `<p>${tr('Keine Ausgaben.')}</p>`}
    <p class="fine">${tr('Die Angaben wurden vom Halter selbst erfasst (Autobuch).')}</p></div>`;

  $('#reportBody').innerHTML = html;
  $('#reportBack').dataset.view = 'stats';
  showView('report');
}
