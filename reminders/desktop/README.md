# Nudge für den Desktop

Desktop-App für **macOS, Windows und Linux** (Electron). Sie enthält dieselbe App wie die Web-Version
im Liquid-Glass-Design und ergänzt, was ein Browser-Tab nicht kann:

- **Läuft im Hintergrund weiter:** Schließt du das Fenster, bleibt Nudge in der Menüleiste bzw. im Tray, und Erinnerungen kommen weiter.
- **System-Mitteilungen.** Ein Klick darauf öffnet die Erinnerung.
- **Globales Tastenkürzel** `Cmd/Strg + Shift + Leertaste` für eine neue Erinnerung, egal welche App gerade vorne ist.
- **Tray-Menü** mit Öffnen, Neue Erinnerung, Überfällige durchgehen und *Beim Anmelden starten*.
- **Kennzahl am Dock-Symbol** (macOS) bzw. am Taskleisten-Symbol (Windows) für alles, was Aufmerksamkeit braucht.
- **Native Menüs und Kürzel:** `Cmd/Strg+N` neu, `Cmd/Strg+F` suchen, `Cmd/Strg+1–4` Ansichten, `Cmd/Strg+Alt+1–4` Liste, Board, Kalender oder Statistik,
  `Cmd/Strg+E` Backup exportieren, `Cmd/Strg+,` Einstellungen.
- **Eigenes Fenster:** Unter macOS gibt es keine Titelleiste, die Fenster-Knöpfe sitzen im Glas-Design.
- **Speicherort:** Die Daten liegen lokal auf dem Rechner. Backups lassen sich als JSON exportieren und importieren, der Kalender als `.ics`.

## Starten

Du brauchst [Node.js](https://nodejs.org) 20 oder neuer.

```sh
cd reminders/desktop
npm install
npm start
```

## Installationsdatei bauen

```sh
npm run dist:mac     # .dmg   (auf einem Mac ausführen)
npm run dist:win     # .exe   (Installer, am besten unter Windows)
npm run dist:linux   # .AppImage
```

Die fertigen Dateien landen in `desktop/dist/`. Ohne Apple-Entwicklerzertifikat ist die Mac-App nicht signiert.
Beim ersten Öffnen dann Rechtsklick auf die App und *Öffnen* wählen.
