#!/usr/bin/env python3
"""Passt die von Capacitor erzeugten Projekte an (nach `npx cap add ios|android`).

Aufruf:  python3 tools/patch_native.py ios      bzw.   python3 tools/patch_native.py android

iOS:     Texte für die Berechtigungen (Standort, Kamera, Fotos), keine Verschlüsselungs-Exportpflicht,
         Version und Build-Nummer, nur iPhone (kein iPad, sonst verlangt Apple iPad-Screenshots), Hochformat.
Android: Standort-Berechtigung, Version, Rand-bis-Rand-Anzeige für die sicheren Ränder (Capacitor 8).
"""
import json, os, plistlib, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "app.config.json"), encoding="utf-8"))
NAME, APP_ID, VER, BUILD = CFG["name"], CFG["appId"], CFG["version"], int(os.environ.get("BUILD_NUMBER") or CFG["build"])

def must(cond, msg):
    if not cond: sys.exit("Anpassung abgebrochen: " + msg)

def ios():
    p = os.path.join(ROOT, "ios", "App", "App", "Info.plist")
    must(os.path.exists(p), "ios/App/App/Info.plist fehlt – erst `npx cap add ios` ausführen.")
    with open(p, "rb") as f: pl = plistlib.load(f)
    pl.update({
        "CFBundleDisplayName": NAME,
        "CFBundleDevelopmentRegion": "de",
        "CFBundleLocalizations": ["de", "en"],
        "NSLocationWhenInUseUsageDescription": f"{NAME} nutzt deinen Standort nur, wenn du „Mein Standort“ oder den Unfallbericht antippst: für Spritpreise in deiner Nähe bzw. den Unfallort.",
        "NSCameraUsageDescription": "Für Fotos von deinem Auto, von Belegen und von Unfallschäden. Die Fotos bleiben auf deinem Gerät.",
        "NSPhotoLibraryUsageDescription": "Damit du Fotos von deinem Auto und von Belegen auswählen kannst. Sie bleiben auf deinem Gerät.",
        "ITSAppUsesNonExemptEncryption": False,
        "UIViewControllerBasedStatusBarAppearance": True,
        "UIStatusBarStyle": "UIStatusBarStyleLightContent",
        "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
    })
    pl.pop("UISupportedInterfaceOrientations~ipad", None)
    with open(p, "wb") as f: plistlib.dump(pl, f)
    pj = os.path.join(ROOT, "ios", "App", "App.xcodeproj", "project.pbxproj")
    s = open(pj, encoding="utf-8").read()
    n1 = len(re.findall(r"MARKETING_VERSION = [^;]+;", s)); n2 = len(re.findall(r"CURRENT_PROJECT_VERSION = [^;]+;", s))
    must(n1 and n2, "Versionsfelder im Xcode-Projekt nicht gefunden.")
    s = re.sub(r"MARKETING_VERSION = [^;]+;", f"MARKETING_VERSION = {VER};", s)
    s = re.sub(r"CURRENT_PROJECT_VERSION = [^;]+;", f"CURRENT_PROJECT_VERSION = {BUILD};", s)
    s = re.sub(r'TARGETED_DEVICE_FAMILY = "?[0-9,]+"?;', "TARGETED_DEVICE_FAMILY = 1;", s)
    s = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;", f"PRODUCT_BUNDLE_IDENTIFIER = {APP_ID};", s)
    open(pj, "w", encoding="utf-8").write(s)
    print(f"iOS angepasst: {NAME} {VER} ({BUILD}), {APP_ID}, nur iPhone, Hochformat")

def android():
    base = os.path.join(ROOT, "android", "app")
    mf = os.path.join(base, "src", "main", "AndroidManifest.xml")
    must(os.path.exists(mf), "AndroidManifest.xml fehlt – erst `npx cap add android` ausführen.")
    s = open(mf, encoding="utf-8").read()
    for perm in ("android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"):
        if perm not in s: s = s.replace("</manifest>", f'    <uses-permission android:name="{perm}" />\n</manifest>')
    if "android.hardware.location.gps" not in s:
        s = s.replace("</manifest>", '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>')
    open(mf, "w", encoding="utf-8").write(s)
    g = os.path.join(base, "build.gradle")
    t = open(g, encoding="utf-8").read()
    must(re.search(r"versionCode \d+", t) and re.search(r'versionName "[^"]*"', t), "versionCode/versionName in build.gradle nicht gefunden.")
    t = re.sub(r"versionCode \d+", f"versionCode {BUILD}", t)
    t = re.sub(r'versionName "[^"]*"', f'versionName "{VER}"', t)
    # Signieren für den Play Store, nur wenn die Schlüsseldatei vorhanden ist (GitHub-Geheimnisse, siehe Anleitung)
    if "carrowRelease" not in t and os.environ.get("ANDROID_KEYSTORE_FILE"):
        t = t.replace("buildTypes {", """signingConfigs {
        carrowRelease {
            storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {""", 1)
        t = re.sub(r"(release\s*\{)", r"\1\n            signingConfig signingConfigs.carrowRelease", t, count=1)
    open(g, "w", encoding="utf-8").write(t)
    # MainActivity: Rand-bis-Rand einschalten, damit Capacitor die sicheren Ränder als CSS-Variablen liefert
    pkg_dir = os.path.join(base, "src", "main", "java", *APP_ID.split("."))
    ma = os.path.join(pkg_dir, "MainActivity.java")
    must(os.path.exists(ma), f"{ma} fehlt.")
    open(ma, "w", encoding="utf-8").write(f"""package {APP_ID};

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }}
}}
""")
    print(f"Android angepasst: {NAME} {VER} ({BUILD}), {APP_ID}, Standort, Rand-bis-Rand")

if __name__ == "__main__":
    {"ios": ios, "android": android}[sys.argv[1]]()
