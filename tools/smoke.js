/* Nur für den automatischen Test bei GitHub (SMOKE=1): bedient die App wie ein Mensch, damit die Bildschirmfotos
   zeigen, ob Speicher, Server und Anzeige auf echten iPhone-/Android-Systemen funktionieren. */
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const btn = re => [...document.querySelectorAll("button")].find(b => b.offsetParent && re.test(b.textContent));
  const log = t => { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "position:fixed;left:8px;bottom:90px;z-index:99;background:#000c;color:#0f0;font:11px monospace;padding:4px 6px;border-radius:6px;max-width:90vw"; document.body.appendChild(d); setTimeout(() => d.remove(), 9000); };
  await w(9000);                                   // Foto 1 bei ~8 s: Willkommen
  const q = document.querySelector("#splashQuery");
  if (q && q.offsetParent) { q.value = "74072"; q.dispatchEvent(new Event("input", { bubbles: true })); btn(/Preise zeigen|Show prices/)?.click(); }
  await w(26000);                                  // Foto 2 bei ~40 s: Preise
  document.querySelector("#tab-car")?.click(); await w(800);
  const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } };
  set("c-name", "Test Golf"); set("c-model", "VW Golf 8"); set("c-km", "41250"); set("c-tank", "50");
  btn(/Auto speichern|Save car/)?.click();
  await w(3000);
  log("Gerät " + (window.drivoApp?.device || "?").slice(0, 8) + " · nativ " + window.drivoApp?.native + " · Ort " + (localStorage.getItem("drivo.app.sub") || "-").slice(0, 40));
  await w(8000);                                   // Foto 3 bei ~55 s: Garage mit Auto
  document.querySelector("#tab-home")?.click(); await w(500);
  document.querySelector("#seg-home-map")?.click();
  await w(12000);                                  // Foto 4 bei ~70 s: Karte
  // Testgerät auf dem Server wieder abmelden
  fetch("https://mcihdwskqdljescdiinr.supabase.co/functions/v1/device", { method: "POST", headers: { "Content-Type": "application/json", apikey: "sb_publishable_ijaVxe5ZB9EP-11GiY9-cQ_VCOocDVo" }, body: JSON.stringify({ action: "gone", device: window.drivoApp?.device }) }).catch(() => {});
})();
