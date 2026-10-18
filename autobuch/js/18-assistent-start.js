'use strict';
// Drivo – Einrichtungs-Assistent, Symbole statt Emojis, Sprache und App-Start.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Einrichtungs-Assistent ---------- */

const wizard = $('#wizard'), wizForm = $('#wizardForm');
let wizStep = 0;

const hasNoData = () => !state.fuel.length && !state.costs.length && !state.trips.length && state.car.km == null
  && state.maint.every((m) => !m.lastDate && m.lastKm == null);

const wizField = (label, name, value, attrs = '') => field(label, name, value ?? '', attrs);
const wizSelect = (label, name, options, selected) => `<label class="field"><span>${tr(label)}</span><select name="${name}">
  ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></label>`;
const mt = (id) => state.maint.find((m) => m.id === id) || {};

// Jeder Schritt: Symbol, Titel, Inhalt, und was beim „Weiter“ übernommen wird
const WIZ_STEPS = [
  {
    icon: '👋', title: 'Willkommen bei Drivo',
    body: () => `<p>${tr('In ein paar kurzen Schritten richten wir die App für dein Auto ein. Jeder Schritt lässt sich überspringen und später ändern.')}</p>
      <p class="note">${tr('Sprache wählen:')}</p>
      <div class="seg" style="margin-bottom:6px">${[['de', 'Deutsch'], ['en', 'English'], ['vi', 'Tiếng Việt']].map(([l, n]) =>
        `<button type="button" data-wlang="${l}" aria-pressed="${l === LANG}">${n}</button>`).join('')}</div>`,
  },
  {
    icon: '🚗', title: 'Dein Auto',
    body: () => {
      const c = state.car;
      return `${wizField('Bezeichnung', 'name', c.name)}
        <div class="row2">${wizField('Ausstattung', 'variant', c.variant)}${wizField('Baujahr', 'year', c.year, 'inputmode="numeric"')}</div>
        <div class="row2">${wizSelect('Kraftstoff', 'fuel', CAR_FUELS.map((f) => [f, fuelLabel(f)]), c.fuel)}
        ${wizField('Kilometerstand', 'km', c.km ?? currentKm(), 'inputmode="numeric" placeholder="z. B. 98500"')}</div>
        <p class="hint">${tr('Den Kilometerstand siehst du im Kombiinstrument.')}</p>`;
    },
    apply: (d) => {
      const old = state.car.fuel;
      Object.assign(state.car, { name: d.name.trim() || state.car.name, variant: d.variant.trim(), year: d.year.trim(), fuel: d.fuel });
      if (num(d.km) != null) state.car.km = num(d.km);
      fuelChanged(old);
    },
  },
  {
    icon: '🔧', title: 'Wartung',
    body: () => {
      const sv = mt('service'), hu = mt('hu'), br = mt('brake');
      const huDue = hu.lastDate ? addMonths(hu.lastDate, 24).slice(0, 7) : '';
      return `<p class="note" style="margin-top:0">${tr('Steht im Serviceheft oder auf der letzten Werkstattrechnung.')}</p>
        <div class="row2">${wizField('Letzter Service am', 'svDate', sv.lastDate, 'type="date"')}${wizField('bei km', 'svKm', sv.lastKm, 'inputmode="numeric"')}</div>
        ${wizSelect('Das war', 'svType', [['A', 'Service A'], ['B', 'Service B']], sv.lastAlt || 'A')}
        ${wizField('Nächster TÜV (Monat auf der Plakette)', 'huDue', huDue, 'type="month"')}
        <p class="hint">${tr('Die Plakette hinten am Kennzeichen zeigt Monat und Jahr der nächsten Hauptuntersuchung.')}</p>
        ${wizField('Bremsflüssigkeit zuletzt gewechselt (optional)', 'brDate', br.lastDate, 'type="date"')}`;
    },
    apply: (d) => {
      const sv = mt('service');
      if (d.svDate || num(d.svKm) != null) Object.assign(sv, { lastDate: d.svDate, lastKm: num(d.svKm), lastAlt: d.svType });
      if (d.huDue) mt('hu').lastDate = addMonths(d.huDue + '-15', -24);
      if (d.brDate) mt('brake').lastDate = d.brDate;
    },
  },
  {
    icon: '🛞', title: 'Reifen',
    body: () => state.tires.length
      ? `<p>${tr('Du hast schon Reifensätze angelegt. Die verwaltest du unter Wartung → Reifen.')}</p>`
      : `${wizSelect('Welche Reifen sind gerade drauf?', 'season', [['Sommer', 'Sommerreifen'], ['Winter', 'Winterreifen'], ['Ganzjahr', 'Ganzjahrreifen']], new Date().getMonth() >= 9 || new Date().getMonth() <= 2 ? 'Winter' : 'Sommer')}
        <div class="row2">${wizField('Größe', 'size', '', 'placeholder="z. B. 225/40 R18"')}${wizField('DOT (4 Ziffern)', 'dot', '', 'inputmode="numeric" maxlength="4" placeholder="z. B. 2321"')}</div>
        <p class="hint">${tr('Größe und DOT stehen auf der Reifenflanke. Die letzten 4 Ziffern der DOT-Nummer sind das Herstelldatum: 2321 = Woche 23 im Jahr 2021.')}</p>
        <label class="check"><input type="checkbox" name="second" checked> ${tr('Ich habe noch einen zweiten Satz (Sommer/Winter)')}</label>
        ${wizField('Wo lagert der zweite Satz?', 'loc', '', 'placeholder="z. B. Keller oder Reifenhotel, Nr. 4711"')}
        <label class="check"><input type="checkbox" name="alpine" checked> ${tr('Die Winterreifen haben das Schneeflocken-Symbol (Berg mit Schneeflocke)')}</label>`,
    apply: (d) => {
      if (state.tires.length || !d.season) return;
      if (d.dot && tireAge(d.dot) == null) return tr('Die DOT-Angabe muss 4 Ziffern haben, z. B. 2321.');
      const mk = (season, extra = {}) => ({ id: uid(), name: `${season}reifen`, season, brand: '', size: '', dot: '', alpine: season !== 'Sommer' && d.alpine === 'on', location: '', km: 0, note: '', tread: null, ...extra });
      const on = mk(d.season, { size: d.size.trim(), dot: d.dot.trim() });
      state.tires.push(on);
      if (d.second === 'on' && d.season !== 'Ganzjahr') state.tires.push(mk(d.season === 'Sommer' ? 'Winter' : 'Sommer', { size: d.size.trim(), location: d.loc.trim() }));
      state.mounted = { id: on.id, date: '', km: currentKm() };
      if (d.season !== 'Ganzjahr') mt('tires').lastAlt = d.season + 'reifen';
    },
  },
  {
    icon: '🚨', title: 'Für den Notfall',
    body: () => {
      const x = state.docs;
      return `<p class="note" style="margin-top:0">${tr('Damit du nach einem Unfall oder einer Panne alles griffbereit hast.')}</p>
        <div class="row2">${wizField('Kennzeichen', 'plate', x.plate, 'autocapitalize="characters" placeholder="z. B. S-AB 1234"')}${wizField('Versicherung', 'insurer', x.insurer, 'placeholder="z. B. HUK-COBURG"')}</div>
        ${wizField('Versicherungsnr.', 'policy', x.policy)}
        ${wizField('Schadenhotline', 'claimPhone', x.claimPhone, 'type="tel" placeholder="steht auf deiner Versicherungskarte"')}
        ${wizField('Pannenhilfe', 'breakdown', x.breakdown, 'type="tel" placeholder="z. B. ADAC: 089 20 20 4000"')}`;
    },
    apply: (d) => {
      Object.assign(state.docs, { plate: d.plate.trim().toUpperCase(), insurer: d.insurer.trim(), policy: d.policy.trim(), claimPhone: d.claimPhone.trim(), breakdown: d.breakdown.trim() });
    },
  },
  {
    icon: '🎉', title: 'Fertig!',
    body: () => `<p>${tr('Deine App ist eingerichtet. Drei Tipps zum Start:')}</p>
      <ol class="steps">
        <li>${tr('Beim nächsten Tanken auf <b>⛽ Tanken</b> tippen. Ab der zweiten vollen Tankfüllung siehst du deinen Verbrauch.')}</li>
        <li>${tr('Unter <b>Wartung</b> siehst du, was als Nächstes fällig ist. Mit <b>📅 In den Kalender</b> bekommst du Erinnerungen.')}</li>
        <li>${tr('Ab und zu unter <b>Mehr → Datensicherung</b> eine Sicherung anlegen.')}</li>
      </ol>`,
  },
];

function openWizard(step = 0) {
  wizStep = step;
  renderWizard();
  if (!wizard.open) wizard.showModal();
}

function renderWizard() {
  const st = WIZ_STEPS[wizStep], last = wizStep === WIZ_STEPS.length - 1;
  wizForm.innerHTML = `
    <div class="wiz-dots" aria-label="${tr('Schritt {n} von {total}', { n: wizStep + 1, total: WIZ_STEPS.length })}">
      ${WIZ_STEPS.map((_, i) => `<span class="${i === wizStep ? 'on' : i < wizStep ? 'done' : ''}"></span>`).join('')}</div>
    <div class="wiz-icon" aria-hidden="true">${st.icon}</div>
    <h3>${tr(st.title)}</h3>
    ${st.body()}
    <div class="form-btns">
      ${wizStep ? `<button type="button" data-wiz="back">${tr('Zurück')}</button>` : ''}
      <button class="primary" value="next">${tr(last ? 'Los geht’s' : 'Weiter')}</button>
    </div>
    ${!last ? `<button type="button" class="link" data-wiz="${wizStep ? 'skip' : 'later'}" style="width:100%;margin-top:10px">${tr(wizStep ? 'Diesen Schritt überspringen' : 'Später einrichten')}</button>` : ''}`;
  wizForm.scrollTop = 0;
}

function wizNext(apply) {
  const st = WIZ_STEPS[wizStep];
  if (apply && st.apply) {
    const err = st.apply(Object.fromEntries(new FormData(wizForm)));
    if (err) return alert(err);
    save();
  }
  if (wizStep === WIZ_STEPS.length - 1) return closeWizard();
  wizStep++;
  renderWizard();
}

wizForm.addEventListener('submit', (e) => { e.preventDefault(); wizNext(true); });
wizForm.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.wlang) { setLang(b.dataset.wlang); renderWizard(); }
  if (b.dataset.wiz === 'back') { wizStep--; renderWizard(); }
  if (b.dataset.wiz === 'skip') wizNext(false);
  if (b.dataset.wiz === 'later') closeWizard();
});
function closeWizard() {
  state.onboarded = true;
  save();
  if (wizard.open) wizard.close();
}
wizard.addEventListener('close', () => { if (!state.onboarded) closeWizard(); }); // z. B. per Escape-Taste

/* ---------- Einfarbige Symbole statt Emojis ---------- */

// Emojis in allen Texten (auch Übersetzungen) werden auf dem Bildschirm durch Linien-Symbole ersetzt.
const EMOJI_ICONS = { '⛽': 'fuel', '📍': 'pin', '🔧': 'wrench', '🛠': 'wrench', '🚨': 'siren', '🚗': 'car', '📎': 'clip', '🛢': 'drop', '🔁': 'repeat', '🔄': 'refresh', '💾': 'save', '🛞': 'tire', '✅': 'checks', '🗺': 'map', '🧾': 'receipt', '🏆': 'trophy', '🏅': 'medal', '📅': 'calendar', '▶': 'play', '⬇': 'download', '📄': 'doc', '📁': 'folder', '📝': 'pen', '🖨': 'printer', '📞': 'phone', '👍': 'okcircle', '❄': 'snow', '☀': 'sun', '📊': 'chart', '📉': 'trend', '🚑': 'medic', '🚓': 'shield', '✨': 'sparkle', '🚶': 'walk', '📷': 'camera', '📸': 'camera', '💡': 'bulb', '🛰': 'gps', '🧳': 'suitcase', '🌸': 'leaf', '🏷': 'tag', '🕘': 'clock', '⏱': 'clock', '⏰': 'clock', '👤': 'user', '🗑': 'trash', '🌱': 'leaf', '🍃': 'leaf', '🛣': 'road', '📒': 'book', '👋': 'smile', '🎉': 'flag', '⚠': 'alert', '🎯': 'target', '🧭': 'compass', '🌳': 'tree', '🌍': 'globe', '🔒': 'lock', '🔑': 'key', '🚆': 'train', '🛡': 'shield', '🔎': 'search', '🔋': 'battery', '🌡': 'thermo', '🎤': 'mic', '🗓': 'calgrid', '🖼': 'image' };
const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_ICONS).join('|')})[\uFE0E\uFE0F]?`, 'gu');
const NO_SVG = new Set(['OPTION', 'TITLE', 'TEXTAREA', 'SCRIPT', 'STYLE']);

function iconizeText(node) {
  const text = node.nodeValue;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  const parent = node.parentNode;
  if (!parent || parent.closest?.('svg')) return;
  EMOJI_RE.lastIndex = 0;
  if (NO_SVG.has(parent.nodeName)) { node.nodeValue = text.replace(EMOJI_RE, '').trim(); return; }
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + EMOJI_ICONS[m[1]]);
    svg.append(use);
    frag.append(svg);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  parent.replaceChild(frag, node);
}

function iconize(root) {
  if (root.nodeType === 3) return iconizeText(root);
  if (root.nodeType !== 1 || root.closest('svg')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(iconizeText);
}

new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'characterData') iconizeText(m.target);
    else m.addedNodes.forEach(iconize);
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true });

/* ---------- Sprache ---------- */

function setLang(l) {
  state.lang = l;
  initLang(l);
  applyStatic();
  save();
  renderLinks();
  renderDrive();
  showView(currentView === 'report' ? 'more' : currentView);
}

let startView = 'start';
try { startView = sessionStorage.getItem('autobuch-view') || 'start'; } catch (e) { /* egal */ }
initLang(state.lang);
if (!state.carId) state.carId = uid(); // Fahrzeug-ID für ältere Daten nachtragen
if (bookRecurring()) save();
collectStatic();
applyStatic();
render();
showView(TITLES[startView] && !['drive', 'report'].includes(startView) ? startView : 'start');
iconize(document.body);
applyTextSize();
renderLinks();
if (state.lock) showLock();
if (!state.onboarded && hasNoData() && !state.lock) openWizard();
handleUrlAction();
if (state.onboarded || !hasNoData()) maybeWhatsNew();

// Zoomen mit zwei Fingern verhindern (Safari ignoriert user-scalable=no teilweise)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
// Zwei Finger schon beim Aufsetzen abfangen, nicht erst beim Bewegen
document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
// Notbremse: falls iOS doch hineinzoomt, sofort auf 100 % zurücksetzen
if (window.visualViewport) {
  const vp = document.querySelector('meta[name=viewport]'), base = vp.content;
  visualViewport.addEventListener('resize', () => {
    if (visualViewport.scale > 1.01) { vp.content = base + ', minimum-scale=1'; setTimeout(() => { vp.content = base; }, 300); }
  });
}
$('#appVersion').textContent = `Drivo · Version ${APP_VERSION}`;

// Manuell: neueste Version vom Server holen und alles Zwischengespeicherte verwerfen
$('#updateBtn').addEventListener('click', async () => {
  const btn = $('#updateBtn');
  btn.disabled = true;
  try {
    const src = await (await fetch('js/01-grundlagen.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const latest = (/APP_VERSION = '([\d.]+)'/.exec(src) || [])[1];
    if (latest && cmpVer(latest, APP_VERSION) <= 0) { alert(tr('Du hast schon die neueste Version ({v}).', { v: APP_VERSION })); return; }
    for (const k of await caches.keys()) await caches.delete(k);
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    location.replace(location.pathname + '?v=' + (latest || Date.now()));
  } catch (e) {
    alert(tr('Keine Verbindung. Bist du online?'));
  } finally { btn.disabled = false; }
});

// Neue Version sofort übernehmen, sobald der Service Worker sie geladen hat
if ('serviceWorker' in navigator) {
  // iOS holt Home-Bildschirm-Apps oft nur aus dem Hintergrund zurück, ohne neu zu laden:
  // deshalb auch beim Zurückkehren in die App nach einer neuen Version fragen
  const checkUpdate = () => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  setInterval(checkUpdate, 30 * 60 * 1000);
  const hadOldVersion = !!navigator.serviceWorker.controller; // beim allerersten Besuch nicht neu laden
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOldVersion && !reloaded) { reloaded = true; location.reload(); } });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
