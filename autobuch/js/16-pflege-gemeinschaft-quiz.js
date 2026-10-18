'use strict';
// Autobuch – Pflege-Plan, Fahrgemeinschaft, Zuladungs-Rechner, Warnleuchten-Quiz, Tanken per Sprache, Garantien.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Pflege-Plan ---------- */

// [id, Name, empfohlener Abstand in Tagen]
const CARE_ITEMS = [
  ['wash', 'Außenwäsche', 30], ['interior', 'Innenraum saugen & wischen', 60], ['wax', 'Wachs / Versiegelung', 120],
  ['wipers', 'Wischerblätter wechseln', 365], ['ac', 'Klimaanlage reinigen', 365], ['windows', 'Scheiben innen putzen', 45],
];

function careStatus(id, every) {
  const last = state.care?.[id];
  if (!last) return { cls: 'unknown', label: tr('Noch nie eingetragen'), days: null };
  const since = -daysUntil(last);
  return { since, cls: since > every ? 'over' : since > every * 0.8 ? 'soon' : 'ok',
    label: since === 0 ? tr('Heute') : tr('vor {n} Tagen', { n: since }) };
}

function renderCare() {
  $('#careList').innerHTML = CARE_ITEMS.map(([id, name, every]) => {
    const st = careStatus(id, every);
    return `<li><div class="grow" data-care-edit="${id}" style="cursor:pointer"><div class="title">${tr(name)}</div>
      <div class="meta">${tr('alle {n} Tage', { n: every })}${state.care?.[id] ? ' · ' + fmtDate(state.care[id]) : ''}</div></div>
      <span class="pill ${st.cls}">${st.label}</span>
      <button class="small" data-care="${id}" aria-label="${tr('Heute erledigt')}: ${tr(name)}">✓</button></li>`;
  }).join('');
  const due = CARE_ITEMS.filter(([id, , every]) => careStatus(id, every).cls === 'over').length;
  $('#careSummary').textContent = due ? tr(due === 1 ? '1 Punkt ist überfällig.' : '{n} Punkte sind überfällig.', { n: due }) : tr('Alles gepflegt.');
}

function careForm(id) {
  const [, name] = CARE_ITEMS.find(([x]) => x === id);
  openSheet(name, `
    ${field('Erledigt am', 'date', state.care?.[id] || today(), 'type="date" required')}
    ${field('Kosten (€, optional)', 'cost', '', 'inputmode="decimal" placeholder="wird bei den Kosten eingetragen"')}
  `, (d) => {
    state.care = { ...state.care, [id]: d.date };
    const cost = num(d.cost);
    if (cost) state.costs.push({ id: uid(), date: d.date, cat: 'Pflege', amount: cost, note: tr(name), km: null, photos: [] });
  });
}

/* ---------- Fahrgemeinschaft ---------- */

let poolMonth = today().slice(0, 7);

// Satz pro km: eigener Wert, sonst Spritkosten pro km, sonst 0,30 €
const poolRate = () => state.pool.rate ?? costPerKm().fuel ?? BIZ_RATE;

function poolStatement(month) {
  const per = Object.fromEntries(state.pool.people.map((p) => [p, { trips: 0, km: 0, owed: 0 }]));
  state.trips.filter((t) => t.date.startsWith(month) && t.riders?.length).forEach((t) => {
    const dist = t.endKm - t.startKm, share = dist * poolRate() / (t.riders.length + 1);
    t.riders.forEach((r) => { if (per[r]) { per[r].trips++; per[r].km += dist; per[r].owed += share; } });
  });
  return per;
}

function renderPool() {
  const people = state.pool.people;
  const months = [...new Set([today().slice(0, 7), ...state.trips.filter((t) => t.riders?.length).map((t) => t.date.slice(0, 7))])].sort().reverse();
  if (!months.includes(poolMonth)) poolMonth = months[0];
  if (!people.length) {
    $('#poolBody').innerHTML = `<p class="note" style="margin-top:0">${tr('Fährst du regelmäßig Kollegen oder Freunde mit? Leg sie hier an, hak sie bei jeder Fahrt an, und die App rechnet am Monatsende aus, wer wie viel zahlt.')}</p>
      <button data-open="pool" style="width:100%">${tr('Mitfahrer anlegen')}</button>`;
    return;
  }
  const st = poolStatement(poolMonth);
  $('#poolBody').innerHTML = `
    <label class="field"><span>${tr('Monat')}</span><select id="poolMonth">${months.map((m) => `<option value="${m}" ${m === poolMonth ? 'selected' : ''}>${fmtMonth(m + '-15')}</option>`).join('')}</select></label>
    <ul class="list">${people.map((p) => `<li><div class="grow"><div class="title">${esc(p)}</div><div class="meta">${tr('{n} Fahrten · {km} km', { n: st[p].trips, km: fmtNum(st[p].km) })}</div></div><div class="amount">${fmtEUR(st[p].owed)}</div></li>`).join('')}</ul>
    <p class="note">${tr('Gerechnet mit {rate} pro km, geteilt durch alle im Auto (du zählst mit).', { rate: fmtEUR(poolRate(), 3) })}</p>
    <div class="actions" style="margin-bottom:0"><button data-open="poolShare">${tr('Abrechnung teilen')}</button><button data-open="pool">${tr('Bearbeiten')}</button></div>`;
  $('#poolMonth').onchange = (e) => { poolMonth = e.target.value; renderPool(); };
}

function poolForm() {
  openSheet('Fahrgemeinschaft', `
    ${field('Mitfahrer (mit Komma getrennt)', 'people', state.pool.people.join(', '), 'placeholder="z. B. Anna, Ben"')}
    ${field('Eigener Satz pro km (€, optional)', 'rate', fmtIn(state.pool.rate, 3), 'inputmode="decimal" placeholder="leer = deine Spritkosten pro km"')}
    <p class="hint">${tr('Danach erscheinen die Namen beim Eintragen einer Fahrt zum Anhaken.')}</p>
  `, (d) => {
    state.pool = { people: [...new Set(d.people.split(',').map((x) => x.trim()).filter(Boolean))], rate: num(d.rate) };
  });
}

function sharePool() {
  const st = poolStatement(poolMonth);
  const text = `${tr('Fahrgemeinschaft {month}', { month: fmtMonth(poolMonth + '-15') })}\n\n`
    + state.pool.people.filter((p) => st[p].trips).map((p) => `${p}: ${fmtEUR(st[p].owed)} (${tr('{n} Fahrten · {km} km', { n: st[p].trips, km: fmtNum(st[p].km) })})`).join('\n')
    + `\n\n${tr('Gerechnet mit {rate} pro km, geteilt durch alle im Auto (du zählst mit).', { rate: fmtEUR(poolRate(), 3) })}`;
  shareText(tr('Fahrgemeinschaft'), text);
}

/* ---------- Zuladungs-Rechner ---------- */

function loadForm() {
  const s = state.specs || {};
  openSheet('Zuladungs-Rechner', `
    <div class="row2">
      ${field('Zulässige Gesamtmasse (kg, F.2)', 'gross', s.gross || '', 'inputmode="numeric" placeholder="z. B. 1915"')}
      ${field('Leermasse (kg, G)', 'empty', s.empty || '', 'inputmode="numeric" placeholder="z. B. 1395"')}
    </div>
    <p class="hint">${tr('Die Leermasse (Feld G) enthält schon 75 kg für den Fahrer und einen fast vollen Tank.')}</p>
    <div class="row2">
      ${field('Mitfahrer (ohne Fahrer)', 'riders', 1, 'inputmode="numeric"')}
      ${field('Gewicht pro Person (kg)', 'perKg', 75, 'inputmode="numeric"')}
    </div>
    ${field('Gepäck & Dachbox (kg)', 'luggage', '', 'inputmode="numeric" placeholder="z. B. 80"')}
    <div id="loadOut"></div>
  `, (d) => { state.specs = { ...state.specs, gross: d.gross.trim(), empty: d.empty.trim() }; }, { submitLabel: 'Fertig' });
  const calc = () => {
    const gross = num(sheetForm.gross.value), empty = num(sheetForm.empty.value);
    if (!gross || !empty) { $('#loadOut').innerHTML = ''; return; }
    const payload = gross - empty, used = (num(sheetForm.riders.value) || 0) * (num(sheetForm.perKg.value) || 75) + (num(sheetForm.luggage.value) || 0);
    const left = payload - used;
    $('#loadOut').innerHTML = `<div class="progress"><i style="width:${Math.min(1, used / payload) * 100}%;background:var(--${left < 0 ? 'bad' : left < payload * 0.1 ? 'warn' : 'good'})"></i></div>
      <div class="bignum" style="text-align:center">${left >= 0 ? tr('noch {kg} kg frei', { kg: fmtNum(left) }) : tr('{kg} kg zu viel', { kg: fmtNum(-left) })}</div>
      <p class="note">${tr('Zuladung insgesamt: {kg} kg. Bei voller Beladung den Reifendruck erhöhen (Tabelle in der Tankklappe).', { kg: fmtNum(payload) })}</p>`;
  };
  sheetForm.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc));
  calc();
}

/* ---------- Warnleuchten-Quiz ---------- */

function quizSheet() {
  const ROUNDS = 5;
  const order = [...LIGHTS].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
  let round = 0, score = 0;
  openSheet('Warnleuchten-Quiz', `<div id="quizBox"></div>`, () => {}, { submitLabel: 'Fertig' });
  const draw = () => {
    const box = $('#quizBox');
    if (!box) return;
    if (round >= ROUNDS) {
      const best = Math.max(state.quizBest || 0, score);
      if (best !== state.quizBest) { state.quizBest = best; try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* egal */ } }
      box.innerHTML = `<div class="bignum" style="text-align:center">${score} / ${ROUNDS}</div>
        <p class="note" style="text-align:center">${tr(score === ROUNDS ? 'Perfekt! Du kennst deine Warnleuchten.' : score >= 3 ? 'Gut gemacht!' : 'Übung macht den Meister. Die Erklärungen findest du unter Notfall → Warnleuchten.')}<br>${tr('Bestwert: {n} / {r}', { n: best, r: ROUNDS })}</p>
        <button type="button" class="primary" id="quizAgain" style="width:100%">${tr('Nochmal spielen')}</button>`;
      $('#quizAgain').onclick = () => { sheet.close(); setTimeout(quizSheet, 50); };
      return;
    }
    const q = order[round];
    const wrong = LIGHTS.filter((l) => l !== q && l.what !== q.what).sort(() => Math.random() - 0.5).slice(0, 2);
    const answers = [q, ...wrong].sort(() => Math.random() - 0.5);
    box.innerHTML = `<p class="meta">${tr('Frage {n} von {r}', { n: round + 1, r: ROUNDS })}</p>
      <p class="title" style="font-size:18px"><span class="qdot" style="background:var(--${q.color === 'red' ? 'bad' : 'warn'})" aria-hidden="true"></span> ${esc(tr(q.name))}</p>
      <p>${tr('Was bedeutet diese Leuchte?')}</p>
      ${answers.map((a, i) => `<button type="button" class="quiz-a" data-ok="${a === q}" style="width:100%;margin-bottom:8px;text-align:left">${esc(tr(a.what))}</button>`).join('')}`;
    box.querySelectorAll('.quiz-a').forEach((b) => {
      b.onclick = () => {
        const ok = b.dataset.ok === 'true';
        if (ok) score++;
        box.querySelectorAll('.quiz-a').forEach((x) => { x.disabled = true; if (x.dataset.ok === 'true') x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        box.insertAdjacentHTML('beforeend', `<p class="note">${ok ? tr('✓ Richtig!') : tr('Leider falsch.')} <b>${tr('Was tun:')}</b> ${esc(tr(q.todo))}</p>
          <button type="button" class="primary" id="quizNext" style="width:100%">${tr(round + 1 < ROUNDS ? 'Weiter' : 'Ergebnis')}</button>`);
        $('#quizNext').onclick = () => { round++; draw(); };
      };
    });
  };
  draw();
}

/* ---------- Tanken per Sprache ---------- */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// z. B. „42,5 Liter für 75,30 Euro bei 98.500 Kilometer“ (auch Englisch/Vietnamesisch mit Ziffern)
function parseSpokenFuel(text) {
  const t = ' ' + String(text).toLowerCase().replace(/(\d)\s+(\d{3})\b/g, '$1$2') + ' ';
  const numAt = (re) => { const m = re.exec(t); return m ? num(m[1].replace(/\.(?=\d{3}\b)/g, '')) : null; };
  return {
    liters: numAt(/(\d+(?:[.,]\d+)?)\s*(?:liter|litre|lít|l\b|kg\b)/),
    total: numAt(/(\d+(?:[.,]\d+)?)\s*(?:euro|€|eur)/) ?? numAt(/(?:euro|€)\s*(\d+(?:[.,]\d+)?)/),
    km: numAt(/(\d[\d.]*)\s*(?:kilometer|km|kilomét)/),
  };
}

function voiceFuel() {
  const r = new Recognition();
  r.lang = LOCALE;
  r.interimResults = false;
  const btn = $('#voiceBtn');
  btn.disabled = true;
  btn.textContent = tr('🎤 Ich höre zu …');
  r.onresult = (e) => {
    const said = e.results[0][0].transcript, p = parseSpokenFuel(said);
    if (p.km != null) sheetForm.km.value = fmtIn(p.km, 0);
    if (p.liters != null) { sheetForm.liters.value = fmtIn(p.liters, 2); sheetForm.liters.dispatchEvent(new Event('input')); }
    if (p.total != null) { sheetForm.total.value = fmtIn(p.total, 2); sheetForm.total.dispatchEvent(new Event('input')); }
    $('#voiceHint').textContent = tr('Verstanden: „{text}“', { text: said });
  };
  r.onerror = () => { $('#voiceHint').textContent = tr('Das hat nicht geklappt. Erlaube das Mikrofon oder nutze das Mikrofon der Tastatur.'); };
  r.onend = () => { btn.disabled = false; btn.textContent = tr('🎤 Sprechen'); };
  r.start();
}

/* ---------- Garantien ---------- */

function renderWarranty() {
  const list = state.costs.filter((c) => c.warranty && c.warranty >= today()).sort((a, b) => a.warranty.localeCompare(b.warranty));
  $('#warrantyCard').hidden = !list.length;
  $('#warrantyList').innerHTML = list.map((c) => {
    const days = daysUntil(c.warranty);
    return `<li data-edit-cost="${c.id}"><div class="grow"><div class="title">${esc(c.note || tr(c.cat))}</div>
      <div class="meta">${fmtDate(c.date)} · ${fmtEUR(c.amount)}</div></div>
      <span class="pill ${days <= 30 ? 'soon' : 'ok'}">${tr('bis {date}', { date: fmtDate(c.warranty) })}</span></li>`;
  }).join('');
}

function warrantyNotice() {
  const soon = state.costs.filter((c) => c.warranty && c.warranty >= today() && daysUntil(c.warranty) <= 30);
  if (!soon.length) return '';
  return `<div class="card notice"><span class="ico">🛡</span><div class="grow">
    <div class="title">${tr('Garantie endet bald')}</div>
    <div class="meta">${soon.map((c) => `${esc(c.note || tr(c.cat))}: ${fmtDate(c.warranty)}`).join('<br>')}<br>${tr('Mängel jetzt noch melden, danach zahlst du selbst.')}</div>
    <div class="maint-btns"><button class="small primary" data-view="costs">${tr('Ansehen')}</button></div></div></div>`;
}

function renderExtras7() {
  renderCare();
  renderPool();
  renderWarranty();
}
