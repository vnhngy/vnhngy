# Gegenwert

**Was kostet das wirklich?** Eine iPhone-Web-App (PWA), die jeden Preis in *dein* Leben umrechnet:
in Arbeitszeit, in Tankfüllungen und Kilometer mit deinem Auto und in deine eigenen Einheiten
(Döner, Kinoabende, Monatsmiete …). Dazu eine **Bedenkzeit** gegen Spontankäufe.

Kein Server, kein Konto. Alle Daten bleiben auf dem iPhone (localStorage, Schlüssel `gegenwert-v1`).

## Funktionen
- **Rechnen:** Preis eintippen → „16 h 36 min Arbeit“, Anteil am Monatsnetto, Tankfüllungen, km mit deinem Auto, eigene Einheiten
- **Abos:** „Pro Monat“ / „Pro Jahr“ rechnet aufs Jahr und zeigt die Kosten in 10 Jahren
- **Bedenkzeit:** Wünsche ablegen; Wartezeit = 1 Tag je angefangene 2 Arbeitsstunden (1–30 Tage).
  Danach: „Willst du das immer noch?“ → kaufen oder verzichten. Fällige Wünsche zeigen ein Abzeichen.
- **Bilanz:** wie viel Geld, Arbeitszeit, Tankfüllungen … dir das Warten gespart hat
- **Drivo-Verbindung:** Liegt Drivo auf derselben Seite (`…github.io/<repo>/autobuch/`), liest Gegenwert
  automatisch Autoname, Tankgröße, letzten Literpreis und Ø-Verbrauch aus Drivo (nur lesen, nie schreiben).
  Alles lässt sich unter **Ich** auch selbst eintragen.
- **Sichern / Wiederherstellen** als JSON-Datei, offline nutzbar, Hell/Dunkel nach iOS-Einstellung

## Rechnung
- Stundenlohn = Netto pro Monat ÷ (Wochenstunden × 52 ÷ 12)
- Sprit pro km = €/l × l/100 km ÷ 100, Tankfüllung = €/l × Tankgröße

## Online stellen & aufs iPhone
Wie bei Drivo: GitHub Pages aktivieren, dann in Safari
`https://<benutzername>.github.io/<repo>/gegenwert/` öffnen → **Teilen** → **„Zum Home-Bildschirm“**.

## Tests
```
cd gegenwert && npm install && npx playwright install chromium && npm test
```
