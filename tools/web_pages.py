#!/usr/bin/env python3
"""Datenschutz- und Impressum-Seiten für die Webseite der App (gleicher Text wie in der App)."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "app.config.json"), encoding="utf-8")); NAME = CFG["name"]; OP = CFG["operator"]
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "web")
os.makedirs(OUT, exist_ok=True)
CSS = """:root{--bg:#F4F5F6;--fg:#17191B;--muted:#4E5357;--card:#fff;--line:#DADDDE;--accent:#E2620C}
@media (prefers-color-scheme:dark){:root{--bg:#0E0F10;--fg:#ECEDEE;--muted:#AEB3B8;--card:#17191B;--line:#2C3034;--accent:#FF8A3D}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:#1D1F22;color:#F2F3F3;padding:18px 16px}header a{color:inherit;text-decoration:none;font-weight:800;letter-spacing:.3em}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}article{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
h1,h2{line-height:1.2;margin:0 0 6px}h2{font-size:26px}h3{font-size:18px;margin:26px 0 6px}.ds-meta{color:var(--muted);margin-top:0}
a{color:var(--accent)}code{background:var(--bg);padding:1px 5px;border-radius:5px}nav{margin-top:16px;color:var(--muted);font-size:14px}
ul{padding-left:20px}li{margin:4px 0}"""
def page(fn, lang, title, body):
    nav = ('<a href="datenschutz.html">Datenschutz</a> · <a href="impressum.html">Impressum</a> · <a href="privacy.html">Privacy (English)</a>' if lang == "de"
           else '<a href="privacy.html">Privacy</a> · <a href="impressum.html#en">Legal notice</a> · <a href="datenschutz.html">Datenschutz (Deutsch)</a>')
    html = f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · {NAME}</title><style>{CSS}</style></head><body><header><a href="./">{NAME.upper()}</a></header>
<main><article>{body}</article><nav>{nav}</nav></main></body></html>"""
    open(os.path.join(OUT, fn), "w", encoding="utf-8").write(html)
def privacy(lang):
    t = open(os.path.join(ROOT, "src", f"privacy.{lang}.html"), encoding="utf-8").read()
    dev = ("Du findest sie in der App unter Garage → Datenschutz." if lang == "de" else "You can find it in the app under Garage → Privacy.")
    mail = f'<a href="mailto:{OP["email"]}">{OP["email"]}</a>'
    return t.replace("__APP__", NAME).replace("__DS_NAME__", OP["name"]).replace("__DS_ADDR__", OP["address"]).replace("__DS_MAIL__", mail).replace("__DEVICE__", dev)
page("datenschutz.html", "de", "Datenschutzerklärung", privacy("de"))
page("privacy.html", "en", "Privacy Policy", privacy("en"))
imp = f"""<h2>Impressum</h2><p class="ds-meta">Angaben gemäß § 5 DDG</p>
<p>{OP["name"]}<br>{OP["address"]}</p><p>E-Mail: <a href="mailto:{OP["email"]}">{OP["email"]}</a></p>
<p>Verantwortlich für die App {NAME} und diese Webseite: {OP["name"]}, Anschrift wie oben.</p>
<h3>Spritpreise</h3><p>Die Preisdaten stammen von der Markttransparenzstelle für Kraftstoffe (MTS-K) und werden über <a href="https://creativecommons.tankerkoenig.de">Tankerkönig</a> unter der Lizenz CC BY 4.0 bereitgestellt. Alle Angaben ohne Gewähr.</p>
<h3>Karten</h3><p>Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a> (ODbL).</p>
<h2 id="en" style="margin-top:34px">Legal notice</h2><p class="ds-meta">Information pursuant to § 5 DDG (German Digital Services Act)</p>
<p>{OP["name"]}<br>{OP["address"]}<br>Germany</p><p>Email: <a href="mailto:{OP["email"]}">{OP["email"]}</a></p>
<p>Fuel price data: German Market Transparency Unit for Fuels (MTS-K) via Tankerkönig, CC BY 4.0. No guarantee of accuracy. Map data © OpenStreetMap contributors (ODbL).</p>"""
page("impressum.html", "de", "Impressum", imp)
print("Seiten geschrieben nach", OUT, sorted(os.listdir(OUT)))
