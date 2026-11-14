/* Handy-App (iPhone/Android, Capacitor): ersetzt die Laufzeit der Claude-Oberfläche (window.claude.use), damit die App-Oberfläche
   unverändert bleibt.
   - Deine Daten (Autos, Tankungen, Service, Kosten, Sicherungen, Fotos) liegen nur auf dem Handy:
     im App-Speicher (Capacitor Filesystem, Ordner "drivo"), im Browser ersatzweise in localStorage/IndexedDB.
   - Vom Server kommen nur Preise, Öffnungszeiten, Wetter und Leasing-Angebote (Supabase, nur lesen).
   - Dein Ort (Ortsname/PLZ oder Koordinaten, Umkreis, Arbeitsweg) geht unter einer zufälligen Gerätekennung an den
     Server, damit dort die passenden Preise abgerufen werden (Funktion "device"). Sonst nichts. */
(() => {
  "use strict";
  const SB_URL = "https://mcihdwskqdljescdiinr.supabase.co";
  const SB_KEY = "sb_publishable_ijaVxe5ZB9EP-11GiY9-cQ_VCOocDVo";
  const POLL_MS = 3 * 60 * 1000;          // Live-Daten im Vordergrund alle 3 Minuten neu lesen
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && typeof CAP.isNativePlatform === "function" && CAP.isNativePlatform());
  const plugin = n => { try { return NATIVE ? CAP.registerPlugin(n) : null; } catch { return null; } };
  const FS = plugin("Filesystem"), SHARE = plugin("Share"), APP = plugin("App"), LAUNCH = plugin("AppLauncher");
  const DIR = "DATA", ROOT = "drivo";
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: k => { try { localStorage.removeItem(k); } catch {} } };
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));

  /* ---------- Gerätekennung (zufällig, nur für den Preisabruf am Wohnort) ---------- */
  const uuid4 = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  let DEV = ls.get("drivo.device");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(DEV || "")) { DEV = uuid4(); ls.set("drivo.device", DEV); }

  /* ---------- Dateien auf dem Handy ---------- */
  const files = {
    async readText(name) {
      if (FS) { try { return (await FS.readFile({ path: `${ROOT}/${name}`, directory: DIR, encoding: "utf8" })).data; } catch {} }
      return ls.get("drivo.app." + name);
    },
    async writeText(name, text) {
      let ok = false;
      if (FS) { try { await FS.writeFile({ path: `${ROOT}/${name}`, data: text, directory: DIR, encoding: "utf8", recursive: true }); ok = true; } catch {} }
      // Zweite Kopie im WebView-Speicher (klein genug): falls die Datei einmal nicht lesbar ist.
      const mirrored = text.length < 2_500_000 && ls.set("drivo.app." + name, text);
      if (!ok && !mirrored) throw err("quota_exceeded", "Speicher voll");
    },
    async remove(name) {
      if (FS) { try { await FS.deleteFile({ path: `${ROOT}/${name}`, directory: DIR }); } catch {} }
      ls.del("drivo.app." + name);
    },
  };
  async function readJson(name, fallback) {
    const t = await files.readText(name);
    if (t) { try { return JSON.parse(t); } catch {} }
    const m = ls.get("drivo.app." + name);   // Datei kaputt: Kopie nehmen
    if (m) { try { return JSON.parse(m); } catch {} }
    return fallback;
  }

  /* ---------- Fotos: als Datei im App-Speicher, angezeigt über die /_blob/<id>-Adressen der App ---------- */
  const PHOTO_RE = /^[0-9a-f]{32}$/;
  const objUrls = new Map();                    // nur Browser-Ersatz
  let idb = null;
  function idbOpen() {
    if (idb) return idb;
    idb = new Promise((res, rej) => { const r = indexedDB.open("drivo-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("p"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return idb;
  }
  const idbDo = async (mode, fn) => { const d = await idbOpen(); return new Promise((res, rej) => { const t = d.transaction("p", mode), q = fn(t.objectStore("p")); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const photos = {
    async put(blob) {
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");
      if (FS) await FS.writeFile({ path: `${ROOT}/photos/${id}`, data: await b64(blob), directory: DIR, recursive: true });
      else await idbDo("readwrite", s => s.put(blob, id));
      return id;
    },
    async url(id) {
      if (!PHOTO_RE.test(id)) return null;
      if (FS) {
        try { const { uri } = await FS.getUri({ path: `${ROOT}/photos/${id}`, directory: DIR }); await FS.stat({ path: `${ROOT}/photos/${id}`, directory: DIR }); return CAP.convertFileSrc(uri); }
        catch { return null; }
      }
      if (objUrls.has(id)) return objUrls.get(id);
      try { const b = await idbDo("readonly", s => s.get(id)); if (!b) return null; const u = URL.createObjectURL(b); objUrls.set(id, u); return u; } catch { return null; }
    },
    async del(id) {
      if (!PHOTO_RE.test(id)) return;
      if (FS) { try { await FS.deleteFile({ path: `${ROOT}/photos/${id}`, directory: DIR }); } catch {} }
      else { try { await idbDo("readwrite", s => s.delete(id)); } catch {} const u = objUrls.get(id); if (u) { URL.revokeObjectURL(u); objUrls.delete(id); } }
    },
  };
  // Die App schreibt Fotos als <img src="/_blob/<id>">. Mitgelieferte Dateien (Anleitung) liegen wirklich unter /_blob/,
  // eigene Fotos werden auf ihre Datei im App-Speicher umgelenkt.
  const fixImg = async el => {
    const src = el.getAttribute("src") || "", m = /^\/_blob\/([0-9a-f]{32})$/.exec(src);
    if (!m || el.dataset.blobFixed === src) return;
    el.dataset.blobFixed = src;
    const u = await photos.url(m[1]);
    if (u && el.getAttribute("src") === src) el.setAttribute("src", u), el.dataset.blobFixed = u;
  };
  const scan = root => { if (root.tagName === "IMG") fixImg(root); root.querySelectorAll?.('img[src^="/_blob/"]').forEach(fixImg); };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === "attributes") fixImg(m.target); else m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)); } })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  // fetch("/_blob/<id>") (z. B. für den PDF-Bericht) ebenfalls auf die Datei umlenken.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const u = typeof input === "string" ? input : input?.url || "";
    const m = /^\/_blob\/([0-9a-f]{32})$/.exec(u);
    if (m) { const real = await photos.url(m[1]); if (real) return origFetch(real, init); }
    return origFetch(input, init);
  };

  /* ---------- Live-Daten vom Server (nur lesen) ---------- */
  async function sbGet(path) {
    const r = await origFetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw err("unavailable", `Server ${r.status}`);
    return r.json();
  }
  const liveCache = JSON.parse(ls.get("drivo.app.live") || "{}");   // letzte Werte für den Start ohne Netz
  const saveLiveCache = () => { const keep = {}; for (const [k, v] of Object.entries(liveCache)) if (/^(meta|hours|wx|leasing|r1[05]-)/.test(k)) keep[k] = v; ls.set("drivo.app.live", JSON.stringify(keep)); };
  let geoMine = JSON.parse(ls.get("drivo.app.geo") || "{}");          // eigene Orte, vom Server aufgelöst
  async function liveRead(key) {
    if (key === "geo") return Object.keys(geoMine).length ? clone(geoMine) : null;
    if (key === "keys" || key === "keybind") return null;               // keine Einladungscodes in der App
    if (/^r1[05]-\d+-\d+$/.test(key)) {
      const [row] = await sbGet(`regions?key=eq.${key}&select=data`);
      liveCache[key] = row ? row.data : null; saveLiveCache(); return liveCache[key];
    }
    if (/^[a-z]{2,12}$/.test(key)) {
      const [row] = await sbGet(`docs?path=eq.live/${key}&select=data`);
      liveCache[key] = row ? row.data : null; saveLiveCache(); return liveCache[key];
    }
    return null;
  }

  /* ---------- Ort des Geräts melden ---------- */
  let subLocal = JSON.parse(ls.get("drivo.app.sub") || "null");
  let amenLocal = JSON.parse(ls.get("drivo.app.amen") || "null");   // eigene Markierungen/Bewertungen von Tankstellen
  let placeBusy = null;
  async function sendPlace() {
    const s = subLocal || {};
    const body = { action: "place", device: DEV, sub: { query: s.query, rad: s.rad, work: s.work, route: s.route } };
    try {
      const r = await origFetch(`${SB_URL}/functions/v1/device`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.geo) { geoMine = { ...geoMine, ...j.geo }; ls.set("drivo.app.geo", JSON.stringify(geoMine)); notifyAll("live/geo"); notifyAll("ugeo/" + DEV); }
      if (j?.ok) { ls.set("drivo.app.placeSent", String(Date.now())); setTimeout(() => notifyLive(), j.kicked ? 8000 : 0); if (j.kicked) for (const t of [30e3, 75e3, 150e3]) setTimeout(() => notifyLive(), t); }
      return j;
    } catch { return null; }
  }
  function queuePlace() { clearTimeout(placeBusy); placeBusy = setTimeout(sendPlace, 400); }

  /* ---------- Beobachter (onSnapshot) ---------- */
  const watchers = new Map();                   // Pfad → Set von Rückrufen
  const snap = (id, data) => ({ exists: data != null, id, data: () => clone(data) });
  async function readPath(path) {
    const p = path.split("/");
    if (p[0] === "live") return liveRead(p[1]);
    if (p[0] === "subs") return subLocal;
    if (p[0] === "ugeo") return Object.keys(geoMine).length ? clone(geoMine) : null;
    if (p[0] === "data" && p[1] === "users" && p[3] === "drivo" && p.length === 4) return readJson("data.json", null);
    if (p[0] === "data" && p[1] === "users" && p[3] === "drivo" && p[4] === "backups" && p.length === 6) return (await readJson("backups.json", {}))[p[5]] || null;
    if (p[0] === "amen" && p[1] === DEV) return amenLocal;
    return null;                                // usage, shared, invites: in der App nicht genutzt
  }
  async function fire(path, cb, errCb) {
    try { cb(snap(path.split("/").pop(), await readPath(path))); }
    catch (e) {
      // Ohne Netz: letzten bekannten Stand liefern, sonst Fehler melden
      const k = path.split("/")[1];
      if (path.startsWith("live/") && k in liveCache) cb(snap(k, liveCache[k])); else errCb && errCb(e);
    }
  }
  function notifyAll(path) { const set = watchers.get(path); if (set) for (const w of set) fire(path, w.cb, w.errCb); }
  function notifyLive() { for (const path of watchers.keys()) if (path.startsWith("live/") && path !== "live/geo") notifyAll(path); }
  setInterval(() => { if (!document.hidden) notifyLive(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { notifyLive(); pingSeen(); } });
  APP?.addListener?.("resume", () => { notifyLive(); pingSeen(); });
  // Einmal am Tag melden, dass das Gerät noch da ist (sonst holt der Server nach 7 Tagen keine Preise mehr).
  function pingSeen() { if (subLocal?.query && Date.now() - (+ls.get("drivo.app.placeSent") || 0) > 20 * 36e5) queuePlace(); }

  /* ---------- Dokument-Referenzen wie in der Claude-Ablage ---------- */
  function docRef(path) {
    const p = path.split("/"), id = p[p.length - 1];
    const isUser = p[0] === "data" && p[1] === "users" && p[3] === "drivo" && p.length === 4;
    const isBackup = p[0] === "data" && p[1] === "users" && p[3] === "drivo" && p[4] === "backups" && p.length === 6;
    const ref = {
      id, path,
      async get() { return snap(id, await readPath(path)); },
      async set(obj) {
        obj = clone(obj);
        if (isUser) { await files.writeText("data.json", JSON.stringify(obj)); return; }
        if (isBackup) { const all = await readJson("backups.json", {}); all[id] = obj; await files.writeText("backups.json", JSON.stringify(all)); return; }
        if (p[0] === "subs") { subLocal = obj; ls.set("drivo.app.sub", JSON.stringify(obj)); notifyAll(path); queuePlace(); return; }
        if (p[0] === "live" && id === "geo") { geoMine = { ...geoMine, ...obj }; ls.set("drivo.app.geo", JSON.stringify(geoMine)); notifyAll(path); return; }
        if (p[0] === "ugeo") { geoMine = obj || {}; ls.set("drivo.app.geo", JSON.stringify(geoMine)); notifyAll(path); return; }
        if (p[0] === "amen" && id === DEV) { amenLocal = obj; ls.set("drivo.app.amen", JSON.stringify(obj)); return; }
        // usage, shared, invites, live/keys: in der App ohne Wirkung
      },
      async update(obj) { const cur = (await readPath(path)) || {}; return ref.set({ ...cur, ...obj }); },
      async delete() {
        if (isUser) { await files.remove("data.json"); return; }
        if (isBackup) { const all = await readJson("backups.json", {}); delete all[id]; await files.writeText("backups.json", JSON.stringify(all)); return; }
        if (p[0] === "subs") {
          subLocal = null; ls.del("drivo.app.sub"); notifyAll(path);
          origFetch(`${SB_URL}/functions/v1/device`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY }, body: JSON.stringify({ action: "gone", device: DEV }) }).catch(() => {});
          return;
        }
        if (p[0] === "ugeo") { geoMine = {}; ls.del("drivo.app.geo"); }
        if (p[0] === "amen" && id === DEV) { amenLocal = null; ls.del("drivo.app.amen"); }
      },
      onSnapshot(cb, errCb) {
        const w = { cb, errCb };
        if (!watchers.has(path)) watchers.set(path, new Set());
        watchers.get(path).add(w);
        // Ohne Netz sofort den letzten Stand zeigen, dann frisch laden
        const k = p[1];
        if (p[0] === "live" && k in liveCache) setTimeout(() => cb(snap(k, liveCache[k])), 0);
        setTimeout(() => fire(path, cb, errCb), 0);
        return () => { watchers.get(path)?.delete(w); };
      },
      collection(name) { return collRef(`${path}/${name}`); },
    };
    return ref;
  }
  function collRef(path) {
    const isBackups = /^data\/users\/[^/]+\/drivo\/backups$/.test(path), isAmen = path === "amen";
    let lim = 1000, ord = null;
    const q = {
      doc: id => docRef(`${path}/${id}`),
      orderBy(field, dir = "asc") { ord = [field, dir]; return q; },
      limit(n) { lim = n; return q; },
      where() { return q; },
      async get() {
        let docs = [];
        if (isBackups) docs = Object.entries(await readJson("backups.json", {})).map(([id, d]) => ({ id, d }));
        if (isAmen && amenLocal) docs = [{ id: DEV, d: amenLocal }];
        if (ord) docs.sort((a, b) => { const x = a.d?.[ord[0]], y = b.d?.[ord[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (ord[1] === "desc" ? -1 : 1); });
        docs = docs.slice(0, lim);
        return { empty: !docs.length, size: docs.length, docs: docs.map(({ id, d }) => snap(id, d)) };
      },
      onSnapshot(cb) { q.get().then(cb).catch(() => cb({ empty: true, size: 0, docs: [] })); return () => {}; },
    };
    return q;
  }
  const db = { doc: docRef, collection: collRef };

  /* ---------- Weitere Schnittstellen ---------- */
  const user = { id: async () => DEV, can: async () => true, isOwner: async () => false, canEdit: async () => false };
  const assets = {
    async upload(blob) { try { return { id: await photos.put(blob) }; } catch (e) { throw err("quota_or_state", e?.message); } },
    async delete(id) { await photos.del(id); },
  };
  const downloads = {
    async save({ filename, data }) {
      const name = String(filename || "drivo").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
      if (FS && SHARE) {
        const { uri } = await FS.writeFile({ path: `export/${name}`, data: await b64(data), directory: "CACHE", recursive: true });
        await SHARE.share({ title: name, files: [uri] }).catch(e => { if (!/cancel/i.test(String(e?.message))) throw e; });
        return;
      }
      const url = URL.createObjectURL(data), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
  const SERVICES = { db, user, assets, downloads };
  window.claude = { use: async name => SERVICES[name] || null };
  window.drivoApp = {
    native: NATIVE, device: DEV,
    refresh: () => { sendPlace(); notifyLive(); },
    // „Alle Daten löschen“: auch Fotos und Sicherungen auf dem Handy entfernen
    async wipe() { await files.remove("data.json"); await files.remove("backups.json"); if (FS) { try { await FS.rmdir({ path: `${ROOT}/photos`, directory: DIR, recursive: true }); } catch {} } },
  };
  /* ---------- Links nach außen (Karten, Angebote, E-Mail, Telefon) in der passenden App öffnen ---------- */
  const external = href => {
    try { const u = new URL(href, location.href); return /^(mailto|tel|sms|maps|geo|comgooglemaps):$/.test(u.protocol) || (/^https?:$/.test(u.protocol) && u.origin !== location.origin); }
    catch { return false; }
  };
  const openOut = href => { if (LAUNCH) LAUNCH.openUrl({ url: new URL(href, location.href).href }).catch(() => {}); else window.open(href, "_blank", "noopener"); };
  if (NATIVE) {
    document.addEventListener("click", e => {
      const a = e.target.closest?.("a[href]"); if (!a || a.hasAttribute("download")) return;
      const href = a.getAttribute("href"); if (!href || href.startsWith("#") || !external(href)) return;
      e.preventDefault(); openOut(href);
    }, true);
    const winOpen = window.open.bind(window);
    window.open = (url, ...rest) => { if (url && external(String(url))) { openOut(String(url)); return null; } return winOpen(url, ...rest); };
  }

  /* ---------- Android: Zurück-Taste schließt zuerst Fenster, dann zur Übersicht, dann App in den Hintergrund ---------- */
  APP?.addListener?.("backButton", () => {
    const open = sel => { const el = document.querySelector(sel); return el && !el.hidden ? el : null; };
    const click = sel => { const b = document.querySelector(sel); if (b) { b.click(); return true; } return false; };
    if (open("#lb") && click("#lb .lb-close")) return;
    if (open("#tut") && click('#tut [data-act="tutclose"]')) return;
    if (open("#dsx") && click('#dsx [data-act="dsclose"]')) return;
    if (open("#sheet") && click("#sheet .sheet-x")) return;
    if (open("#moreMenu") && click("#moreBg")) return;
    const first = document.querySelector("#tabs [data-tab]"), cur = document.querySelector('#tabs [aria-selected="true"]');
    if (first && cur && first !== cur) { first.click(); return; }
    APP.minimizeApp?.().catch?.(() => {});
  });

  // Ort beim Start einmal melden (falls schon gewählt), damit der Server die Region aktiv hält.
  setTimeout(pingSeen, 3000);
})();
