# Autobuch

Web-App für das iPhone (PWA) für eine Mercedes A 180 (W176, 2015): Tankbuch,
Wartungsplaner und Kostenübersicht. Kein Mac, kein App Store, kein Server nötig.
Alle Daten bleiben auf dem iPhone (localStorage).

## Funktionen
- **Tanken:** Verbrauch (l/100 km) zwischen vollen Tankfüllungen, Ø-Literpreis
- **Wartung:** Service A/B (ASSYST), HU, Bremsflüssigkeit, Reifenwechsel, Zündkerzen
  und eigene Termine. Die App zeigt, was überfällig oder bald fällig ist
- **Kosten:** Ausgaben nach Kategorie, Kosten pro km, Verlauf der letzten 12 Monate
- **Sicherung:** Export/Import als JSON-Datei (z. B. in iCloud Drive)

## Online stellen (GitHub Pages)
1. Auf github.com im Repo: **Settings → Pages**
2. Unter „Branch“ den Branch mit diesem Ordner wählen, Ordner **/ (root)**, **Save**
3. Nach 1–2 Minuten ist die App erreichbar unter
   `https://<benutzername>.github.io/<repo>/autobuch/`

## Aufs iPhone
Link in **Safari** öffnen → **Teilen** → **„Zum Home-Bildschirm“**.

## Lokal testen
```
cd autobuch && python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen.
