# Autobuch

Web-App für das iPhone (PWA) für eine Mercedes A 180 (W176, 2015): Tankbuch,
Wartungsplaner und Kostenübersicht. Kein Mac, kein App Store, kein Server nötig.
Alle Daten bleiben auf dem iPhone (localStorage).

## Funktionen
- **Tanken:** Verbrauch (l/100 km) zwischen vollen Tankfüllungen, Ø-Literpreis
- **Wartung:** Service A/B (ASSYST), HU, Bremsflüssigkeit, Reifenwechsel, Zündkerzen
  und eigene Termine. Die App zeigt, was überfällig oder bald fällig ist
- **Fahrtenbuch:** Fahrten mit Art (privat/geschäftlich/Arbeitsweg), Zweck und km-Stand,
  Jahresauswertung, Hinweis auf Lücken, Export als CSV für Excel
- **Fahrt aufzeichnen (GPS):** Live-Tacho, Strecke, Fahrzeit, Ø-/Höchsttempo, Erkennung von starkem
  Bremsen/Beschleunigen, Fahrstil-Note, Streckenskizze, Spritkosten-Schätzung, Übernahme ins Fahrtenbuch
- **Reifen:** Reifensätze mit Größe, DOT/Alter, Profiltiefe je Rad, Lagerort und gefahrenen km;
  Warnungen bei wenig Profil, alten Reifen oder fehlendem Schneeflocken-Symbol
- **Notfall & Hilfe:** Notruf/Polizei mit einem Tipp, eigene Versicherungs- und Pannennummern,
  Unfall-Checkliste, Unfall dokumentieren (Fotos, Standort, Gegner, Zeugen) und als Bericht teilen,
  Warnleuchten-Lexikon mit Suche
- **Kosten:** inkl. Fotos von Belegen und Rechnungen (in IndexedDB, verkleinert)
- **Kosten (Übersicht):** Ausgaben nach Kategorie, Kosten pro km, Verlauf der letzten 12 Monate
- **Spritpreise:** günstigste geöffnete Tankstellen im Umkreis, mit Route in Apple Karten
  (kostenloser API-Schlüssel von [Tankerkönig](https://creativecommons.tankerkoenig.de/) nötig)
- **Parkplatz:** Standort merken, Notiz, Parkuhr-Countdown, Fußweg zurück zum Auto
- **Kalender:** Fälligkeiten als .ics-Datei mit Erinnerung 7 Tage vorher in den iPhone-Kalender
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
