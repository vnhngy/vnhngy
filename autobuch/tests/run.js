'use strict';
// Automatische Tests für Autobuch: startet die App in einem echten Browser (Chromium über Playwright)
// und prüft die wichtigsten Abläufe. Aufruf: npm test (im Ordner autobuch)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.PLAYWRIGHT_DIR || '', 'playwright')); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Beispieldaten: zwei volle Tankfüllungen im Abstand von 30 Tagen
async function seed(page) {
  await page.evaluate(([d1, d2]) => {
    if (document.querySelector('#wizard').open) closeWizard();
    state.fuel.push({ id: 'f1', date: d1, km: 97000, liters: 40, total: 70, full: true, station: 'Aral' },
      { id: 'f2', date: d2, km: 97800, liters: 44, total: 77, full: true, station: 'Shell' });
    state.costs.push({ id: 'c1', date: d2, cat: 'Werkstatt', amount: 412.8, note: 'Bremsen vorne', km: 97800, photos: [] });
    state.maint.find((m) => m.id === 'service').lastDate = '2025-11-12';
    state.maint.find((m) => m.id === 'service').lastKm = 88000;
    save();
  }, [daysAgo(40), daysAgo(10)]);
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Erster Start: Assistent erscheint, keine Fehler', async ({ page }) => {
  assert.equal(await page.evaluate(() => document.querySelector('#wizard').open), true);
  await page.click('#wizardForm button.primary');
  await page.fill('#wizardForm [name=km]', '98.500');
  await page.click('#wizardForm button.primary');
  await page.fill('#wizardForm [name=huDue]', '2027-03');
  for (let i = 0; i < 4; i++) await page.click('#wizardForm button.primary');
  const st = await page.evaluate(() => ({ open: document.querySelector('#wizard').open, km: state.car.km, hu: state.maint.find((m) => m.id === 'hu').lastDate, on: state.onboarded }));
  assert.deepEqual(st, { open: false, km: 98500, hu: '2025-03-15', on: true });
});

test('Tankfüllung eintragen und Verbrauch berechnen', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('fuel'));
  await page.click('#view-fuel button[data-open="fuel"]');
  await page.fill('#sheetForm [name=km]', '98.400');
  await page.fill('#sheetForm [name=liters]', '33,0');
  await page.fill('#sheetForm [name=total]', '58,10');
  await page.click('#sheetForm button.primary');
  const r = await page.evaluate(() => ({ n: state.fuel.length, avg: Math.round(consumption().avg * 100) / 100 }));
  assert.equal(r.n, 3);
  assert.equal(r.avg, 5.5); // (44 + 33) l / 1.400 km
});

test('Spritsorte wird gespeichert, Erdgas in Kilogramm', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('fuel'));
  await page.click('#view-fuel button[data-open="fuel"]');
  await page.selectOption('#sheetForm [name=grade]', 'Erdgas (CNG)');
  assert.equal((await page.innerText('#sheetForm label:has([name=liters]) span')).trim(), 'Kilogramm');
  await page.selectOption('#sheetForm [name=grade]', 'Super E10');
  await page.fill('#sheetForm [name=km]', '98400'); await page.fill('#sheetForm [name=liters]', '30'); await page.fill('#sheetForm [name=total]', '52');
  await page.click('#sheetForm button.primary');
  assert.equal(await page.evaluate(() => state.fuel.find((f) => f.km === 98400).grade), 'Super E10');
  assert.match(await page.innerText('#fuelList'), /Super E10/);
});

test('Auto mit Super E10: Sorte und Preissuche passen sich an', async ({ page }) => {
  await page.evaluate(() => { closeWizard(); showView('more'); });
  await page.selectOption('#carForm [name=fuel]', 'Super E10');
  await page.click('#carForm button.primary');
  const r = await page.evaluate(() => ({ grade: defaultGrade(), price: state.prices.type, plugs: state.maint.some((m) => m.id === 'plugs') }));
  assert.deepEqual(r, { grade: 'Super E10', price: 'e10', plugs: true });
  await page.click('#view-start button[data-open="fuel"]').catch(() => {});
  await page.evaluate(() => { showView('fuel'); });
  await page.click('#view-fuel button[data-open="fuel"]');
  assert.equal(await page.inputValue('#sheetForm [name=grade]'), 'Super E10');
});

test('Autogas-Auto: Benzin wird nicht in den Verbrauch gerechnet', async ({ page }) => {
  await page.evaluate(() => {
    closeWizard();
    state.car.fuel = 'Autogas (LPG)';
    state.fuel = [
      { id: 'a', date: '2026-01-01', km: 1000, liters: 50, total: 50, full: true, grade: 'Autogas (LPG)' },
      { id: 'b', date: '2026-01-05', km: 1200, liters: 20, total: 36, full: true, grade: 'Super E5' },
      { id: 'c', date: '2026-01-10', km: 1500, liters: 45, total: 45, full: true, grade: 'Autogas (LPG)' },
    ];
    save();
  });
  assert.equal(await page.evaluate(() => consumption().avg), 9); // 45 l LPG auf 500 km
});

test('Fahrzeugfoto auf der Übersicht, auch in der Sicherung', async ({ page }) => {
  await page.evaluate(() => closeWizard());
  assert.match(await page.innerText('#carHero'), /Foto deines Autos/);
  await page.click('#carHero .hero-btn');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#photoInput', { name: 'auto.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#thumbs img');
  await page.click('#sheetForm button.primary');
  await page.waitForSelector('#carHero img');
  const r = await page.evaluate(() => ({ photo: !!state.car.photo, inBackup: allPhotoIds().includes(state.car.photo), order: homeCfg().order[0] }));
  assert.deepEqual(r, { photo: true, inBackup: true, order: 'car' });
});

test('Zahlen-Eingabe versteht deutsche und englische Schreibweise', async ({ page }) => {
  const r = await page.evaluate(() => [num('1.234,56'), num('98.500'), num('42,5'), num('7')]);
  assert.deepEqual(r, [1234.56, 98500, 42.5, 7]);
  const en = await page.evaluate(() => { setLang('en'); return [num('1,234.56'), num('42.5')]; });
  assert.deepEqual(en, [1234.56, 42.5]);
});

test('Wiederkehrende Kosten: rückwirkend, ohne Doppelbuchung', async ({ page }) => {
  await seed(page);
  const start = new Date(); start.setMonth(start.getMonth() - 3); start.setDate(1);
  await page.evaluate((s) => { state.recurring.push({ id: 'r1', name: 'Versicherung', cat: 'Versicherung', amount: 45, interval: 'monthly', start: s, end: '', booked: 0 }); bookRecurring(); save(); }, start.toISOString().slice(0, 10));
  const n1 = await page.evaluate(() => state.costs.filter((c) => c.recurringId === 'r1').length);
  assert.equal(n1, 4);
  await page.reload();
  const n2 = await page.evaluate(() => state.costs.filter((c) => c.recurringId === 'r1').length);
  assert.equal(n2, 4, 'nach Neuladen nicht erneut gebucht');
});

test('Mehrere Fahrzeuge: Daten bleiben getrennt', async ({ page }) => {
  await seed(page);
  const first = await page.evaluate(() => state.carId);
  await page.click('#carLine');
  await page.fill('#sheetForm [name=name]', 'VW Golf');
  await page.click('#sheetForm button.primary');
  await page.waitForTimeout(150);
  await page.evaluate(() => closeWizard());
  assert.equal(await page.evaluate(() => state.fuel.length), 0);
  await page.evaluate((id) => switchCar(id), first);
  const back = await page.evaluate(() => ({ fuel: state.fuel.length, name: state.car.name, others: Object.keys(state.otherCars).length }));
  assert.deepEqual(back, { fuel: 2, name: 'Mercedes A 180', others: 1 });
});

test('Datensicherung: Export und Wiederherstellung', async ({ page }) => {
  await seed(page);
  const json = await page.evaluate(() => JSON.stringify({ ...state, photos: {} }));
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.evaluate(() => { if (document.querySelector('#wizard').open) closeWizard(); });
  assert.equal(await page.evaluate(() => state.fuel.length), 0);
  await page.evaluate(() => showView('more'));
  await page.setInputFiles('#importFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.waitForFunction(() => state.fuel.length === 2);
});

test('Unlesbare Daten werden nicht überschrieben', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('autobuch-v1', '{kaputt'));
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('autobuch-v1-defekt')), '{kaputt');
});

test('Suche findet Einträge über alle Bereiche', async ({ page }) => {
  await seed(page);
  await page.click('.hdr-search');
  await page.fill('#searchInput', 'brems');
  const titles = await page.$$eval('#searchResults .sr .title', (els) => els.map((e) => e.textContent));
  assert.ok(titles.some((t) => /Werkstatt/.test(t)), 'Rechnung „Bremsen vorne“ gefunden');
  assert.ok(titles.some((t) => /Bremsflüssigkeit/.test(t)), 'Wartungstermin gefunden');
  await page.click('#searchResults .sr');
  await page.waitForFunction(() => document.querySelector('#sheet').open && document.querySelector('#sheetForm h3').textContent.length > 0);
});

test('Übersicht anpassen bleibt nach Neustart erhalten', async ({ page }) => {
  await page.evaluate(() => { closeWizard(); state.home = { order: ['chart', 'car', 'sos'], hidden: ['tiles'], tiles: [] }; save(); });
  await page.reload();
  const r = await page.evaluate(() => ({
    first: document.querySelector('#view-start [data-sec]').dataset.sec,
    tilesHidden: document.querySelector('[data-sec=tiles]').hidden,
  }));
  assert.deepEqual(r, { first: 'chart', tilesHidden: true });
});

test('Tank-Prognose wird berechnet', async ({ page }) => {
  await seed(page);
  const fc = await page.evaluate(() => fuelForecast());
  assert.ok(fc && fc.kmLeft > 0 && fc.days >= 0, JSON.stringify(fc));
  assert.match(await page.innerText('#view-start [data-sec=forecast]'), /tanken/i);
});

test('Übersetzungen vollständig (Englisch, Vietnamesisch)', async ({ page }) => {
  await seed(page);
  const views = ['start', 'fuel', 'trips', 'maint', 'costs', 'more', 'help', 'stats', 'checks', 'plan', 'garages', 'fines', 'value', 'logs', 'awards', 'notes', 'agenda', 'damages', 'leasing', 'specs'];
  for (const lang of ['en', 'vi']) {
    const missing = await page.evaluate(([l, vs]) => {
      MISSING.clear(); setLang(l);
      for (const v of vs) showView(v);
      return [...MISSING];
    }, [lang, views]);
    // Benutzerdaten, Markennamen und bereits übersetzte Texte dürfen „fehlen“
    const real = missing.filter((k) => /[äöüß]/i.test(k) && !/Büro|München|Aral|Shell|Bremsen vorne|Kraftstoff$/.test(k));
    assert.deepEqual(real, [], `${lang}: fehlende Übersetzungen`);
  }
});

test('Tanken: Rechenhilfe für Preis, Menge und Betrag', async ({ page }) => {
  await seed(page);
  await page.click('#view-start button[data-open="fuel"]');
  await page.fill('#sheetForm [name=liters]', '40');
  await page.fill('#sheetForm [name=price]', '1,75');
  assert.equal(await page.inputValue('#sheetForm [name=total]'), '70,00');
  await page.fill('#sheetForm [name=price]', '1,80'); // automatisch berechneter Betrag wird nachgezogen
  assert.equal(await page.inputValue('#sheetForm [name=total]'), '72,00');
  await page.fill('#sheetForm [name=liters]', '');
  await page.fill('#sheetForm [name=price]', '');
  await page.fill('#sheetForm [name=total]', '50');
  await page.fill('#sheetForm [name=price]', '2');
  assert.equal(await page.inputValue('#sheetForm [name=liters]'), '25,00');
  assert.ok(await page.$('#sheetForm #photoInput'), 'Belegfoto fehlt');
});

test('Monatsbudget: Fortschritt und Warnung auf der Übersicht', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.costs.push({ id: 'cb', date: today(), cat: 'Pflege', amount: 95, note: '', km: null, photos: [] }); save(); showView('costs'); });
  await page.click('#budgetCard button[data-open="budget"]');
  await page.fill('#sheetForm [name=monthly]', '100');
  await page.click('#sheetForm button.primary');
  const b = await page.evaluate(() => ({ limit: state.budget.monthly, share: budgetState().share }));
  assert.equal(b.limit, 100);
  assert.ok(b.share >= 0.95, JSON.stringify(b));
  assert.match(await page.innerText('#notices'), /Monatsbudget/);
});

test('Fahrtenbuch: Rückfahrt mit einem Tipp', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.trips.push({ id: 't1', date: today(), type: 'Geschäftlich', from: 'Zuhause', to: 'Stuttgart', startKm: 98000, endKm: 98120, purpose: 'Kunde', partner: '' }); save(); showView('trips'); });
  await page.click('#tripList li[data-edit-trip="t1"]');
  await page.click('#sheetForm button[data-return-trip]');
  await page.waitForFunction(() => document.querySelector('#sheetForm [name=from]')?.value === 'Stuttgart');
  assert.equal(await page.inputValue('#sheetForm [name=to]'), 'Zuhause');
  assert.equal(await page.inputValue('#sheetForm [name=startKm]'), '98120');
  assert.equal(await page.inputValue('#sheetForm [name=endKm]'), '98240');
  await page.click('#sheetForm button.primary');
  assert.equal(await page.evaluate(() => state.trips.length), 2);
});

test('Notizbuch, Termine und Jahresbericht', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.fines.push({ id: 'b1', type: 'Parkverstoß', date: today(), due: addDays(5), amount: 25, paid: false, photos: [] });
    save(); showView('notes');
  });
  await page.click('#view-notes button[data-open="note"]');
  await page.fill('#sheetForm [name=title]', 'Ölsorte');
  await page.fill('#sheetForm [name=text]', '5W-30, MB 229.5');
  await page.click('#sheetForm button.primary');
  assert.match(await page.innerText('#noteList'), /Ölsorte/);
  assert.ok(await page.evaluate(() => searchIndex().some((x) => x.view === 'notes' && x.hay.includes('229.5'))));

  await page.evaluate(() => showView('agenda'));
  const agenda = await page.innerText('#agendaList');
  assert.match(agenda, /Strafzettel zahlen/);
  assert.match(agenda, /Service/);

  await page.evaluate(() => showView('stats'));
  await page.click('#view-stats button[data-open="yearReport"]');
  await page.waitForSelector('#view-report.active');
  const rep = await page.innerText('#reportBody');
  assert.match(rep, new RegExp('Jahresbericht ' + new Date().getFullYear()));
  assert.match(rep, /Bremsen vorne/);
  assert.equal(await page.getAttribute('#reportBack', 'data-view'), 'stats');
});

test('Fahrzeugwechsel: neue Felder rutschen nicht ins ältere Auto', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    state.notes.push({ id: 'n1', date: today(), title: 'Nur Auto 1', text: '', photos: [] });
    state.budget = { monthly: 200 };
    const old = freshCar({ name: 'Altes Auto' });
    delete old.notes; delete old.budget; // wie eine Sicherung aus Version 21
    state.otherCars.x = old;
    switchCar('x');
    const r1 = { notes: state.notes.length, budget: state.budget.monthly };
    switchCar(Object.keys(state.otherCars)[0]);
    return { r1, back: state.notes.length, budget: state.budget.monthly };
  });
  assert.deepEqual(r, { r1: { notes: 0, budget: null }, back: 1, budget: 200 });
});

test('Neue Formulare sind übersetzt', async ({ page }) => {
  await seed(page);
  const missing = await page.evaluate(async () => {
    setLang('en'); MISSING.clear();
    state.trips.push({ id: 't1', date: today(), type: 'Privat', from: 'A', to: 'B', startKm: 1, endKm: 2, purpose: '', partner: '' });
    fuelForm(); sheet.close(); budgetForm(); sheet.close(); noteForm(); sheet.close(); tripForm(state.trips[0]); sheet.close(); damageForm(); sheet.close(); leasingForm(); sheet.close(); commuteForm(); sheet.close(); specsForm(); sheet.close(); lockscreenSheet(); sheet.close(); state.leasing = { start: addDays(-400), end: addDays(400), kmStart: 1, kmPerYear: 10, rate: 5 };
    state.budget = { monthly: 10 }; save();
    await buildYearReport(String(new Date().getFullYear()));
    openStory(String(new Date().getFullYear())); for (let i = 0; i < story.cards.length; i++) { story.i = i; drawStory(); } document.querySelector('#story').close();
    return [...MISSING];
  });
  assert.deepEqual(missing.filter((k) => /[äöüß]/i.test(k) && !/Bremsen vorne|Aral|Shell/.test(k)), []);
});

test('Parkplatz-Kompass zeigt Entfernung zum Auto', async ({ page, ctx }) => {
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({ latitude: 48.7758, longitude: 9.1829 });
  await seed(page);
  await page.evaluate(() => { state.parking = { lat: 48.7785, lng: 9.1829, time: Date.now(), note: 'Ebene 2', until: null }; save(); });
  await page.click('#view-start button[data-park="compass"]');
  await page.waitForFunction(() => compass && compass.dist != null);
  const r = await page.evaluate(() => ({ dist: Math.round(compass.dist), text: document.querySelector('#compassDist').textContent }));
  assert.ok(r.dist > 280 && r.dist < 320, JSON.stringify(r)); // ca. 300 m nach Norden
  assert.match(r.text, /m$/);
  await page.click('#sheetForm [data-close]');
  await page.waitForFunction(() => compass === null); // Schließen beendet GPS und Kompass
});

test('Rekorde, CO₂-Bilanz und Tankstellen-Ranking', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.fuel.push({ id: 'f3', date: today(), km: 98300, liters: 30, total: 57, full: true, station: 'shell ' }); save(); showView('stats'); });
  const rec = await page.innerText('#statRecords');
  assert.match(rec, /Sparsamste Tankfüllung/);
  assert.match(rec, /Günstigster Preis/);
  assert.match(await page.innerText('#statCo2'), /Bäume/);
  const rank = await page.innerText('#statStations');
  assert.ok(rank.indexOf('Aral') < rank.indexOf('Shell'), rank); // Aral 1,75 €/l, Shell Ø 1,81 €/l
  assert.match(rank, /2× getankt/); // „Shell“ und „shell “ zählen als dieselbe Tankstelle
});

test('Lieblingsstrecken: häufige Fahrt mit einem Tipp', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.trips.push({ id: 'a', date: addDays(-3), type: 'Arbeitsweg', from: 'Zuhause', to: 'Büro', startKm: 98000, endKm: 98021, purpose: '', partner: '' },
      { id: 'b', date: addDays(-2), type: 'Arbeitsweg', from: 'Zuhause', to: 'Büro', startKm: 98042, endKm: 98063, purpose: '', partner: '' });
    save(); showView('trips');
  });
  assert.equal(await page.isHidden('#favCard'), false);
  await page.click('#favList button[data-fav="0"]');
  assert.equal(await page.inputValue('#sheetForm [name=to]'), 'Büro');
  assert.equal(await page.inputValue('#sheetForm [name=startKm]'), '98063');
  assert.equal(await page.inputValue('#sheetForm [name=endKm]'), '98084');
});

test('Dein Autojahr: Rückblick zum Durchtippen', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('stats'));
  await page.click('#view-stats button[data-open="story"]');
  const n = await page.evaluate(() => story.cards.length);
  assert.ok(n >= 5, 'Karten: ' + n);
  assert.match(await page.innerText('#story'), /Dein Autojahr/);
  for (let i = 0; i < n - 1; i++) await page.mouse.click(300, 400);
  assert.match(await page.innerText('#story'), /Erfolge/);
  await page.mouse.click(300, 400);
  assert.equal(await page.evaluate(() => document.querySelector('#story').open), false);
});

test('Schäden: Stelle am Auto antippen, festhalten, reparieren', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('damages'));
  await page.click('#dmgCar [data-dmg-zone="fl"]');
  assert.equal(await page.inputValue('#sheetForm [name=zone]'), 'fl');
  await page.fill('#sheetForm [name=desc]', 'Kratzer 10 cm');
  await page.click('#sheetForm button.primary');
  assert.equal((await page.innerText('#dmgCar [data-dmg-zone="fl"]')).trim(), '1');
  await page.click('#dmgList li[data-edit-dmg]');
  await page.check('#sheetForm [name=repaired]');
  await page.click('#sheetForm button.primary');
  const d = await page.evaluate(() => state.damages[0]);
  assert.equal(d.repaired, true);
  assert.equal(d.repairedDate, await page.evaluate(() => today()));
  assert.match(await page.innerText('#dmgFixed'), /Repariert \(1\)/);
});

test('Leasing: Hochrechnung und Warnung bei zu vielen km', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.car.km = 99000; save(); showView('leasing'); });
  await page.click('#leaseBody button[data-open="leasing"]');
  await page.evaluate(() => { sheetForm.start.value = addDays(-365); sheetForm.end.value = addMonths(addDays(-365), 36); });
  await page.fill('#sheetForm [name=kmStart]', '80000');
  await page.fill('#sheetForm [name=kmPerYear]', '10000');
  await page.fill('#sheetForm [name=rate]', '10');
  await page.click('#sheetForm button.primary');
  const s = await page.evaluate(() => leasingStatus());
  assert.equal(s.driven, 19000);
  assert.ok(s.over > 25000 && s.over < 28000, JSON.stringify(s)); // 19.000 km/Jahr statt 10.000 bei 3 Jahren
  assert.match(await page.innerText('#leaseBody'), /zu viel/);
  assert.match(await page.innerText('#notices'), /Leasing/);
});

test('Pendlerpauschale aus dem Fahrtenbuch', async ({ page }) => {
  await seed(page);
  const y = String(new Date().getFullYear());
  const c = await page.evaluate((yr) => {
    state.trips.push({ id: 'p1', date: yr + '-01-05', type: 'Arbeitsweg', from: 'A', to: 'B', startKm: 1000, endKm: 1023, purpose: '', partner: '' },
      { id: 'p2', date: yr + '-01-06', type: 'Arbeitsweg', from: 'A', to: 'B', startKm: 1046, endKm: 1069, purpose: '', partner: '' });
    tripYear = yr; save();
    return commuteFigures(yr);
  }, y);
  assert.deepEqual({ km: c.km, days: c.days }, { km: 23, days: 2 });
  assert.equal(Math.round(c.amount * 100), +y >= 2026 ? 1748 : 1320); // 2 × 23 km × 0,38 €
  assert.match(await page.innerText('#commuteBody'), /Pendlerpauschale/);
});

test('Spritspar-Rechner, Steckbrief und Fahrzeugfoto bleibt beim Speichern', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('stats'));
  await page.fill('#saveForm [name=km]', '10000');
  await page.evaluate(() => { const r = document.querySelector('#saveForm [name=less]'); r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.match(await page.innerText('#saveOut'), /100 Liter weniger/);

  await page.evaluate(() => showView('specs'));
  await page.click('#view-specs button[data-open="specs"]');
  await page.fill('#sheetForm [name=tireSize]', '205/55 R16 91V');
  await page.click('#sheetForm button.primary');
  assert.match(await page.innerText('#specBody'), /205\/55 R16/);

  const photo = await page.evaluate(() => { state.car.photo = 'p-car'; save(); showView('more'); document.querySelector('#carForm button').click(); return state.car.photo; });
  assert.equal(photo, 'p-car');
});

test('Notfall-Sperrbildschirm wird erzeugt', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { Object.assign(state.docs, { plate: 'S-AB 1234', insurer: 'HUK', iceName: 'Mama', icePhone: '0170 123' }); save(); showView('help'); });
  await page.click('#view-help button[data-open="lockscreen"]');
  await page.waitForFunction(() => document.querySelector('#lockImg')?.src.startsWith('blob:'));
  const size = await page.evaluate(() => { const c = lockscreenCanvas(); return [c.width, c.height]; });
  assert.deepEqual(size, [1179, 2556]);
});

test('Kacheln nach Kategorien, leere Kategorie wird ausgeblendet', async ({ page }) => {
  await page.evaluate(() => { closeWizard(); state.home = { order: null, hidden: [], tiles: ['notes', 'fines', 'leasing'] }; save(); });
  const r = await page.evaluate(() => [...document.querySelectorAll('#view-start .tile-group')].map((g) => [g.querySelector('h3').textContent, g.hidden]));
  assert.deepEqual(r, [['Auswerten', false], ['Planen', false], ['Fahrzeug & Pflege', false], ['Unterlagen', true]]);
});

test('Keine bunten Emojis auf dem Bildschirm', async ({ page }) => {
  await seed(page);
  const left = await page.evaluate(() => {
    const out = new Set();
    for (const v of ['start', 'fuel', 'help', 'awards', 'checks']) {
      showView(v);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode.nodeValue;
        if (/\p{Extended_Pictographic}/u.test(t.replace(/[↔→↑↓✓©®™]/g, ''))) out.add(t.trim());
      }
    }
    return [...out];
  });
  assert.deepEqual(left, []);
});

test('Update-Knopf erkennt die aktuelle Version', async ({ page }) => {
  await page.evaluate(() => { closeWizard(); showView('more'); });
  const msg = new Promise((r) => page.once('dialog', (d) => r(d.message())));
  await page.click('#updateBtn');
  assert.match(await msg, /neueste Version/);
});

test('Bedienungshilfen: Knöpfe ohne Text und Formulare sind beschriftet', async ({ page }) => {
  await seed(page);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a')]
    .filter((b) => b.offsetParent && !b.textContent.trim() && !b.getAttribute('aria-label'))
    .map((b) => b.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  await page.click('#view-start button[data-open="fuel"]');
  assert.equal(await page.getAttribute('#sheet', 'aria-label'), 'Tankfüllung eintragen');
});

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await playwright.chromium.launch();
  let failed = 0;
  for (const t of tests) {
    const ctx = await browser.newContext({ ...playwright.devices['iPhone 13'], locale: 'de-DE' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    try {
      await page.goto(url);
      await t.fn({ page, ctx });
      assert.deepEqual(errors, [], 'JavaScript-Fehler');
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${t.name}\n    ${String(e.message).split('\n').join('\n    ')}`);
    }
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} von ${tests.length} Tests fehlgeschlagen` : `\nAlle ${tests.length} Tests bestanden`);
  process.exit(failed ? 1 : 0);
})();
