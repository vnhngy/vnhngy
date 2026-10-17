# Nudge für iOS

Native SwiftUI-App für iPhone und iPad. Sie nutzt Apples echtes **Liquid Glass** aus iOS 26:
Tab-Leiste, Navigationsleisten und Sheets bekommen es automatisch, und Karten, Buttons und Chips
verwenden `glassEffect` über einem farbigen Mesh-Hintergrund.

## Voraussetzungen

- Mac mit **Xcode 26** oder neuer
- iPhone oder iPad mit **iOS 26** (oder der Simulator)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`

## Ohne Mac (mit Windows-PC)

GitHub baut die App bei jeder Änderung automatisch auf einem Mac in der Cloud
(Workflow `.github/workflows/nudge-ios.yml`) und legt eine `Nudge.ipa` ab.

1. Auf GitHub: **Actions → Nudge iOS build →** oberster grüner Lauf **→ Artifacts → Nudge-iOS** herunterladen und entpacken.
2. Auf dem PC [iTunes](https://www.apple.com/itunes/download/win64) und iCloud von apple.com (nicht aus dem Microsoft Store)
   sowie [Sideloadly](https://sideloadly.io) installieren.
3. iPhone per USB anschließen, entsperren und dem Computer vertrauen. In Sideloadly `Nudge.ipa` hineinziehen,
   die Apple-ID eintragen und **Start** klicken.
4. Auf dem iPhone unter *Einstellungen → Datenschutz & Sicherheit* den **Entwicklermodus** einschalten und unter
   *Allgemein → VPN & Geräteverwaltung* der Apple-ID vertrauen.

Mit einer kostenlosen Apple-ID läuft die App 7 Tage. Danach in Sideloadly erneut auf **Start** klicken, die Daten bleiben erhalten.

## Mit Mac starten

```sh
cd reminders/ios
xcodegen generate
open Nudge.xcodeproj
```

In Xcode unter *Signing & Capabilities* dein Team wählen und auf ▶ drücken. Beim ersten Start
fragt die App, ob sie Mitteilungen senden darf.

## Funktionen

- **Schnelleingabe in normaler Sprache:** `Zahnarzt anrufen tomorrow 3pm !high #health`. Datum und Uhrzeit
  erkennt Apples Datumserkennung. Dazu kommen Wiederholungen (`every week`), Priorität (`!`–`!!!`),
  Tags (`#tag`), Listen (`@liste`), Markierung (`*`), Zeitschätzung (`~30m`) und Vorab-Erinnerungen
  (`15m before`). Eine Vorschau zeigt, was erkannt wurde.
- **Echte Mitteilungen,** auch wenn die App geschlossen ist. Durch langes Drücken auf eine Mitteilung kannst du
  *Erledigt*, *10 Min. später*, *1 Std. später* oder *Morgen früh* wählen. Das App-Symbol zeigt die Zahl der überfälligen Erinnerungen.
- **Tabs:** Heute (mit „Up next“-Karte), Kalender mit Tagesansicht und den nächsten 7 Tagen,
  Listen (intelligente Listen, eigene Listen, Tags, Zuletzt gelöscht), Statistik mit Diagrammen und eine Suche mit Filtern
  (`is:overdue`, `#tag`, `list:work`, `p:high`, `-` zum Ausschließen).
- **Über der Tab-Leiste** läuft der Fokus-Timer, oder es steht dort, was als Nächstes fällig ist.
- **Details:** Notizen, Datum und Uhrzeit, Erinnerung vorab, Wiederholungen (stündlich bis jährlich, alle N, mit Enddatum),
  Liste, Priorität, Markierung, Zeitschätzung, Unteraufgaben, Tags, Ort, Link und eine Gewohnheits-Ansicht der letzten 14 Tage mit Serie.
- **Wischgesten:** nach rechts für Erledigt oder Markieren, nach links für Löschen oder Morgen. Langes Drücken öffnet ein Menü mit Schlummern, Fokus und Duplizieren.
- **Überfällige durchgehen:** jede überfällige Erinnerung einzeln verschieben, erledigen, löschen oder überspringen.
- **Fokus-Timer** mit Ring-Countdown, Pause und +5 Min. Am Ende kommt eine Mitteilung, und die Zeit fließt in die Statistik ein.
- **Zuletzt gelöscht:** Erinnerungen lassen sich 30 Tage lang wiederherstellen.

Die Daten liegen lokal auf dem Gerät (SwiftData).
