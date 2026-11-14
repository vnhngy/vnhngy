#!/usr/bin/env python3
"""Baut aus der Web-Fassung (src/source.html, gespeichert aus dem Claude-Artifact) die Handy-App in www/.

Aufruf:  python3 tools/build_www.py            (Name, App-Kennung und Version stehen in app.config.json)

Was hier passiert:
  - Laufzeit für das Handy (src/app-runtime.js) statt der Claude-Oberfläche: Daten nur auf dem Gerät,
    Preise vom eigenen Server (Supabase), Fotos und Exporte über das Handy.
  - App-Name und Logo überall ersetzen, Einladungscode aus, Ort bleibt auf dem Gerät gespeichert.
  - Datenschutzerklärung für die App (Deutsch und Englisch), pdf-lib aus der App statt aus dem Netz.
  - Karte (media/osm) und, falls vorhanden, Anleitung (media/tut) mitliefern.
  - capacitor.config.json passend schreiben.
Jede Ersetzung prüft, dass ihre Stelle genau so oft vorkommt wie erwartet; sonst bricht der Bau mit einer Meldung ab.
"""
import json, os, re, shutil, sys, html as _html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import logo as LOGO

CFG = json.load(open(os.path.join(ROOT, "app.config.json"), encoding="utf-8"))
NAME, APP_ID, VER = CFG["name"], CFG["appId"], CFG["version"]
OP = CFG["operator"]
WWW = os.path.join(ROOT, "www")
src = open(os.path.join(ROOT, "src", "source.html"), encoding="utf-8").read()

def sub(old, new, count=1, regex=False):
    """Ersetzt old durch new und prüft die Anzahl der Fundstellen."""
    global src
    n = len(re.findall(old, src)) if regex else src.count(old)
    if n != count:
        sys.exit(f"Bau abgebrochen: '{old[:70]}' kommt {n}-mal vor, erwartet {count}. Hat sich die Web-Fassung geändert?")
    src = re.sub(old, new, src) if regex else src.replace(old, new)

# ---------- 1. Daten, die wörtlich "Drivo" bleiben müssen (vor dem Umbenennen schützen) ----------
# Sicherungen aus der Web-Fassung (app:"Drivo") lassen sich in der App wieder einlesen.
sub('o.app==="Drivo"', '(o.app==="Dri\\u0076o"||o.app==="__APPNAME__")')
# localStorage-Schlüssel ("drivo.…") bleiben klein geschrieben und sind davon nicht betroffen.

# ---------- 2. App-Name ----------
n_brand = src.count("Drivo")
src = src.replace("Drivo", NAME).replace("__APPNAME__", NAME)

# ---------- 3. Logo (drei Stellen: Intro, Startbild, Kopfzeile) ----------
svgs = list(re.finditer(r'(<svg[^>]*viewBox="0 0 1024 1024"[^>]*>)(.*?)(</svg>)', src, re.S))
if len(svgs) != 3: sys.exit(f"Bau abgebrochen: {len(svgs)} Logo-Grafiken gefunden, erwartet 3.")
for i, m in reversed(list(enumerate(svgs))):
    pid = f"cl{i}"
    inner = LOGO.defs(pid) + f'<rect width="1024" height="1024" fill="url(#{pid}1)"/>' + LOGO.mark(pid)
    src = src[:m.start(2)] + inner + src[m.end(2):]

# ---------- 4. Laufzeit fürs Handy laden, bevor das App-Skript startet ----------
sub("<head>", '<head><script src="app-runtime.js"></script>')
SMOKE = os.environ.get("SMOKE") == "1"          # nur automatischer Test: App bedient sich selbst
if SMOKE: sub("</body></html>", '<script src="smoke.js"></script></body></html>')

# ---------- 5. Kein Einladungscode in der App ----------
sub("async function gateCheck(){\n  let need = false;", "async function gateCheck(){\n  if (window.drivoApp){ setGate(false); return; }\n  let need = false;")

# ---------- 6. Ort bleibt auf dem Gerät gespeichert (die Web-Fassung merkt ihn sich nur für die Sitzung) ----------
sub("const {query:_q, rad:_r, ts:_t, ...keepSub} = body;",
    "const keepSub = window.drivoApp ? {...body} : (({query:_q, rad:_r, ts:_t, ...k}) => k)(body);")
sub("const {query:_oq, rad:_or, ts:_ot, ...keep} = stored || {};",
    "const {query:_oq, rad:_or, ts:_ot, ...keep0} = stored || {}; const keep = window.drivoApp ? {...(stored||{})} : keep0;")
sub("if (stored && stored.query && sharedWritable){", "if (!window.drivoApp && stored && stored.query && sharedWritable){")
# Nach einem Ortswechsel holt der Server die Preise selbst (Funktion "device"), ohne Betreiber-Auslöser.
sub("if (!owner){ fetchNote = null; render(); return; }", "if (!owner && !window.drivoApp){ fetchNote = null; render(); return; }")
sub("async function fireNow(text){", 'async function fireNow(text){\n  if (window.drivoApp){ clearTimeout(fetchTimer); fetchTimer = setTimeout(()=>{ if (fetchNote){ fetchNote = null; render(); } }, 4*60*1000); const t0 = Date.now(), iv = setInterval(()=>{ if (live || Date.now()-t0 > 4*60*1000){ clearInterval(iv); if (live && fetchNote){ fetchNote = null; render(); } } }, 1000); return T("Wird abgerufen. Das dauert ein bis drei Minuten."); }')

# ---------- 7. Speicherort-Hinweis ----------
sub('const where = storeMode==="db" ?', 'const where = window.drivoApp ? T("Deine Daten bleiben nur auf diesem Handy.") : storeMode==="db" ?')
sub("const I18N = {en:{}, vi:{}};", 'const I18N = {en:{}, vi:{}};\nObject.assign(I18N.en,{"Deine Daten bleiben nur auf diesem Handy.":"Your data stays on this phone only."});')

# ---------- 8. pdf-lib liegt in der App ----------
sub("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", "vendor/pdf-lib.min.js")

# ---------- 9. Datenschutzerklärung der App (Deutsch und Englisch) ----------
def ds(lang):
    t = open(os.path.join(ROOT, "src", f"privacy.{lang}.html"), encoding="utf-8").read().replace("__APP__", NAME)
    return t.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
i = src.find("const DS_HTML = `"); j = src.find("`;", i)
if i < 0 or j < 0: sys.exit("Bau abgebrochen: Datenschutztext (DS_HTML) nicht gefunden.")
src = src[:i] + "const DS_HTML = `" + ds("de") + "`;\nconst DS_HTML_EN = `" + ds("en") + src[j:]
sub('const note = LANG !== "de" ? `<p class="dsx-lang">${T("Diese Datenschutzerklärung ist nur auf Deutsch verfügbar.")}</p>` : "";', 'const note = "";')
sub('DS_HTML.replace("__DS_NAME__",',
    '(LANG === "de" ? DS_HTML : DS_HTML_EN).replace("__DEVICE__", window.drivoApp ? (LANG === "de" ? "Deine Gerätekennung: " : "Your device ID: ") + "<code style=\\"user-select:all;-webkit-user-select:all\\">" + window.drivoApp.device + "</code>" : "").replace("__DS_NAME__",')
sub('const DS_NAME = "Cong Vinh Nguyen", DS_ADDR = "Kehrhüttenstraße 36, 74078 Heilbronn", DS_MAIL = "congvinhn779@gmail.com";',
    f'const DS_NAME = {json.dumps(OP["name"], ensure_ascii=False)}, DS_ADDR = {json.dumps(OP["address"], ensure_ascii=False)}, DS_MAIL = {json.dumps(OP["email"])};')

# ---------- 10. Version ----------
sub('const APP_VER = "1.0.0";', f'const APP_VER = {json.dumps(VER)};')

# ---------- 11. Sichere Ränder: auf Android liefert Capacitor --safe-area-inset-* (ältere WebViews kennen env() nicht) ----------
n_env = 0
def env_fix(m):
    global n_env; n_env += 1
    side, fb = m.group(1), (m.group(2) or "0px").strip()
    return f"var(--safe-area-inset-{side},env(safe-area-inset-{side},{fb}))"
src = re.sub(r"env\(safe-area-inset-(top|bottom|left|right)(?:,([^()]*))?\)", env_fix, src)

# ---------- 12. Anleitung: nur mit Videos/Bildern im neuen Namen (media/tut), sonst ausblenden ----------
TUT = os.path.join(ROOT, "media", "tut")
has_tut = os.path.isdir(TUT) and any(f.endswith(".mp4") for f in os.listdir(TUT))
if has_tut:
    src = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: f"tut/{m.group(1)}" + (".mp4" if os.path.exists(os.path.join(TUT, m.group(1) + ".mp4")) else ".jpg"), src)
    sub('"/_blob/"+x', '"tut/"+x+".jpg"', count=src.count('"/_blob/"+x'))
else:
    sub("</head>", "<style>.helpbtn,.splash-help{display:none!important}</style></head>")
    src = re.sub(r' poster="/_blob/[0-9a-f]{32}"', "", src)

# ---------- schreiben ----------
if os.path.isdir(WWW): shutil.rmtree(WWW)
os.makedirs(os.path.join(WWW, "vendor"))
open(os.path.join(WWW, "index.html"), "w", encoding="utf-8").write(src)
shutil.copy(os.path.join(ROOT, "src", "app-runtime.js"), WWW)
if SMOKE: shutil.copy(os.path.join(ROOT, "tools", "smoke.js"), WWW)
shutil.copytree(os.path.join(ROOT, "media", "osm"), os.path.join(WWW, "osm"))
if has_tut: shutil.copytree(TUT, os.path.join(WWW, "tut"))
pdflib = next((f for f in (os.path.join(ROOT, "node_modules", "pdf-lib", "dist", "pdf-lib.min.js"), os.path.join(ROOT, "vendor", "pdf-lib.min.js")) if os.path.exists(f)), None)
if pdflib: shutil.copy(pdflib, os.path.join(WWW, "vendor", "pdf-lib.min.js"))
elif os.environ.get("CI"): sys.exit("Bau abgebrochen: pdf-lib fehlt (npm install vergessen?).")
else: print("Hinweis: pdf-lib fehlt (kommt mit npm install). Ohne die Datei gehen PDFs nicht.")

cap = {
  "appId": APP_ID, "appName": NAME, "webDir": "www",
  "backgroundColor": CFG["colors"]["head"],
  "ios": {"contentInset": "never", "backgroundColor": CFG["colors"]["head"], "scrollEnabled": True},
  "android": {"backgroundColor": CFG["colors"]["head"]},
  "plugins": {"SystemBars": {"insetsHandling": "css", "style": "DARK", "initialViewportFitValueHint": "cover"}},
}
json.dump(cap, open(os.path.join(ROOT, "capacitor.config.json"), "w"), indent=2)
print(f"Fertig: {NAME} {VER} ({APP_ID}) · Name {n_brand}× ersetzt · {n_env} Sicherheitsränder · Anleitung {'dabei' if has_tut else 'ausgeblendet'} · www/ {sum(len(f) for _, _, f in os.walk(WWW))} Dateien")
