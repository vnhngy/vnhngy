# Nudge für iOS

Native SwiftUI-App für iPhone und iPad. Sie nutzt Apples echtes **Liquid Glass** aus iOS 26:
Tab-Leiste, Navigationsleisten und Sheets bekommen es automatisch, und Karten, Buttons und Chips
verwenden `glassEffect` über einem farbigen Mesh-Hintergrund.

## Voraussetzungen

- Mac mit **Xcode 26** oder neuer
- iPhone oder iPad mit **iOS 26** (oder der Simulator)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`

## Starten

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
