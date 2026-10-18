'use strict';
// Automatische Tests für Drivo: startet die App in einem echten Browser (Chromium über Playwright)
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
  const views = ['start', 'fuel', 'trips', 'maint', 'costs', 'more', 'help', 'stats', 'checks', 'plan', 'garages', 'fines', 'value', 'logs', 'awards', 'notes', 'agenda', 'damages', 'leasing', 'specs', 'history', 'handover', 'care', 'gallery', 'calendar'];
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
    fuelForm(); sheet.close(); budgetForm(); sheet.close(); noteForm(); sheet.close(); tripForm(state.trips[0]); sheet.close(); damageForm(); sheet.close(); leasingForm(); sheet.close(); commuteForm(); sheet.close(); specsForm(); sheet.close(); lockscreenSheet(); sheet.close(); handoverForm(); sheet.close(); travelForm(); sheet.close(); lockSetup(); sheet.close(); taxForm(); sheet.close(); priceTargetForm(); sheet.close(); csvImportSheet(); sheet.close(); dataCheckSheet(); sheet.close(); openDriveMode(); document.querySelector('#driveMode').close(); insKmForm(); sheet.close(); supplyForm(); sheet.close(); repairForm(); sheet.close(); state.garages.push({ id: 'g', name: 'X' }); garageForm(state.garages[0]); sheet.close(); costForm(); sheet.close(); careForm('wash'); sheet.close(); poolForm(); sheet.close(); loadForm(); sheet.close(); quizSheet(); sheet.close(); state.pool = { people: ['A'], rate: null }; save(); partForm(); sheet.close(); whatsNewSheet(true); sheet.close(); showView('gallery'); showView('calendar'); state.leasing = { start: addDays(-400), end: addDays(400), kmStart: 1, kmPerYear: 10, rate: 5 };
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
  await page.evaluate(() => { closeWizard(); state.home = { order: null, hidden: [], tiles: ['notes', 'fines', 'handover', 'gallery'] }; save(); });
  const r = await page.evaluate(() => [...document.querySelectorAll('#view-start .tile-group')].map((g) => [g.querySelector('h3').textContent, g.hidden]));
  assert.deepEqual(r, [['Auswerten', false], ['Fahrzeug & Pflege', false], ['Planen', false], ['Unterlagen', true]]);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#view-start .tile-grid')].map((g) => g.children.length));
  assert.deepEqual(sizes, [4, 4, 4, 4]); // nur volle Reihen
});

test('km-Stand schnell auf der Übersicht eintragen', async ({ page }) => {
  await seed(page);
  await page.click('#view-start .stat[data-open="km"]');
  await page.fill('#sheetForm [name=km]', '90000');
  await page.click('#sheetForm button.primary'); // kleiner als bekannt -> Fehlermeldung, Formular bleibt offen
  assert.equal(await page.evaluate(() => sheet.open), true);
  await page.fill('#sheetForm [name=km]', '99.100');
  await page.click('#sheetForm button.primary');
  const r = await page.evaluate(() => ({ km: currentKm(), date: state.car.kmDate === today(), point: kmPoints().some(([d, k]) => k === 99100 && d === today()) }));
  assert.deepEqual(r, { km: 99100, date: true, point: true });
});

test('E5 oder E10 und Fahrtkosten teilen', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('fuel'));
  await page.fill('#e10Form [name=e5]', '1,80');
  await page.fill('#e10Form [name=e10]', '1,70');
  assert.match(await page.innerText('#e10Out'), /E10 lohnt sich:/);
  await page.fill('#e10Form [name=e10]', '1,79');
  assert.match(await page.innerText('#e10Out'), /E5 ist hier günstiger/);

  await page.evaluate(() => { state.trips.push({ id: 't9', date: today(), type: 'Privat', from: 'A', to: 'Berlin', startKm: 98000, endKm: 98120, purpose: '', partner: '' }); save(); showView('trips'); });
  await page.click('#tripList li[data-edit-trip="t9"]');
  await page.click('#sheetForm button[data-share-trip]');
  await page.waitForSelector('#splitOut');
  await page.selectOption('#sheetForm [name=mode]', 'biz');
  await page.fill('#sheetForm [name=people]', '3');
  assert.match(await page.innerText('#splitOut'), /^12,00\s€ pro Person$/); // 120 km × 0,30 € / 3
});

test('Echte Monatskosten, Monats-Check und Fahrzeugvergleich', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('costs'));
  const tc = await page.innerText('#trueCost');
  assert.match(tc, /pro Monat/);
  assert.match(tc, /Deutschlandtickets/);
  const ics = await page.evaluate(() => checkReminderFile());
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYDAY=1SA/);

  const r = await page.evaluate(() => {
    const other = freshCar({ name: 'Zweitwagen' });
    other.fuel = [{ id: 'z1', date: addDays(-50), km: 10000, liters: 30, total: 50, full: true }, { id: 'z2', date: addDays(-20), km: 10500, liters: 35, total: 60, full: true }];
    state.otherCars.z = other; save(); showView('stats');
    return { name: state.car.name, fuel: state.fuel.length, hidden: document.querySelector('#compareCard').hidden };
  });
  assert.deepEqual(r, { name: 'Mercedes A 180', fuel: 2, hidden: false }); // Vergleich verändert das aktive Auto nicht
  const cmp = await page.innerText('#compareBody');
  assert.match(cmp, /Zweitwagen/);
  assert.match(cmp, /7,0/); // 35 l / 500 km
});

test('Hinweis, wenn die App leer in Safari geöffnet wird', async ({ page }) => {
  await page.evaluate(() => { closeWizard(); renderNotices(); });
  assert.match(await page.innerText('#notices'), /Safari/); // Test-Browser gibt sich als iPhone aus, ohne Home-Bildschirm-Modus
  await seed(page);
  assert.doesNotMatch(await page.innerText('#notices'), /Safari/);
});

test('Akzentfarbe gilt pro Fahrzeug', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('more'));
  await page.click('#accentSeg [data-accent="red"]');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '#9b4545');
  const other = await page.evaluate(() => {
    state.otherCars.x = freshCar({ name: 'Zweitwagen' }); switchCar('x');
    return document.documentElement.style.getPropertyValue('--accent');
  });
  assert.equal(other, ''); // Zweitwagen hat die Standardfarbe
});

test('App-Sperre mit Face ID (Passkey) und Ersatz-PIN', async ({ page, ctx }) => {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await seed(page);
  await page.evaluate(() => showView('more'));
  await page.click('#lockBody button[data-lock="setup"]');
  await page.fill('#sheetForm [name=pin]', '1234');
  await page.fill('#sheetForm [name=pin2]', '1234');
  await page.click('#sheetForm button.primary');
  await page.waitForFunction(() => state.lock && state.lock.pinHash);
  assert.ok(await page.evaluate(() => !!state.lock.credId), 'Passkey angelegt');

  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#lockDlg').open || appLocked === false); // Face ID entsperrt automatisch
  await page.evaluate(() => showLock(false));
  assert.equal(await page.evaluate(() => document.querySelector('#lockDlg').open), true);
  await page.evaluate(() => openSheet('Test', '', () => {}));
  assert.equal(await page.evaluate(() => sheet.open), false, 'keine Formulare über der Sperre');
  await page.fill('#lockPin', '9999');
  await page.press('#lockPin', 'Enter');
  await page.waitForFunction(() => document.querySelector('#lockErr').textContent.length > 0);
  await page.fill('#lockPin', '1234');
  await page.press('#lockPin', 'Enter');
  await page.waitForFunction(() => !document.querySelector('#lockDlg').open);
});

test('Chronik mit Filtern', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.trips.push({ id: 't1', date: today(), type: 'Privat', from: 'A', to: 'B', startKm: 1, endKm: 5, purpose: '', partner: '' }); save(); showView('history'); });
  const all = await page.innerText('#histList');
  assert.match(all, /Getankt/);
  assert.match(all, /Bremsen vorne/);
  assert.doesNotMatch(all, /A → B/); // Fahrten nur im eigenen Filter
  await page.click('#histSeg [data-hist="trip"]');
  assert.match(await page.innerText('#histList'), /A → B/);
  await page.click('#histSeg [data-hist="fuel"]');
  assert.doesNotMatch(await page.innerText('#histList'), /Bremsen/);
});

test('Saison- und Versicherungs-Hinweise im Oktober', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  await page.reload();
  await seed(page);
  const n = await page.innerText('#notices');
  assert.match(n, /Winterreifen/);
  assert.match(n, /30\. November/);
  await page.click('#notices button[data-dismiss*="winter-tires"]');
  assert.doesNotMatch(await page.innerText('#notices'), /Zeit für Winterreifen/);
  assert.ok(await page.evaluate(() => agendaItems().some((x) => x.date === '2026-11-30')));
});

test('Übergabe-Protokoll mit Unterschrift', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('handover'));
  await page.click('#view-handover button[data-open="handover"]');
  await page.fill('#sheetForm [name=from]', 'Ich');
  await page.fill('#sheetForm [name=to]', 'Käufer');
  await page.locator('#signFrom').scrollIntoViewIfNeeded();
  const box = await page.locator('#signFrom').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 }); await page.mouse.move(box.x + 200, box.y + 30, { steps: 5 }); await page.mouse.up();
  await page.click('#sheetForm button.primary');
  await page.waitForSelector('#view-report.active');
  const h = await page.evaluate(() => state.handovers[0]);
  assert.ok(h.signFrom && !h.signTo, JSON.stringify(h));
  await page.waitForFunction((id) => photoGet(id).then((b) => !!b), h.signFrom);
  assert.match(await page.innerText('#reportBody'), /Übergabe-Protokoll[\s\S]*Käufer/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#reportBody img.sig').length), 1);
});

test('Reisekosten-Abrechnung und Rettungskarte', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.trips.push({ id: 'g1', date: today(), type: 'Geschäftlich', from: 'Büro', to: 'Kunde', startKm: 1000, endKm: 1100, purpose: 'Termin', partner: 'Firma X' },
      { id: 'g2', date: today(), type: 'Privat', from: 'A', to: 'B', startKm: 1100, endKm: 1150, purpose: '', partner: '' });
    save(); showView('trips');
  });
  await page.click('#view-trips button[data-open="travel"]');
  await page.evaluate(() => { sheetForm.from.value = addDays(-5); });
  await page.click('#sheetForm button.primary');
  await page.waitForSelector('#view-report.active');
  const rep = await page.innerText('#reportBody');
  assert.match(rep, /Reisekosten-Abrechnung/);
  assert.match(rep, /Firma X/);
  assert.match(rep, /30,00/); // 100 km × 0,30 €
  assert.doesNotMatch(rep, /A → B/);
  assert.match(await page.getAttribute('#rescueBody a', 'href'), /Rettungskarte%20Mercedes%20A%20180%202015/);
});

test('Mängelliste für die Werkstatt', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('maint'));
  await page.fill('#issueForm [name=text]', 'Klappern vorne links');
  await page.press('#issueForm [name=text]', 'Enter');
  assert.match(await page.innerText('#issueList'), /Klappern vorne links/);
  assert.equal(await page.isHidden('#issueShare'), false);
  await page.click('#issueList input[data-issue]');
  const r = await page.evaluate(() => ({ done: state.issues[0].done, open: document.querySelector('#issueList').innerText }));
  assert.equal(r.done, true);
  assert.match(r.open, /Keine offenen Punkte/);
});

test('Datencheck findet Tippfehler', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    state.fuel.push({ id: 'x1', date: today(), km: 90000, liters: 40, total: 4, full: true, station: '' });
    save();
    return dataCheck().map((x) => x.level + ': ' + x.text);
  });
  assert.ok(r.some((x) => /^bad: .*kleiner als/.test(x)), r.join('\n'));
  assert.ok(r.some((x) => /^bad: .*unrealistisch/.test(x)), r.join('\n'));
  await page.evaluate(() => showView('more'));
  await page.click('#view-more button[data-open="datacheck"]');
  assert.match(await page.innerText('#sheetForm'), /Hinweise/);
});

test('Tankdaten aus CSV übernehmen und als CSV exportieren', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('more'));
  await page.click('#view-more button[data-open="csvImport"]');
  const csv = '﻿Datum;Kilometerstand;Tageskilometer;Getankte Menge;Kosten;Tankstelle\n01.09.2025;90000;500;40,5;70,10;Aral\n15.09.2025;90600;600;42,0;"73,50";Shell Süd\n15.09.2025;90600;600;42,0;73,50;Shell Süd\nkaputt;;;;;\n';
  await page.setInputFiles('#csvFile', { name: 'spritmonitor.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForSelector('#csvMap select');
  assert.equal(await page.inputValue('#sheetForm [name=col_km]'), '1'); // Kilometerstand, nicht Tageskilometer
  assert.equal(await page.inputValue('#sheetForm [name=col_liters]'), '3');
  await page.click('#sheetForm button.primary');
  const f = await page.evaluate(() => state.fuel.filter((x) => x.date.startsWith('2025-09')).map((x) => [x.date, x.km, x.liters, x.total, x.station]));
  assert.deepEqual(f, [['2025-09-01', 90000, 40.5, 70.1, 'Aral'], ['2025-09-15', 90600, 42, 73.5, 'Shell Süd']]);
  const out = await page.evaluate(() => fuelCsv());
  assert.match(out, /"Datum";"Kilometerstand";"Spritsorte"/);
  assert.match(out, /"15\.09\.2025";"90600"/);
});

test('Kfz-Steuer-Rechner', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => [
    kfzTax({ ccm: '1595', co2: '128', firstReg: '2015-03' }, 'Benzin').total, // 16 × 2 € + 33 g × 2 €
    kfzTax({ ccm: '1332', co2: '130', firstReg: '2022-01' }, 'Benzin').total, // 14 × 2 € + 20 g × 2 € + 15 g × 2,20 €
    kfzTax({ ccm: '1950', co2: '120', firstReg: '2016-05' }, 'Diesel').total, // 20 × 9,50 € + 25 g × 2 €
    kfzTax({ ccm: '1600', co2: '150', firstReg: '2008-01' }, 'Benzin').old,
  ]);
  assert.deepEqual(r.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)), [98, 101, 240, true]);
  await page.evaluate(() => { state.specs = { ccm: '1595', co2: '128', firstReg: '2015-03' }; save(); showView('specs'); });
  assert.match(await page.innerText('#taxBody'), /98\s€/);
});

test('Fahrmodus, Wunschpreis und Autojahr als Bild', async ({ page }) => {
  await seed(page);
  await page.click('#view-start button[data-open="drivemode"]');
  assert.equal(await page.evaluate(() => document.querySelector('#driveMode').open), true);
  await page.click('#driveMode [data-dm="fuel"]');
  assert.equal(await page.evaluate(() => [document.querySelector('#driveMode').open, sheet.open].join()), 'false,true');
  await page.evaluate(() => sheet.close());

  await page.evaluate(() => {
    state.prices.key = 'x'; state.prices.target = 1.7;
    prices.list = [{ brand: 'Billig', street: 'A', place: 'B', dist: 1, price: 1.659, lat: 0, lng: 0 }, { brand: 'Teuer', street: 'A', place: 'B', dist: 2, price: 1.799, lat: 0, lng: 0 }];
    prices.time = '12:00'; save();
  });
  const pb = await page.innerText('#priceBody');
  assert.match(pb, /1 Tankstellen liegen unter deinem Wunschpreis/);
  assert.match(pb, /unter Wunschpreis/);

  const size = await page.evaluate(() => { const c = storyImage(String(new Date().getFullYear())); return [c.width, c.height]; });
  assert.deepEqual(size, [1080, 1920]);
  await page.evaluate(() => showView('stats'));
  await page.click('#view-stats button[data-open="story"]');
  const n = await page.evaluate(() => story.cards.length);
  for (let i = 0; i < n - 1; i++) await page.mouse.click(300, 300);
  assert.ok(await page.$('#story [data-story="share"]'), 'Teilen-Knopf auf der letzten Karte');
});

test('Versicherte Kilometer: Hochrechnung und Warnung', async ({ page }) => {
  await seed(page);
  const y = new Date().getFullYear();
  const r = await page.evaluate((yr) => {
    state.insKm = { limit: 5000, start: yr + '-01-01' };
    state.car.km = 97800 + 6000; state.car.kmDate = today(); save();
    const st = insKmStatus();
    return { mid: kmAtDate(addDays(-25)), driven: st.driven, over: st.over > 0 };
  }, y);
  assert.equal(r.mid, 97400); // genau zwischen 97.000 und 97.800
  assert.ok(r.driven >= 6000, JSON.stringify(r));
  assert.equal(r.over, true);
  assert.match(await page.innerText('#notices'), /Mehr km als versichert/);
});

test('Haltbarkeit, Pannenhilfe und Werkstatt-Bewertung', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('specs'));
  await page.click('#view-specs button[data-open="supply"]');
  const soon = await page.evaluate(() => addDays(20).slice(0, 7));
  await page.fill('#sheetForm [name=expires]', soon);
  await page.click('#sheetForm button.primary');
  assert.match(await page.innerText('#supplyList'), /Verbandkasten/);
  assert.match(await page.innerText('#notices'), /Haltbarkeit läuft ab/);
  assert.ok(await page.evaluate(() => agendaItems().some((x) => /Verbandkasten/.test(x.title))));

  await page.evaluate(() => showView('help'));
  assert.match(await page.innerText('#guideList'), /Starthilfe/);

  await page.evaluate(() => { state.garages.push({ id: 'g1', name: 'Autohaus Süd', phone: '', address: '', hours: '', contact: '', note: '', rating: 4 }); save(); showView('costs'); });
  await page.click('#view-costs button[data-open="cost"]');
  await page.fill('#sheetForm [name=amount]', '250');
  await page.selectOption('#sheetForm [name=garageId]', 'g1');
  await page.click('#sheetForm button.primary');
  await page.evaluate(() => showView('garages'));
  const g = await page.innerText('#garageList');
  assert.match(g, /★★★★☆/);
  assert.match(g, /1 Rechnung, zusammen 250/);
});

test('Fahrgewohnheiten und Reparatur-Rechner', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    state.trips.push({ id: 'm1', date: '2026-10-12', type: 'Arbeitsweg', from: 'A', to: 'B', startKm: 1, endKm: 31, purpose: '', partner: '' },
      { id: 'm2', date: '2026-10-17', type: 'Privat', from: 'A', to: 'C', startKm: 31, endKm: 41, purpose: '', partner: '' });
    state.values.push({ id: 'v1', date: today(), value: 9000, note: '' });
    save(); showView('stats');
  });
  assert.equal(await page.isHidden('#habitsCard'), false);
  assert.match(await page.innerText('#habitText'), /am Mo.*Wochenende: 25 %/);
  await page.evaluate(() => showView('value'));
  await page.click('#view-value button[data-open="repair"]');
  assert.equal(await page.inputValue('#sheetForm [name=value]'), '9000');
  await page.fill('#sheetForm [name=cost]', '1800');
  assert.match(await page.innerText('#repairOut'), /20 %[\s\S]*lohnt sich meistens/);
});

test('Pflege-Plan und Garantie-Tracker', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('care'));
  await page.click('#careList button[data-care="wash"]');
  assert.equal(await page.evaluate(() => state.care.wash === today()), true);
  await page.click('#careList [data-care-edit="wax"]');
  await page.fill('#sheetForm [name=cost]', '29,90');
  await page.click('#sheetForm button.primary');
  assert.ok(await page.evaluate(() => state.costs.some((c) => c.cat === 'Pflege' && c.amount === 29.9)));

  await page.evaluate(() => showView('costs'));
  await page.click('#view-costs button[data-open="cost"]');
  await page.fill('#sheetForm [name=amount]', '180');
  await page.fill('#sheetForm [name=note]', 'Neue Batterie');
  await page.evaluate(() => { sheetForm.warranty.value = addDays(20); });
  await page.click('#sheetForm button.primary');
  assert.match(await page.innerText('#warrantyList'), /Neue Batterie/);
  assert.match(await page.innerText('#notices'), /Garantie endet bald/);
  assert.ok(await page.evaluate(() => agendaItems().some((x) => /Neue Batterie/.test(x.title))));
});

test('Fahrgemeinschaft: Mitfahrer anhaken und abrechnen', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.pool = { people: ['Anna', 'Ben'], rate: 0.2 }; save(); showView('trips'); });
  await page.click('#view-trips button[data-open="trip"]');
  await page.fill('#sheetForm [name=to]', 'Büro');
  await page.fill('#sheetForm [name=startKm]', '97800');
  await page.fill('#sheetForm [name=endKm]', '97830');
  await page.check('#sheetForm [name=rider0]');
  await page.click('#sheetForm button.primary');
  const st = await page.evaluate(() => poolStatement(today().slice(0, 7)));
  assert.deepEqual(st, { Anna: { trips: 1, km: 30, owed: 3 }, Ben: { trips: 0, km: 0, owed: 0 } }); // 30 km × 0,20 € / 2 Personen
  assert.match(await page.innerText('#poolBody'), /Anna[\s\S]*3,00/);
});

test('Zuladung, Quiz und Tanken per Sprache', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('specs'));
  await page.click('#view-specs button[data-open="load"]');
  await page.fill('#sheetForm [name=gross]', '1915');
  await page.fill('#sheetForm [name=empty]', '1395');
  await page.fill('#sheetForm [name=riders]', '3');
  await page.fill('#sheetForm [name=perKg]', '80');
  await page.fill('#sheetForm [name=luggage]', '100');
  assert.match(await page.innerText('#loadOut'), /noch 180 kg frei/);
  await page.click('#sheetForm button.primary');

  await page.evaluate(() => showView('help'));
  await page.click('#view-help button[data-open="quiz"]');
  for (let i = 0; i < 5; i++) {
    await page.click('#quizBox .quiz-a[data-ok="true"]');
    await page.click('#quizNext');
  }
  assert.match(await page.innerText('#quizBox'), /5 \/ 5/);
  assert.equal(await page.evaluate(() => state.quizBest), 5);

  const p = await page.evaluate(() => [
    parseSpokenFuel('42,5 Liter für 75,30 € bei 98.500 Kilometer'),
    parseSpokenFuel('Kilometerstand 98 500 km, 40 Liter, 70 Euro'),
    parseSpokenFuel('35 litres 61.20 euros'),
  ]);
  assert.deepEqual(p[0], { liters: 42.5, total: 75.3, km: 98500 });
  assert.deepEqual(p[1], { liters: 40, total: 70, km: 98500 });
  assert.deepEqual([p[2].liters, p[2].total], [35, 61.2]);
});

test('Neu in dieser Version erscheint einmal nach dem Update', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { state.seenVersion = '31'; save(); }); // alte Nummer ohne Punkt
  await page.reload();
  await page.waitForFunction(() => sheet.open);
  const t = await page.innerText('#sheetForm');
  assert.match(t, new RegExp('Version ' + await page.evaluate(() => APP_VERSION)));
  assert.doesNotMatch(t, /Version 0\.31/); // schon gesehen
  await page.click('#sheetForm button.primary');
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => sheet.open), false);
});

test('Parkplatz-Foto, Belege-Galerie und Kalender', async ({ page }) => {
  await seed(page);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.evaluate(() => { state.parking = { lat: null, lng: null, time: Date.now(), note: '', until: null }; save(); parkForm(); });
  await page.setInputFiles('#photoInput', { name: 'p.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 1);
  await page.click('#sheetForm button.primary');
  const pid = await page.evaluate(() => state.parking.photos[0]);
  assert.ok(pid);
  await page.waitForFunction(() => document.querySelector('#parkBody img.park-photo')?.src.startsWith('blob:'));

  await page.evaluate(() => showView('gallery'));
  await page.waitForFunction(() => document.querySelectorAll('#galGrid img[src^="blob:"]').length === 1);
  assert.match(await page.innerText('#galGrid'), /Parkplatz/);
  await page.click('#galSeg [data-gal="receipt"]');
  assert.match(await page.innerText('#galGrid'), /Noch keine Fotos/);

  await page.evaluate(() => { showView('start'); });
  await page.click('#view-start button[data-park="clear"]');
  await page.waitForFunction((id) => photoGet(id).then((b) => !b), pid);

  const d2 = await page.evaluate(() => state.fuel.find((f) => f.id === 'f2').date);
  await page.evaluate((d) => { showView('calendar'); calMonth = d.slice(0, 7); calDay = d; renderCalendar(); }, d2);
  assert.ok(await page.$(`#calGrid [data-cal-day="${d2}"] .cd-fuel`), 'Punkt für Tanken');
  assert.match(await page.innerText('#calList'), /Getankt/);
});

test('Ersatzteile, Spritpreis-Verlauf und Gebrauchtwagen-Checkliste', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('specs'));
  await page.click('#view-specs button[data-open="part"]');
  await page.fill('#sheetForm [name=name]', 'Ölfilter');
  await page.fill('#sheetForm [name=number]', 'A 270 180 02 10');
  await page.click('#sheetForm button.primary');
  assert.match(await page.innerText('#partList'), /Ölfilter[\s\S]*A 270 180 02 10/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#priceTrend circle').length), 2);
  await page.evaluate(() => showView('checks'));
  assert.match(await page.innerText('#checkLists'), /Gebrauchtwagenkauf/);
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

test('Spritpreise ohne Schlüssel: Links zu clever-tanken.de und Apple Karten', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => showView('fuel'));
  const links = await page.$$eval('#priceBody a', (as) => as.map((a) => a.href));
  assert.ok(links.includes('https://www.clever-tanken.de/'), links.join());
  assert.ok(links.some((h) => h.startsWith('https://maps.apple.com/?q=Tankstelle')), links.join());
});

test('Versionsnummern werden richtig verglichen', async ({ page }) => {
  const r = await page.evaluate(() => [cmpVer('1.0.0', '32'), cmpVer('1.1.0', '1.0.9'), cmpVer('1.10.0', '1.9.3'), cmpVer('2.0.0', '1.12.4'), cmpVer('1.0.0', '1.0.0'), cmpVer('0.31', '31')]);
  assert.deepEqual(r.map(Math.sign), [1, 1, 1, 1, 0, 0]);
  assert.match(await page.evaluate(() => APP_VERSION), /^\d+\.\d+\.\d+$/);
  assert.match(await page.innerText('#appVersion'), /Version \d+\.\d+\.\d+/);
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
