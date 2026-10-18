'use strict';
// Autobuch – Versicherte Jahresfahrleistung, Haltbarkeit im Auto, Pannen-Ratgeber, Fahrgewohnheiten,
// Reparatur-Rechner. (Werkstatt-Bewertung steckt bei den Werkstätten und im Ausgaben-Formular.)
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- km-Stand zu einem Datum schätzen ---------- */

// Aus den bekannten km-Ständen (Tanken, Fahrten, Wartung …) linear zwischen zwei Punkten rechnen
function kmAtDate(date) {
  const pts = kmPoints().sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  if (!pts.length) return null;
  const before = pts.filter(([d]) => d <= date).pop(), after = pts.find(([d]) => d > date);
  if (before && after) {
    const span = daysUntil(after[0]) - daysUntil(before[0]);
    return span > 0 ? Math.round(before[1] + (after[1] - before[1]) * (daysUntil(date) - daysUntil(before[0])) / span) : before[1];
  }
  return (before || after)[1];
}

/* ---------- Versicherte Jahresfahrleistung ---------- */

function insKmStatus() {
  const s = state.insKm;
  if (!s || !s.limit || !s.start) return null;
  // Beginn des laufenden Versicherungsjahres (z. B. jedes Jahr am 1. Januar)
  const y = new Date().getFullYear();
  let start = `${y}${s.start.slice(4)}`;
  if (start > today()) start = `${y - 1}${s.start.slice(4)}`;
  const end = addMonths(start, 12);
  const k0 = kmAtDate(start), now = currentKm();
  if (k0 == null || now == null) return { start, end, driven: null };
  const elapsed = Math.max(1, -daysUntil(start)), total = daysUntil(end) - daysUntil(start);
  const driven = Math.max(0, now - k0);
  const projected = elapsed >= 30 ? driven / elapsed * total : null;
  return { start, end, k0, driven, projected, limit: s.limit, over: projected != null ? projected - s.limit : null, left: daysUntil(end) };
}

function renderInsKm() {
  const st = insKmStatus();
  if (!st) {
    $('#insKmBody').innerHTML = `<p class="note" style="margin-top:0">${tr('Im Versicherungsvertrag steht eine jährliche Fahrleistung, z. B. 12.000 km. Fährst du mehr und meldest es nicht, kann die Versicherung nachfordern. Die App behält das im Blick.')}</p>
      <button data-open="insKm" style="width:100%">${tr('Fahrleistung eintragen')}</button>`;
    return;
  }
  const share = st.driven != null ? st.driven / st.limit : 0;
  const cls = st.over == null ? 'good' : st.over > 0 ? 'bad' : st.projected > st.limit * 0.9 ? 'warn' : 'good';
  $('#insKmBody').innerHTML = `
    <div class="maint-head"><span class="title">${tr('Seit {date}', { date: fmtDate(st.start) })}</span><span class="amount" style="font-weight:700">${st.driven != null ? fmtNum(st.driven) : '–'} / ${fmtNum(st.limit)} km</span></div>
    <div class="progress"><i style="width:${Math.min(share, 1) * 100}%;background:var(--${cls})"></i></div>
    <div class="meta">${st.projected != null ? tr('Hochrechnung bis {date}: ca. {km} km', { date: fmtDate(st.end), km: fmtNum(st.projected) }) : tr('Eine Hochrechnung gibt es nach den ersten 30 Tagen und mit aktuellem Kilometerstand.')}</div>
    ${st.over > 0 ? `<p class="note bad-text">${tr('⚠︎ Du fährst voraussichtlich ca. {km} km mehr als versichert. Melde die höhere Fahrleistung deiner Versicherung, das ist meist günstiger als eine Nachforderung.', { km: fmtNum(st.over) })}</p>` : ''}
    <button class="link" data-open="insKm" style="width:100%;margin-top:6px">${tr('Bearbeiten')}</button>`;
}

function insKmNotice() {
  const st = insKmStatus();
  if (!st || !(st.over > 500)) return '';
  return `<div class="card notice"><span class="ico">🛡</span><div class="grow">
    <div class="title">${tr('Mehr km als versichert')}</div>
    <div class="meta">${tr('Voraussichtlich ca. {km} km über der vereinbarten Fahrleistung.', { km: fmtNum(st.over) })}</div>
    <div class="maint-btns"><button class="small primary" data-view="costs">${tr('Ansehen')}</button></div></div></div>`;
}

function insKmForm() {
  const s = state.insKm || { start: `${new Date().getFullYear()}-01-01`, limit: 12000 };
  openSheet('Versicherte Fahrleistung', `
    ${field('Vereinbarte km pro Jahr', 'limit', s.limit, 'inputmode="numeric" required placeholder="z. B. 12000"')}
    ${field('Versicherungsjahr beginnt am', 'start', s.start, 'type="date" required')}
    <p class="hint">${tr('Meist der 1. Januar. Den km-Stand zu Beginn schätzt die App aus deinen Einträgen.')}</p>
  `, (d) => {
    const limit = num(d.limit);
    if (!limit) return tr('Bitte einen Betrag über 0 eingeben.');
    state.insKm = { limit, start: d.start };
  }, { deleteFn: state.insKm && (() => { state.insKm = null; }) });
}

/* ---------- Haltbarkeit im Auto ---------- */

const SUPPLY_PRESETS = [
  ['Verbandkasten', 'Das Datum steht auf der Packung. Seit 2022 gehören auch zwei Mund-Nasen-Masken hinein.'],
  ['Reifen-Dichtmittel (Pannenset)', 'Hält meist etwa 4 Jahre. Das Ablaufdatum steht auf der Flasche.'],
  ['Feuerlöscher', 'Alle 2 Jahre prüfen lassen.'],
  ['Kindersitz', 'Hersteller empfehlen oft, Sitze nach 6–10 Jahren zu ersetzen.'],
  ['Sonstiges', ''],
];

function supplyStatus(x) {
  if (!x.expires) return { cls: 'unknown', label: tr('Kein Datum') };
  const days = daysUntil(x.expires + (x.expires.length === 7 ? '-28' : ''));
  return days < 0 ? { cls: 'over', label: tr('⚠︎ Abgelaufen') } : days <= 60 ? { cls: 'soon', label: tr('⏱ Noch {n} Tage', { n: days }) } : { cls: 'ok', label: tr('✓ Bis {date}', { date: fmtMonth(x.expires + '-15') }) };
}

function renderSupplies() {
  $('#supplyList').innerHTML = [...state.supplies].sort((a, b) => (a.expires || '9').localeCompare(b.expires || '9')).map((x) => {
    const st = supplyStatus(x);
    return `<li data-edit-supply="${x.id}" style="cursor:pointer"><div class="grow"><div class="title">${esc(tr(x.name))}</div>${x.note ? `<div class="meta">${esc(x.note)}</div>` : ''}</div><span class="pill ${st.cls}">${st.label}</span></li>`;
  }).join('') || `<li class="empty">${tr('Verbandkasten und Reifen-Dichtmittel laufen ab. Trag das Datum ein, dann erinnert dich die App.')}</li>`;
}

function supplyForm(entry) {
  const e = entry || { name: SUPPLY_PRESETS[0][0], expires: '', note: '' };
  openSheet(entry ? 'Eintrag bearbeiten' : 'Haltbarkeit eintragen', `
    <label class="field"><span>${tr('Was')}</span><select name="name">${SUPPLY_PRESETS.map(([n]) => `<option value="${n}" ${n === e.name ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select></label>
    <p class="hint" id="supplyHint"></p>
    ${field('Haltbar bis (Monat)', 'expires', e.expires, 'type="month" required')}
    ${field('Notiz (optional)', 'note', e.note, 'placeholder="z. B. im Kofferraum unter dem Boden"')}
  `, (d) => {
    const rec = { name: d.name, expires: d.expires, note: d.note.trim() };
    if (entry) Object.assign(entry, rec); else state.supplies.push({ id: uid(), ...rec });
  }, { deleteFn: entry && (() => { state.supplies = state.supplies.filter((x) => x !== entry); }) });
  const hint = () => { $('#supplyHint').textContent = tr((SUPPLY_PRESETS.find(([n]) => n === sheetForm.name.value) || [])[1] || ''); };
  sheetForm.name.addEventListener('change', hint);
  hint();
}

function supplyNotice() {
  const due = state.supplies.filter((x) => x.expires && supplyStatus(x).cls !== 'ok' && supplyStatus(x).cls !== 'unknown');
  if (!due.length) return '';
  return `<div class="card notice"><span class="ico">🧳</span><div class="grow">
    <div class="title">${tr('Haltbarkeit läuft ab')}</div>
    <div class="meta">${due.map((x) => `${esc(tr(x.name))}: ${supplyStatus(x).label}`).join('<br>')}</div>
    <div class="maint-btns"><button class="small primary" data-view="specs">${tr('Ansehen')}</button></div></div></div>`;
}

/* ---------- Pannen-Ratgeber ---------- */

const BREAKDOWN_GUIDES = [
  ['🔋', 'Starthilfe geben lassen', [
    'Beide Autos aus, Handbremse an. Beide Batterien müssen 12 Volt haben.',
    'Rotes Kabel: zuerst an Plus (+) der leeren Batterie, dann an Plus der vollen Batterie.',
    'Schwarzes Kabel: an Minus (−) der vollen Batterie, dann an ein blankes Metallteil im Motorraum deines Autos, nicht an die leere Batterie.',
    'Viele Autos haben dafür eigene Starthilfe-Punkte im Motorraum. Die Betriebsanleitung zeigt, wo.',
    'Erst das Spenderauto starten, ein paar Minuten laufen lassen, dann dein Auto starten.',
    'Abklemmen in umgekehrter Reihenfolge: zuerst Schwarz, dann Rot.',
  ]],
  ['🛞', 'Reifenpanne mit Pannenset', [
    'Warnblinker an, sicher abstellen, Warnweste anziehen, Warndreieck aufstellen.',
    'Fremdkörper (z. B. Nagel) im Reifen lassen.',
    'Dichtmittel nach Anleitung ins Ventil füllen und mit dem Kompressor auf den Solldruck pumpen.',
    'Sofort etwa 3 km langsam fahren, damit sich das Mittel verteilt, dann den Druck nochmal prüfen.',
    'Höchstens 80 km/h und direkt zur Werkstatt. Hält der Druck nicht: Pannenhilfe rufen.',
  ]],
  ['🛣', 'Liegenbleiben auf der Autobahn', [
    'Warnblinker an und so weit rechts wie möglich auf den Seitenstreifen rollen.',
    'Warnweste noch im Auto anziehen, auf der Beifahrerseite aussteigen.',
    'Alle Mitfahrer hinter die Leitplanke, nicht im Auto bleiben.',
    'Warndreieck 150 bis 400 m vor dem Auto aufstellen, am Fahrbahnrand gehen.',
    'Pannenhilfe oder Notruf anrufen. Die Pfeile an den Leitpfosten zeigen zur nächsten Notrufsäule.',
  ]],
  ['🌡', 'Motor wird zu heiß', [
    'Sobald die Temperaturwarnung kommt: sicher anhalten und den Motor ausschalten.',
    'Motorhaube öffnen, aber den Kühlmittelbehälter nie heiß aufdrehen (Verbrühungsgefahr).',
    'Mindestens 30 Minuten abkühlen lassen, dann den Kühlmittelstand prüfen und nur passendes Kühlmittel oder notfalls Wasser nachfüllen.',
    'Passiert das öfter oder verliert das Auto Kühlmittel: in die Werkstatt.',
  ]],
  ['🚗', 'Abschleppen', [
    'Am besten die Pannenhilfe rufen. Selbst abschleppen nur über kurze Strecken.',
    'Die Abschleppöse liegt meist beim Bordwerkzeug und wird vorne eingeschraubt.',
    'Abschleppseil höchstens 5 m lang, bei beiden Autos Warnblinker an.',
    'Im geschleppten Auto die Zündung an lassen, damit Lenkung und Licht funktionieren. Bremsen geht ohne Motor deutlich schwerer.',
    'Bei Automatikgetriebe nur nach Betriebsanleitung abschleppen, sonst kann das Getriebe Schaden nehmen.',
  ]],
];

function renderGuides() {
  $('#guideList').innerHTML = BREAKDOWN_GUIDES.map(([icon, title, steps]) => `
    <details class="light"><summary>${icon} ${tr(title)}</summary>
      <ol class="steps">${steps.map((s) => `<li>${tr(s)}</li>`).join('')}</ol></details>`).join('');
}

/* ---------- Fahrgewohnheiten ---------- */

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function renderHabits() {
  const byDay = Array(7).fill(0), byHour = Array(24).fill(0);
  const wd = (date) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  state.trips.forEach((t) => { byDay[wd(t.date)] += t.endKm - t.startKm; });
  // GPS-Fahrten, die schon im Fahrtenbuch stehen, nicht doppelt zählen
  state.drives.filter((d) => !d.tripId).forEach((d) => { byDay[wd(new Date(d.start).toISOString().slice(0, 10))] += d.km; });
  state.drives.forEach((d) => { byHour[new Date(d.start).getHours()] += d.km; });
  const total = byDay.reduce((s, v) => s + v, 0);
  $('#habitsCard').hidden = !total;
  if (!total) return;
  barChart($('#habitDays'), byDay.map((v, i) => ({ label: tr(WEEKDAYS[i]), full: tr(WEEKDAYS[i]), value: Math.round(v) })), {
    aria: tr('Kilometer nach Wochentag'), tip: (v) => `${fmtNum(v)} km`, axis: (g) => `${fmtNum(g)}`, empty: '',
  });
  const top = byDay.indexOf(Math.max(...byDay));
  const hours = byHour.some((v) => v) ? byHour.map((v, h) => [h, v]).filter(([, v]) => v).sort((a, b) => b[1] - a[1])[0][0] : null;
  $('#habitText').textContent = tr('Am meisten fährst du am {day}', { day: tr(WEEKDAYS[top]) })
    + (hours != null ? ', ' + tr('meist gegen {h} Uhr', { h: hours }) : '') + '. '
    + tr('Wochenende: {p} % der Kilometer.', { p: fmtNum((byDay[5] + byDay[6]) / total * 100, 0) });
}

/* ---------- Lohnt sich die Reparatur? ---------- */

function repairForm() {
  const vals = [...state.values].sort((a, b) => b.date.localeCompare(a.date));
  openSheet('Lohnt sich die Reparatur?', `
    ${field('Reparaturkosten laut Angebot (€)', 'cost', '', 'inputmode="decimal" required placeholder="z. B. 1800"')}
    ${field('Aktueller Wert des Autos (€)', 'value', vals[0] ? fmtIn(vals[0].value, 0) : '', 'inputmode="decimal" required placeholder="z. B. 9000"')}
    <div id="repairOut"></div>
  `, () => {}, { submitLabel: 'Fertig' });
  const calc = () => {
    const cost = num(sheetForm.cost.value), value = num(sheetForm.value.value);
    if (!cost || !value) { $('#repairOut').innerHTML = ''; return; }
    const r = cost / value;
    const [cls, text] = r < 0.3 ? ['ok', 'Reparieren lohnt sich meistens. Die Kosten sind im Verhältnis zum Wert gering.']
      : r < 0.7 ? ['soon', 'Abwägen: Hol ein zweites Angebot ein und überleg, wie lange du das Auto noch fahren willst.']
      : ['over', 'Eher nicht: Die Reparatur kostet fast so viel wie das Auto wert ist. Ein Ersatz kann sinnvoller sein.'];
    $('#repairOut').innerHTML = `<div class="bignum" style="text-align:center">${fmtNum(r * 100, 0)} %</div>
      <p style="text-align:center;margin:0 0 8px"><span class="pill ${cls}">${tr('der Fahrzeugwert')}</span></p>
      <p class="note">${tr(text)} ${tr('Eine Reparatur erhöht den Wert meist kaum, sie erhält ihn nur.')}</p>`;
  };
  sheetForm.cost.addEventListener('input', calc);
  sheetForm.value.addEventListener('input', calc);
}

function renderExtras6() {
  renderInsKm();
  renderSupplies();
  renderHabits();
}
