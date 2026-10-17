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

## Windows

- **Installer:** `Nudge-Setup-1.0.0-x64.exe` für normale PCs, `…-arm64.exe` für Windows auf ARM (z. B. Surface Pro X oder Snapdragon-Laptops).
  Er installiert ohne Admin-Rechte in deinen Benutzerordner und legt Startmenü- und Desktop-Verknüpfung an. Deinstallieren geht über *Einstellungen → Apps*.
- **Portable:** `Nudge-Portable-1.0.0.exe` läuft ohne Installation, z. B. vom USB-Stick.
- **Taskleiste:** Rechtsklick auf das Nudge-Symbol öffnet die Sprungliste mit *Neue Erinnerung*, *Überfällige durchgehen* und *Heute*.
  Gibt es Überfälliges, zeigt das Taskleisten-Symbol einen kleinen Hinweis.
- **Mitteilungen** erscheinen im Windows-Infobereich, wenn Nudge über den Installer installiert wurde.
- **SmartScreen:** Die App ist nicht mit einem kostenpflichtigen Code-Zertifikat signiert. Windows zeigt deshalb beim ersten Start
  „Der Computer wurde durch Windows geschützt“. Klicke dann auf *Weitere Informationen* und *Trotzdem ausführen*.

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
npm run dist:win     # Installer (x64 + ARM) und portable .exe; unter macOS/Linux wird Wine benötigt
npm run dist:linux   # .AppImage
```

Die fertigen Dateien landen in `desktop/dist/`. Ohne Apple-Entwicklerzertifikat ist die Mac-App nicht signiert.
Beim ersten Öffnen dann Rechtsklick auf die App und *Öffnen* wählen.
