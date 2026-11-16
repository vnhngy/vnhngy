# Carlume – Handy-App (iPhone und Android)

Die App entsteht aus der Web-Fassung (Claude-Artifact) und wird mit [Capacitor](https://capacitorjs.com) zu einer echten App für den App Store und Google Play.

- **Deine Daten bleiben auf dem Handy.** Autos, Tankungen, Service, Kosten und Fotos liegen nur im Speicher der App.
- **Vom Server kommen nur Preise, Öffnungszeiten, Wetter und Leasing-Angebote** (Supabase, nur lesen). Der Ort für den Preisabruf geht mit einer zufälligen Gerätekennung an die Funktion `device`.
- **Kein Konto, kein Einladungscode, keine KI-Funktionen** in Version 1.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `app.config.json` | Name (Carlume), App-Kennung (de.vinhnguyen.carlume), Version, Betreiber-Angaben |
| `src/source.html` | Web-Fassung, gespeichert aus dem Artifact |
| `src/app-runtime.js` | Ersatz für die Claude-Laufzeit: Speicher auf dem Gerät, Server, Fotos, Teilen, Links, Zurück-Taste |
| `src/privacy.de.html`, `src/privacy.en.html` | Datenschutzerklärung der App |
| `src/glass.css`, `src/glass.js` | Liquid-Glass-Design und flüssige Bewegungen (letzte Stil-Schicht, gleitende Linse in Leiste und Unterreitern, Haptik) |
| `tools/build_www.py` | baut `www/` (App-Inhalt) und `capacitor.config.json` |
| `tools/patch_native.py` | passt die erzeugten iOS-/Android-Projekte an (Berechtigungen, Version, nur iPhone) |
| `native-ios/`, `tools/ios_widget.rb` | iPhone-Widget (Start- und Sperrbildschirm): Swift-Code, Widget-Ziel im Xcode-Projekt, App-Gruppe `group.de.vinhnguyen.carlume` |
| `tools/logo.py`, `assets/` | Logo, App-Symbol und Startbild |
| `media/osm/` | Kartenkacheln Deutschland (OpenStreetMap, ODbL) |
| `.github/workflows/carlume-app.yml` | automatischer Bau bei GitHub |

## Neue Version der Web-Fassung übernehmen

1. Artifact-HTML als `src/source.html` speichern.
2. `python3 tools/build_www.py` – bricht mit einer klaren Meldung ab, falls sich eine angepasste Stelle geändert hat.
3. In `app.config.json` die Version erhöhen, committen, pushen. GitHub baut beide Apps.

## Bauen bei GitHub

- **Bei jedem Push:** Android-Test-APK (zum Installieren auf dem Handy) und iPhone-Simulator-Bau.
- **Von Hand mit „release“:** signierte Play-Store-Datei (AAB) und Upload zu TestFlight. Dafür braucht es die Secrets aus `STORE-ANLEITUNG.md`.
