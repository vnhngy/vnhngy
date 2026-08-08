# Message Stats

Eine iOS-App, die zeigt, wie viele Nachrichten du bekommst — mit Dashboard, Charts
und einem **Sperrbildschirm-Widget**, das die Zahlen auch bei gesperrtem iPhone
anzeigt. Die Daten aktualisieren sich automatisch: neue Nachrichten werden in
Echtzeit erfasst, und das Widget aktualisiert sich zusätzlich mindestens einmal
täglich (Mitternacht) von selbst.

## Warum das nicht "einfach automatisch" geht

Apple erlaubt Drittanbieter-Apps **keinen** Zugriff auf die Nachrichten-App
(SMS/iMessage) — es gibt dafür keine öffentliche API. Der einzige praktikable
Weg ohne Jailbreak/private APIs ist eine **Kurzbefehle-Personal-Automation**:
Sie feuert, wenn eine Nachricht ankommt, und ruft im Hintergrund eine Aktion
dieser App auf, die den Zeitpunkt (und optional den Absendernamen) speichert.
Es wird **nie der Nachrichteninhalt** gespeichert oder gelesen.

## Architektur

- **MessageStats** (App-Target): SwiftUI-Dashboard, Charts (Swift Charts),
  Kontaktliste, Einstellungen.
- **MessageStatsWidgetExtension** (Widget-Target): Home-Screen- und
  **Lock-Screen-Widgets** (`accessoryCircular`, `accessoryRectangular`,
  `accessoryInline`) via WidgetKit.
- **Shared**: `MessageEvent` (SwiftData-Modell), `MessageStore` (Persistenz in
  einer App-Group), `StatsCalculator` (Tageswerte, Serien, Verteilungen).
- **App Intent** `LogMessageReceivedIntent`: wird von der Kurzbefehle-
  Automation lautlos im Hintergrund ausgeführt (`openAppWhenRun = false`),
  schreibt ein Event und stößt `WidgetCenter.reloadAllTimelines()` an.

Alle drei Ziele teilen sich einen App-Group-Container
(`group.com.vnhngy.messagestats`), in dem die SwiftData-Datenbank liegt.

> Hinweis: Dieser Code wurde in einer reinen Linux-Umgebung ohne Xcode/macOS
> geschrieben und konnte hier **nicht kompiliert oder auf einem Gerät
> getestet werden**. Die APIs (SwiftData, WidgetKit, AppIntents, Swift
> Charts) sind sorgfältig nach aktuellem iOS-17-SDK-Stand verwendet, aber
> bau- und Laufzeitfehler beim ersten Build in Xcode sind trotzdem möglich —
> siehe Troubleshooting unten.

## Setup

### Voraussetzungen

- Xcode 15+ auf einem Mac
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Ein Apple-ID reicht für den Eigengebrauch (kostenloses "Personal Team"),
  kein bezahltes Developer-Programm nötig.

### 1. Xcode-Projekt generieren

```bash
brew install xcodegen   # falls noch nicht installiert
cd vnhngy                # dieses Repo (Ordner mit project.yml)
xcodegen generate
open MessageStats.xcodeproj
```

Das `.xcodeproj` wird bewusst nicht eingecheckt (`.gitignore`) — es wird
lokal aus `project.yml` generiert.

### 2. Bundle-IDs & App Group anpassen

Die Bundle-IDs (`com.vnhngy.messagestats*`) und die App-Group-ID
(`group.com.vnhngy.messagestats`) sind Platzhalter. Für ein **kostenloses**
Personal Team musst du sie meist auf etwas Eindeutiges ändern:

1. In `project.yml`: `PRODUCT_BUNDLE_IDENTIFIER` in beiden Targets ändern.
2. In `Entitlements/MessageStats.entitlements` und
   `Entitlements/MessageStatsWidget.entitlements`: den App-Group-String
   anpassen.
3. In `Shared/AppGroup.swift`: `identifier` auf denselben App-Group-String
   setzen.
4. `xcodegen generate` erneut ausführen.

### 3. Signing

In Xcode für **beide** Targets (App + Widget Extension) unter
*Signing & Capabilities* dein Team auswählen ("Automatically manage
signing" reicht). Xcode legt die App-Group-Capability aus den
Entitlements-Dateien automatisch an, sofern beide Targets dasselbe Team
verwenden.

### 4. Auf dem iPhone installieren

App-Ziel auf dem angeschlossenen iPhone ausführen (⌘R). Beim ersten Start
ggf. unter *Einstellungen → Allgemein → VPN & Geräteverwaltung* dem
Entwickler-Zertifikat vertrauen. Mit einem kostenlosen Personal Team läuft
die App 7 Tage, danach in Xcode einfach erneut installieren.

### 5. Kurzbefehle-Automation einrichten

1. **Kurzbefehle**-App öffnen → Tab **Automation** → **+** → **Neue
   persönliche Automation**
2. **Nachricht** auswählen → **Wenn ich eine Nachricht erhalte** → Fertig
3. **Aktion hinzufügen** → nach "Message Stats" suchen →
   **Nachricht protokollieren** hinzufügen
4. Optional: Tippe ins Feld "Absender" und wähle die Variable **Absender**
   aus dem Kurzbefehl, um Top-Kontakte im Tab "Kontakte" zu sehen
5. **Weiter** → **"Vor Ausführung fragen" deaktivieren**, sonst bekommst du
   bei jeder Nachricht eine Bestätigungs-Nachfrage
6. Fertig — ab jetzt zählt jede eingehende Nachricht automatisch mit

### 6. Lock-Screen-Widget hinzufügen

Sperrbildschirm gedrückt halten → **Anpassen** → Widget-Bereich antippen →
**+** → **Message Stats** auswählen (Kreis, Rechteck oder Inline-Variante).
Ein Home-Screen-Widget (klein/mittel) geht genauso über den normalen
Widget-Picker.

## Was die App anzeigt

- Nachrichten heute / gestern / letzte 7 / letzte 30 Tage / insgesamt
- Tagesdurchschnitt (7 und 30 Tage)
- Aktuelle und längste Serie ("Streak") an Tagen mit mindestens einer
  Nachricht
- Aktivste Stunde und aktivster Wochentag
- Balkendiagramm der letzten 14 Tage
- Verteilung der Nachrichten über die Tageszeit
- Top-5-Absender (nur wenn die Automation den Absender mitgibt)

## Datenschutz

Es wird ausschließlich der **Zeitpunkt** und optional ein **Absendername**
gespeichert — niemals der Nachrichtentext. Alle Daten bleiben lokal in der
App-Group auf dem Gerät, es gibt keine Netzwerk-Übertragung. "Alle Daten
zurücksetzen" in den Einstellungen löscht den gesamten Verlauf.

## Bekannte Einschränkungen

- Erfasst werden nur Nachrichten, die eintreffen **während** die
  Automation aktiv ist — bereits vorhandene Nachrichten werden nicht
  rückwirkend gezählt.
- iOS drosselt Widget-Reloads (Energiebudget). Bei sehr vielen Nachrichten
  pro Tag kann das Lock-Screen-Widget leicht nachhinken; spätestens beim
  nächsten geplanten Reload (stündlich/Mitternacht) ist es wieder aktuell.
- Mit einem kostenlosen Personal Team läuft die App nur 7 Tage ohne
  erneutes Installieren über Xcode.
- Die Kurzbefehle-Automation kann pro Nachricht kurz "Kurzbefehle wird
  ausgeführt…" als Banner zeigen; das ist iOS-Systemverhalten und lässt
  sich nicht vollständig unterdrücken.

## Troubleshooting

- **"App Group container not found"**: App-Group-Capability fehlt bei
  einem der Targets, oder die ID in `AppGroup.swift`/Entitlements stimmt
  nicht mit der in Xcode aktivierten Gruppe überein.
- **Widget zeigt keine Daten**: einmal die Kurzbefehle-Automation manuell
  testen ("Nachricht protokollieren" per Hand in Kurzbefehle ausführen),
  dann App neu öffnen — das erzwingt einen Widget-Reload.
- **Automation fragt jedes Mal nach**: Schritt 5 oben ("Vor Ausführung
  fragen" deaktivieren) wiederholen.
