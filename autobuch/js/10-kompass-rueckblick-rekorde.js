'use strict';
// Autobuch – Parkplatz-Kompass, Jahresrückblick, Rekorde, CO₂-Bilanz, Tankstellen-Ranking, Lieblingsstrecken.
// Alle Dateien teilen sich einen gemeinsamen Gültigkeitsbereich und werden in der Reihenfolge der Nummern geladen.

/* ---------- Parkplatz-Kompass ---------- */

let compass = null;

function bearing(a, b) {
  const rad = Math.PI / 180, dLng = (b.lng - a.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

const fmtDist = (m) => m < 1000 ? `${fmtNum(Math.round(m / 5) * 5)} m` : `${fmtNum(m / 1000, 1)} km`;

function parkCompass() {
  const p = state.parking;
  // iOS fragt beim ersten Mal nach Erlaubnis für den Kompass; das muss direkt beim Tippen passieren
  const ask = window.DeviceOrientationEvent?.requestPermission ? DeviceOrientationEvent.requestPermission().catch(() => 'denied') : Promise.resolve('granted');
  openSheet('Zum Auto', `
    <div class="compass"><svg id="compassArrow" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 74 84 50 68 26 84z"/></svg></div>
    <div class="compass-dist" id="compassDist">…</div>
    <p class="hint" id="compassHint" style="text-align:center">${tr('Standort wird gesucht …')}</p>
    ${p.note ? `<p class="note" style="text-align:center">${esc(p.note)}</p>` : ''}
    <a class="btn" style="width:100%" href="https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w" target="_blank" rel="noopener">${tr('🚶 In Apple Karten öffnen')}</a>
  `, () => {}, { submitLabel: 'Fertig' });
  const c = compass = { heading: null, pos: null };
  if (navigator.geolocation) {
    c.watch = navigator.geolocation.watchPosition((pos) => { c.pos = pos.coords; drawCompass(); },
      () => { if (compass === c) $('#compassHint').textContent = tr('Standort nicht verfügbar.'); }, { enableHighAccuracy: true, maximumAge: 2000 });
  }
  c.onOri = (e) => {
    const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
    if (h != null) { c.heading = h; drawCompass(); }
  };
  ask.then((r) => { if (r === 'granted' && compass === c) window.addEventListener('deviceorientation', c.onOri); });
  sheet.addEventListener('close', () => {
    if (c.watch != null) navigator.geolocation.clearWatch(c.watch);
    window.removeEventListener('deviceorientation', c.onOri);
    if (compass === c) compass = null;
  }, { once: true });
}

function drawCompass() {
  const c = compass, p = state.parking;
  if (!c || !c.pos || !p || !$('#compassArrow')) return;
  const here = { lat: c.pos.latitude, lng: c.pos.longitude }, car = { lat: p.lat, lng: p.lng };
  const dist = haversine(here, car), dir = bearing(here, car);
  c.dist = dist;
  $('#compassDist').textContent = dist < 15 ? tr('Du bist da!') : fmtDist(dist);
  $('#compassArrow').style.transform = `rotate(${(dir - (c.heading ?? 0) + 360) % 360}deg)`;
  $('#compassHint').textContent = (c.heading != null ? tr('Halte das iPhone flach vor dir. Der Pfeil zeigt zum Auto.')
    : tr('Kein Kompass: Der Pfeil zeigt die Richtung, wenn die Oberkante des iPhones nach Norden zeigt.'))
    + (c.pos.accuracy > 30 ? ' ' + tr('(Genauigkeit ± {m} m)', { m: Math.round(c.pos.accuracy) }) : '');
}

/* ---------- CO₂ ---------- */

// kg CO₂ je Liter (Erdgas: je kg) bei der Verbrennung, Richtwerte des Umweltbundesamts
const CO2_FACTOR = { benzin: 2.37, diesel: 2.65, lpg: 1.64, cng: 2.79 };
const TREE_KG = 12.5; // ein Baum bindet grob 12,5 kg CO₂ pro Jahr

const co2Of = (fills) => fills.reduce((s, f) => s + f.liters * (CO2_FACTOR[gradeOf(fillGrade(f)).fam] || 2.37), 0);

/* ---------- Statistik-Ergänzungen ---------- */

function renderStatsExtras() {
  const y = statYear, inY = state.fuel.filter((f) => f.date.startsWith(y));
  const kg = co2Of(inY);
  const { driven } = yearFigures(y, allExpenses(), kmPoints(), consumption().segs);
  $('#statCo2').innerHTML = kg ? `<div class="split">
      <div><div class="label">${tr('CO₂ {year}', { year: y })}</div><div class="bignum">${kg >= 1000 ? fmtNum(kg / 1000, 2) + ' t' : fmtNum(kg) + ' kg'}</div></div>
      <div><div class="label">${tr('pro km')}</div><div class="bignum">${driven ? fmtNum(kg / driven * 1000) + ' g' : '–'}</div></div>
    </div>
    <p class="note" style="margin-bottom:0">${tr('🌳 So viel CO₂ binden etwa {n} Bäume in einem Jahr.', { n: fmtNum(Math.max(1, Math.round(kg / TREE_KG))) })}</p>`
    : `<p class="empty" style="margin:0">${tr('Noch keine Tankfüllungen in diesem Jahr.')}</p>`;

  // Tankstellen-Ranking: Ø Preis je Tankstelle (Hauptsorte, letzte 12 Monate)
  const since = addDays(-365), groups = {};
  state.fuel.filter((f) => f.station && f.date > since && f.liters > 0 && gradeOf(fillGrade(f)).fam === mainFam()).forEach((f) => {
    const k = fold(f.station.trim());
    const g = groups[k] || (groups[k] = { name: f.station.trim(), l: 0, eur: 0, n: 0 });
    g.l += f.liters; g.eur += f.total; g.n++;
  });
  const ranked = Object.values(groups).map((g) => ({ ...g, ppl: g.eur / g.l })).sort((a, b) => a.ppl - b.ppl);
  const avgAll = ranked.reduce((s, g) => s + g.eur, 0) / ranked.reduce((s, g) => s + g.l, 0);
  $('#statStations').innerHTML = ranked.length > 1 ? `<ul class="list">${ranked.slice(0, 6).map((g, i) => {
    const diff = (g.ppl - avgAll) * 100;
    return `<li><span class="rank">${i + 1}</span><div class="grow"><div class="title">${esc(g.name)}</div>
      <div class="meta">${tr('{n}× getankt', { n: g.n })} · <span class="${diff < 0 ? 'good-text' : diff > 0 ? 'bad-text' : ''}">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtNum(Math.abs(diff), 1)} ct</span></div></div>
      <div class="amount">${fmtEUR(g.ppl, 3)}</div></li>`;
  }).join('')}</ul><p class="note" style="margin-bottom:0">${tr('Aus deinen eigenen Tankfüllungen der letzten 12 Monate. Abweichung zum Durchschnitt pro Liter.')}</p>`
    : `<p class="empty" style="margin:0">${tr('Trag bei Tankfüllungen die Tankstelle ein. Ab zwei verschiedenen Tankstellen siehst du hier, wo du am günstigsten tankst.')}</p>`;

  renderRecords();
}

function renderRecords() {
  const out = [];
  const add = (icon, title, value, meta) => out.push(`<li><span class="rank">${icon}</span><div class="grow"><div class="title">${title}</div><div class="meta">${meta}</div></div><div class="amount">${value}</div></li>`);
  const cons = consumption();
  const best = Object.entries(cons.per).sort((a, b) => a[1] - b[1])[0];
  if (best) {
    const f = state.fuel.find((x) => x.id === best[0]);
    add('🌱', tr('Sparsamste Tankfüllung'), `${fmtNum(best[1], 1)} ${consUnit()}`, fmtDate(f.date));
  }
  const fills = state.fuel.filter((x) => x.liters > 0 && gradeOf(fillGrade(x)).fam === mainFam());
  if (fills.length) {
    const lo = fills.reduce((a, b) => (b.total / b.liters < a.total / a.liters ? b : a));
    add('🏷', tr('Günstigster Preis'), `${fmtEUR(lo.total / lo.liters, 3)}`, [fmtDate(lo.date), lo.station].filter(Boolean).map(esc).join(' · '));
  }
  const seg = [...cons.segs].sort((a, b) => b.dist - a.dist)[0];
  if (seg) add('⛽', tr('Weiteste Strecke mit einer Tankfüllung'), `${fmtNum(seg.dist)} km`, fmtDate(seg.date));
  const trip = [...state.trips].sort((a, b) => (b.endKm - b.startKm) - (a.endKm - a.startKm))[0];
  if (trip) add('🛣', tr('Längste Fahrt'), `${fmtNum(trip.endKm - trip.startKm)} km`, `${esc(trip.from || '?')} → ${esc(trip.to || '?')} · ${fmtDate(trip.date)}`);
  if (state.drives.length) {
    const fast = state.drives.reduce((a, b) => ((b.maxKmh || 0) > (a.maxKmh || 0) ? b : a));
    const good = state.drives.reduce((a, b) => ((b.score ?? -1) > (a.score ?? -1) ? b : a));
    add('🛰', tr('Höchstes GPS-Tempo'), `${fmtNum(fast.maxKmh)} km/h`, fmtDate(new Date(fast.start).toISOString().slice(0, 10)));
    if (good.score != null) add('🏅', tr('Beste Fahrnote'), `${good.score}/100`, `${fmtNum(good.km, 1)} km · ${fmtDate(new Date(good.start).toISOString().slice(0, 10))}`);
  }
  $('#statRecords').innerHTML = out.length ? `<ul class="list">${out.join('')}</ul>` : `<p class="empty" style="margin:0">${tr('Noch keine Rekorde. Trag Tankfüllungen und Fahrten ein.')}</p>`;
}

/* ---------- Lieblingsstrecken ---------- */

function favRoutes() {
  const groups = {};
  state.trips.filter((t) => t.from && t.to).forEach((t) => {
    const k = fold(t.from) + '→' + fold(t.to);
    (groups[k] = groups[k] || []).push(t);
  });
  return Object.values(groups).filter((g) => g.length >= 2).sort((a, b) => b.length - a.length).slice(0, 4).map((g) => {
    const dists = g.map((t) => t.endKm - t.startKm).sort((a, b) => a - b);
    const last = [...g].sort((a, b) => b.date.localeCompare(a.date))[0];
    return { last, n: g.length, dist: dists[Math.floor(dists.length / 2)] };
  });
}

function renderFavRoutes() {
  const favs = favRoutes();
  renderFavRoutes.list = favs;
  $('#favCard').hidden = !favs.length;
  $('#favList').innerHTML = favs.map((f, i) => `<li>
    <div class="grow"><div class="title">${esc(f.last.from)} → ${esc(f.last.to)}</div>
    <div class="meta">${fmtNum(f.dist)} km · ${tr(TRIP_LABEL[f.last.type])} · ${tr('{n}× gefahren', { n: f.n })}</div></div>
    <button class="small primary" data-fav="${i}">${tr('＋ Eintragen')}</button></li>`).join('');
}

function favTrip(f) {
  const start = Math.max(...state.trips.map((t) => t.endKm), currentKm() ?? 0);
  tripForm(null, { type: f.last.type, from: f.last.from, to: f.last.to, startKm: start, endKm: start + f.dist, purpose: f.last.purpose, partner: f.last.partner });
}

/* ---------- Dein Autojahr (Rückblick zum Durchtippen) ---------- */

let story = null;

function storyCards(y) {
  const inY = (d) => d && d.startsWith(y);
  const exp = allExpenses().filter((e) => inY(e.date));
  const { segs, per } = consumption();
  const f = yearFigures(y, allExpenses(), kmPoints(), segs);
  const fills = state.fuel.filter((x) => inY(x.date));
  const trips = state.trips.filter((t) => inY(t.date));
  const drives = state.drives.filter((d) => inY(new Date(d.start).toISOString()));
  const cards = [{ hue: 215, kicker: tr('✨ Dein Autojahr'), big: y, text: esc([state.car.name, state.car.variant].filter(Boolean).join(' · ')) }];

  if (f.driven) {
    const earth = f.driven / 40075;
    cards.push({ hue: 200, kicker: tr('🛣 Gefahren'), big: `${fmtNum(f.driven)} km`,
      text: earth >= 1 ? tr('Damit bist du {n}-mal um die Erde gefahren.', { n: fmtNum(earth, 1) }) : tr('Das sind {p} % einer Erdumrundung.', { p: fmtNum(earth * 100, 0) }) });
  }
  if (fills.length) {
    const amount = fills.reduce((s, x) => s + x.liters, 0), eur = fills.reduce((s, x) => s + x.total, 0), unit = unitOf(defaultGrade());
    cards.push({ hue: 30, kicker: tr('⛽ Getankt'), big: `${fills.length}×`,
      text: tr('{amount} {unit} für {eur}.', { amount: fmtNum(amount), unit, eur: fmtEUR(eur, 0) }) + (unit === 'l' && amount >= 150 ? ' ' + tr('Das füllt {n} Badewannen.', { n: fmtNum(amount / 150, 1) }) : '') });
  }
  if (exp.length) {
    const byCat = {};
    exp.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amount; });
    const [cat, v] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const days = y === String(new Date().getFullYear()) ? Math.max(1, -daysUntil(`${y}-01-01`) + 1) : 365;
    cards.push({ hue: 350, kicker: tr('€ Ausgaben'), big: fmtEUR(f.cost, 0),
      text: tr('Am meisten ging für {cat} drauf ({eur}).', { cat: esc(tr(cat)), eur: fmtEUR(v, 0) }) + ' ' + tr('Das sind {eur} pro Tag.', { eur: fmtEUR(f.cost / days) }) });
  }
  if (f.cons) {
    const best = fills.filter((x) => per[x.id] != null).sort((a, b) => per[a.id] - per[b.id])[0];
    cards.push({ hue: 140, kicker: tr('🌱 Verbrauch'), big: `${fmtNum(f.cons, 1)} <small>${consUnit()} km</small>`,
      text: best ? tr('Deine sparsamste Tankfüllung: {cons} am {date}.', { cons: `${fmtNum(per[best.id], 1)} ${consUnit()}`, date: fmtDate(best.date) }) : '' });
  }
  if (trips.length) {
    const count = {};
    trips.filter((t) => t.to).forEach((t) => { count[t.to] = (count[t.to] || 0) + 1; });
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    if (top) cards.push({ hue: 265, kicker: tr('📍 Lieblingsziel'), big: esc(top[0]), text: tr('{n}× dorthin, insgesamt {total} Fahrten im Fahrtenbuch.', { n: top[1], total: trips.length }) });
  }
  if (drives.length) {
    const scored = drives.filter((d) => d.score != null);
    const avg = scored.length ? Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length) : null;
    cards.push({ hue: 185, kicker: tr('🛰 Fahrstil'), big: avg != null ? `${avg}<small>/100</small>` : `${drives.length}`,
      text: tr('{n} aufgezeichnete Fahrten, Spitze {kmh} km/h.', { n: drives.length, kmh: fmtNum(Math.max(...drives.map((d) => d.maxKmh || 0))) }) });
  }
  const kg = co2Of(fills);
  if (kg) cards.push({ hue: 100, kicker: tr('🍃 CO₂'), big: kg >= 1000 ? `${fmtNum(kg / 1000, 1)} t` : `${fmtNum(kg)} kg`, text: tr('🌳 So viel CO₂ binden etwa {n} Bäume in einem Jahr.', { n: fmtNum(Math.max(1, Math.round(kg / TREE_KG))) }) });
  const won = AWARDS.filter((a) => { const g = typeof a.goal === 'function' ? a.goal() : a.goal; return g > 0 && a.val() >= g; }).length;
  cards.push({ hue: 45, kicker: tr('🏆 Erfolge'), big: `${won}<small>/${AWARDS.length}</small>`, text: tr('Gute Fahrt und allzeit freie Straßen!') });
  return cards;
}

function openStory(y) {
  const cards = storyCards(y);
  if (cards.length < 3) return alert(tr('Für {year} gibt es noch zu wenige Daten für einen Rückblick.', { year: y }));
  story = { cards, i: 0, y };
  drawStory();
  $('#story').showModal();
}

function drawStory() {
  const { cards, i } = story, c = cards[i];
  $('#story').innerHTML = `
    <div class="story-bars">${cards.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('')}</div>
    <button type="button" class="story-close" data-story="close" aria-label="${tr('Schließen')}">×</button>
    <div class="story-card" style="--hue:${c.hue}">
      <div class="story-kicker">${c.kicker}</div>
      <div class="story-big">${c.big}</div>
      <div class="story-text">${c.text}</div>
    </div>
    ${i === cards.length - 1 ? `<button type="button" class="story-share" data-story="share">${tr('Als Bild teilen')}</button>` : ''}
    <div class="story-hint">${tr(i < cards.length - 1 ? 'Tippen zum Weiterblättern' : 'Tippen zum Schließen')}</div>`;
}

$('#story').addEventListener('click', (e) => {
  if (!story) return;
  if (e.target.closest('[data-story="close"]')) return $('#story').close();
  if (e.target.closest('[data-story="share"]')) return shareStoryImage(story.y);
  const back = e.clientX < window.innerWidth / 3;
  if (back) story.i = Math.max(0, story.i - 1);
  else if (story.i < story.cards.length - 1) story.i++;
  else return $('#story').close();
  drawStory();
});
$('#story').addEventListener('close', () => { story = null; });
