# Autobuch

Web-App für das iPhone (PWA) für eine Mercedes A 180 (W176, 2015): Tankbuch,
Wartungsplaner und Kostenübersicht. Kein Mac, kein App Store, kein Server nötig.
Alle Daten bleiben auf dem iPhone (localStorage).

## Funktionen
- **Suche** (Lupe oben rechts): durchsucht Tankbuch, Kosten, Fahrten, Wartung, Reifen, Dokumente, Unfälle, Strafzettel, Werkstätten
- **Übersicht anpassen:** Bereiche und Kacheln ein-/ausblenden und umsortieren
- **Tank-Prognose:** schätzt Tankinhalt und den nächsten Tank-Termin
- **Große Schrift:** übernimmt die iOS-Textgröße
- **Mehrere Fahrzeuge:** über den Fahrzeugnamen oben umschalten; jedes Auto hat eigene Daten
- **Wiederkehrende Kosten:** Versicherung, Steuer, Leasing … werden automatisch gebucht
- **Sicherungs-Erinnerung:** Hinweis auf der Übersicht, wenn die letzte Sicherung > 30 Tage her ist
- **Strafzettel & Fristen:** mit Zahlungsfrist, Foto, Erinnerung und Kalendereintrag
- **Kosten-Export:** alle Ausgaben als CSV für Excel
- **Wertverlauf:** Marktwert, Wertverlust pro Jahr, echte Kosten pro km inkl. Wertverlust
- **Öl & Reifendruck:** Nachfüllen und Kontrollen protokollieren, Ölverbrauch pro 1.000 km
- **Erfolge:** 14 Abzeichen zum Freischalten
- **Einrichtungs-Assistent:** erscheint beim ersten Start (Sprache, Auto, Wartung, Reifen, Notfall);
  jederzeit erneut unter **Mehr → Einrichtungs-Assistent**
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
- **Dokumente:** Fotos von Fahrzeugschein, Führerschein, Versicherungskarte usw. mit Ablaufdatum
- **Verkaufs-Mappe:** druckbarer Bericht (PDF) mit Fahrzeugdaten, Wartung, Rechnungen, km-Verlauf,
  Reifen, Unfällen und Belegfotos
- **Siri & Kurzbefehle:** Links mit `?action=fuel|drive|park|cost|trip|help` öffnen direkt eine Funktion;
  `?action=fuel&l=42,5&eur=74,30&km=98500` füllt das Tankformular vor
- **Statistik:** Jahreswerte, Verbrauch Sommer/Winter, Spritpreis-Extreme, Jahresvergleich, Kostenprognose
- **Checklisten:** Urlaubsfahrt, Winter, Frühjahr, Werkstattbesuch, Verkauf (zum Abhaken)
- **Reiseplaner:** Spritkosten, Kosten pro Person, Tankstopps und Fahrzeit für eine Strecke
- **Werkstätten:** Kontakte mit Anruf- und Routen-Knopf
- **Kosten:** inkl. Fotos von Belegen und Rechnungen (in IndexedDB, verkleinert)
- **Kosten (Übersicht):** Ausgaben nach Kategorie, Kosten pro km, Verlauf der letzten 12 Monate
- **Spritpreise:** günstigste geöffnete Tankstellen im Umkreis, mit Route in Apple Karten
  (kostenloser API-Schlüssel von [Tankerkönig](https://creativecommons.tankerkoenig.de/) nötig)
- **Parkplatz:** Standort merken, Notiz, Parkuhr-Countdown, Fußweg zurück zum Auto
- **Kalender:** Fälligkeiten als .ics-Datei mit Erinnerung 7 Tage vorher in den iPhone-Kalender
- **Sicherung:** Export/Import als JSON-Datei (z. B. in iCloud Drive)

## Sprachen
Deutsch, English und Tiếng Việt (umschaltbar unter **Mehr → Sprache**). Beim ersten Start
wird die Sprache des iPhones übernommen. Zahlen- und Datumsformate folgen der Sprache.

Dateien:
- `index.html`: Aufbau, Design und Symbole
- `js/01-…` bis `js/09-…`: Programmlogik, nach Bereichen aufgeteilt und in dieser Reihenfolge geladen;
  alle sichtbaren Texte laufen über `tr('deutscher Text')`
- `i18n.js`: Sprachumschaltung und Übersetzungen (`T`: `'Deutsch': ['English', 'Tiếng Việt']`)
- `tests/run.js`: automatische Tests (siehe unten)

Neuer Text? Im Code mit `tr('…')` schreiben und in `T` die Übersetzung ergänzen.

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

## Tests
```
cd autobuch
npm install
npx playwright install chromium
npm test
```
Die Tests laufen außerdem automatisch bei jeder Änderung über GitHub Actions (`.github/workflows/autobuch-tests.yml`).

## Neue Version veröffentlichen
`APP_VERSION` in `js/01-grundlagen.js` und `VERSION` in `sw.js` erhöhen, damit die iPhones das Update laden.
