'use strict';
// Automatische Tests für Gegenwert: startet die App in Chromium (Playwright) und prüft die Abläufe.
// Aufruf: npm test (im Ordner gegenwert)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(path.join(process.env.PLAYWRIGHT_DIR || '', 'playwright')); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

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

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function onboard(page, net = '2.600', hours = '40') {
  await page.fill('#onboardForm [name=net]', net);
  await page.fill('#onboardForm [name=hours]', hours);
  await page.click('#onboardForm button.primary');
}

test('Erster Start: Willkommen erscheint und speichert das Einkommen', async ({ page }) => {
  assert.equal(await page.evaluate(() => document.querySelector('#onboard').open), true);
  await onboard(page);
  const st = await page.evaluate(() => ({ open: document.querySelector('#onboard').open, net: state.net, h: state.hours, r: hourly() }));
  assert.equal(st.open, false);
  assert.equal(st.net, 2600);
  assert.equal(st.h, 40);
  assert.equal(st.r, 15); // 2600 / (40 · 52 / 12)
});

test('Preis wird in Arbeitszeit und eigene Einheiten umgerechnet', async ({ page }) => {
  await onboard(page);
  await page.fill('#price', '120');
  const txt = await page.innerText('#result');
  assert.match(txt, /8\sh/); // 120 € / 15 €/h
  assert.match(txt, /15\s*Döner/); // 120 / 8
  assert.match(txt, /4,6 % deines Monatsnettos/);
});

test('Abo pro Monat wird aufs Jahr gerechnet', async ({ page }) => {
  await onboard(page);
  await page.fill('#price', '12,99');
  await page.click('#mode button[data-m=month]');
  const txt = await page.innerText('#result');
  assert.match(txt, /155,88 €/);
  assert.match(txt, /1\.559 €/); // in 10 Jahren (ab 1.000 € ohne Cent)
});

test('Drivo-Daten werden übernommen (Spritpreis, Verbrauch, Tank)', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('autobuch-v1', JSON.stringify({
    car: { name: 'Mercedes A 180', tank: 50 },
    fuel: [
      { id: 'a', date: '2026-10-01', km: 1000, liters: 40, total: 70, full: true },
      { id: 'b', date: '2026-10-20', km: 1600, liters: 36, total: 72, full: true },
    ],
  })));
  await page.reload();
  await onboard(page);
  const c = await page.evaluate(() => car());
  assert.equal(c.name, 'Mercedes A 180');
  assert.equal(c.ppl, 2);   // 72 € / 36 l
  assert.equal(c.cons, 6);  // 36 l / 600 km
  assert.equal(c.fill, 100);
  await page.fill('#price', '100');
  const txt = await page.innerText('#result');
  assert.match(txt, /833 km/); // 100 € / 0,12 €/km
  assert.match(txt, /mit Mercedes A 180/);
});

test('Bedenkzeit: Wunsch ablegen, warten, verzichten → Bilanz', async ({ page }) => {
  await onboard(page);
  await page.fill('#price', '90');
  await page.click('#toWait'); // 90 € = 6 h → 3 Tage
  await page.fill('#wishForm [name=name]', 'Kopfhörer');
  await page.click('#wishForm button.primary');
  let w = await page.evaluate(() => state.wishes[0]);
  assert.equal(w.name, 'Kopfhörer');
  assert.equal(Math.round((w.until - w.added) / 864e5), 3);
  assert.match(await page.innerText('#wishes'), /noch 3 Tage/);
  // Zeit vorspulen
  await page.evaluate(() => { state.wishes[0].until = Date.now() - 1; save(); renderAll(); });
  assert.match(await page.innerText('#tabs'), /1/);
  await page.click('#wishes button[data-act=skip]');
  w = await page.evaluate(() => state.wishes[0]);
  assert.equal(w.status, 'skipped');
  const sum = await page.innerText('#summary');
  assert.match(sum, /90 €/);
  assert.match(sum, /6\sh/);
});

test('Bedenkzeit ist mindestens 1 und höchstens 30 Tage', async ({ page }) => {
  await onboard(page);
  const d = await page.evaluate(() => [coolDays(1), coolDays(30), coolDays(31), coolDays(5000)]);
  assert.deepEqual(d, [1, 1, 2, 30]);
});

test('Eigene Einheit hinzufügen, Zahlen mit Komma und Tausenderpunkt', async ({ page }) => {
  await onboard(page);
  assert.deepEqual(await page.evaluate(() => [num('1.234,50'), num('12.5'), num('2.400'), num('abc')]), [1234.5, 12.5, 2400, null]);
  await page.click('#tabs button[data-v=set]');
  await page.click('#addUnit');
  await page.fill('#unitList .list-unit:last-child .nm', 'Monatsmiete');
  await page.fill('#unitList .list-unit:last-child .pr', '800');
  await page.press('#unitList .list-unit:last-child .pr', 'Tab');
  await page.click('#tabs button[data-v=calc]');
  await page.fill('#price', '2400');
  assert.match(await page.innerText('#result'), /3\s*Monatsmiete/);
});

test('Sicherung: Daten überleben einen Neustart', async ({ page }) => {
  await onboard(page);
  await page.evaluate(() => { state.wishes.push({ id: 'x', name: 'Test', price: 10, added: 0, until: 1, status: 'bought', decided: 1 }); save(); });
  await page.reload();
  const st = await page.evaluate(() => ({ n: state.wishes.length, on: document.querySelector('#onboard').open }));
  assert.deepEqual(st, { n: 1, on: false });
});

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await playwright.chromium.launch();
  let failed = 0;
  for (const t of tests) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(url);
      await t.fn({ page });
      assert.deepEqual(errors, [], 'JavaScript-Fehler');
      console.log('✓', t.name);
    } catch (e) {
      failed++;
      console.log('✗', t.name, '\n  ', e.message.split('\n').slice(0, 6).join('\n   '));
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(failed ? `\n${failed} von ${tests.length} Tests fehlgeschlagen` : `\nAlle ${tests.length} Tests bestanden`);
  process.exit(failed ? 1 : 0);
})();
