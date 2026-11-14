# Klangraum – Musikplayer mit Karaoke für iOS & Android

Ein Musikplayer im Stil von Spotify, gebaut mit **Expo (SDK 57) / React Native** und
**TypeScript** – eine Codebasis für iPhone und Android. Dazu gibt es synchronisierte
Songtexte zum Mitsingen und einen Karaoke-Modus mit Aufnahme und Bewertung.

## Funktionen

### Musik hören (wie bei Spotify)
- **Startseite**: Begrüßung nach Tageszeit, Schnellzugriff, *Zuletzt gehört*, persönliche
  **Mixe** aus deinen Lieblingsgenres, *Angesagt diese Woche*, beliebte Playlists, neue
  Entdeckungen und Genres
- **Suche** mit Live-Ergebnissen für Songs, Künstler, Playlists/Alben und deine eigene
  Bibliothek, letzte Suchen, Genre-Kacheln, Suche nach Stimmung – und eine
  **Songtext-Suche** („Wie heißt der Song mit …?“)
- **Vollbild-Player**: großes Cover, Fortschrittsleiste zum Ziehen, Zufall,
  Wiederholen (alle / einen), ±15 s, **Geschwindigkeit** 0,5×–2× (ohne dass sich die
  Tonhöhe ändert), **Sleep-Timer** (Minuten oder „Ende des Songs“, blendet sanft aus),
  Teilen und eine Songtext-Vorschau
- **Warteschlange**: „Als Nächstes spielen“, „Zur Warteschlange hinzufügen“,
  Reihenfolge ändern, Songs entfernen, zu einem Song springen
- **Autoplay**: Wenn die Warteschlange zu Ende ist, laufen ähnliche Songs weiter
- **Song-Radio und Künstler-Radio**
- **Überblenden** (Crossfade, 0–12 s) mit zwei Playern und **sanfter Start**
- **Hintergrundwiedergabe** und **Steuerung auf dem Sperrbildschirm bzw. in der
  Benachrichtigung** (Titel, Künstler, Cover, Vor-/Zurückspulen)
- **Lieblingssongs** (♥), **eigene Playlists** (erstellen, umbenennen, Beschreibung,
  Reihenfolge ändern, anheften, duplizieren, löschen, teilen)
- Künstlern **folgen**, Alben/Playlists **speichern**, eine Playlist als eigene kopieren
- **Downloads für offline** und ein **Offline-Modus**
- **Eigene Musik importieren** (MP3, M4A, WAV, FLAC … aus „Dateien“ oder iCloud),
  Songdetails bearbeiten und Dateien wieder löschen
- **Bibliothek** mit Filtern (Playlists, Künstler, Alben, Heruntergeladen, Auf dem
  Gerät) und Sortierung
- **Dein Rückblick** (ähnlich wie Spotify Wrapped): gehörte Minuten, Wiedergaben,
  Tage in Folge, Top-Songs (auch als Playlist speicherbar), Top-Künstler, Genres und
  zu welcher Tageszeit du hörst
- **Verlauf**, nach Tagen gruppiert
- Design: dunkel, hell oder wie das System, **6 Akzentfarben**, haptisches Feedback

### Songtexte zum Mitsingen
- Synchronisierte Songtexte werden automatisch geladen (über LRCLIB, eine offene
  Datenbank, kein API-Schlüssel nötig)
- Sie scrollen mit der Musik mit, die aktuelle Zeile wird hervorgehoben, und mit
  **„Mitsingen“** füllt sie sich **Wort für Wort**. Bei *Enhanced LRC* passiert das
  wortgenau.
- Auf eine Zeile tippen springt an diese Stelle im Song
- **Timing pro Song anpassen** (±0,5 s) und die Schriftgröße ändern
- Einen anderen Songtext auswählen, einen **eigenen Text einfügen** (LRC oder einfacher
  Text) oder eine **.lrc-Datei importieren**
- Das Display bleibt an, solange die Songtexte offen sind

### Karaoke
- Countdown, große Songtexte, die sich Wort für Wort füllen, und eine Anzeige
  „● ● ●“ vor dem nächsten Einsatz
- **Gesangsaufnahme** über das Mikrofon mit einem **Pegelmesser** und einer
  **Live-Punktzahl**
- **Bewertung** von 0 bis 100: *Timing* (hast du während der Textzeilen gesungen?) und
  *Stabilität* (wie gleichmäßig war deine Stimme?). Wer in langen
  Instrumentalpassagen singt, bekommt Abzug. Die Raumlautstärke wird während des
  Countdowns gemessen.
- **Auswertung**: hochzählende Punktzahl, Balken pro Zeile, deine stärksten und
  schwächsten Zeilen
- Aufnahme anhören, entweder **nur deine Stimme** oder **Stimme und Musik synchron**
- **Musiklautstärke** und ein **langsameres Übungstempo** (80 % / 90 %)
- **Party-Modus**: Sänger:innen wechseln, eine **Bestenliste** und Ergebnisse teilen
- Einstellbar: Countdown, Mikrofon-Empfindlichkeit, Standard-Musiklautstärke

## Woher kommt die Musik?

Die Kataloge von Spotify, Apple Music & Co. sind lizenzgeschützt und für eigene Apps
nicht abspielbar. Klangraum nutzt deshalb:

- **[Audius](https://audius.co)** – ein offener Katalog mit vollständigen, legal
  streambaren Songs von unabhängigen Künstler:innen (öffentliche API, kein Schlüssel nötig)
- **Deine eigenen Dateien** – damit funktionieren auch bekannte Charthits, und Songtexte
  findet man für sie meist problemlos
- **[LRCLIB](https://lrclib.net)** für Songtexte

## Starten

```bash
cd music-player
npm install
npx expo start          # danach die App in Expo Go öffnen (QR-Code scannen)
```

Für alle Funktionen, besonders Hintergrundwiedergabe und Sperrbildschirm, brauchst du
einen **Development Build**:

```bash
npx expo run:ios        # benötigt einen Mac mit Xcode
npx expo run:android    # benötigt Android Studio / SDK
# oder in der Cloud:
npx eas-cli@latest build --profile development --platform all
```

Prüfen:

```bash
npm run typecheck
npm run lint
```

## Architektur

```
src/
  app/                 Bildschirme (Expo Router, dateibasiert)
    (tabs)/            Start, Suchen, Bibliothek, Karaoke (+ Mini-Player über der Tab-Leiste)
    player.tsx         Vollbild-Player
    lyrics.tsx         Songtexte im Vollbild
    karaoke-session.tsx  Karaoke-Auftritt
    performance/[id]   Auswertung einer Aufnahme
    playlist/ album/ artist/ genre/   Listen
    queue, settings, stats, history, edit-track
  audio/engine.ts      Wiedergabe-Engine: Warteschlange, Zufall, Wiederholen, Crossfade,
                       Autoplay, Sleep-Timer, Sperrbildschirm, Hörzeit-Erfassung
  store/               Zustand (zustand + AsyncStorage): Bibliothek, Player, Einstellungen
  lib/                 Audius-Client, LRC-Parser/LRCLIB, Karaoke-Bewertung, Dateien,
                       Statistik, Theme
  components/          UI-Bausteine (Track-Zeile, Mini-Player, Fortschrittsleiste,
                       Songtext-Ansicht, Menüs …)
```

## Grenzen (bewusst ehrlich)

- **Kein Spotify-, Apple-Music- oder YouTube-Katalog.** Die Gründe stehen oben unter
  *Woher kommt die Musik?*
- **Kein Equalizer, keine Gesangsentfernung.** `expo-audio` bietet keine
  Audio-Effekte. Beim Karaoke senkst du stattdessen die Musiklautstärke. Ein echter
  Equalizer bräuchte ein eigenes natives Modul.
- **Die Karaoke-Bewertung misst Timing und Pegel, nicht die Tonhöhe.**
- Auf dem Sperrbildschirm gibt es **Vor- und Zurückspulen**. Die Tasten „nächster Song“
  und „vorheriger Song“ stellt `expo-audio` (SDK 57) dort nicht bereit.
- Funktionen, die einen eigenen Server brauchen, fehlen: gemeinsame Playlists,
  Freunde-Aktivität, Spotify Connect und Podcasts.
- Getestet wurden Typprüfung, Linter, der Bundle-Build für iOS und Android sowie die
  Logik für Songtexte und Bewertung. Auf echten Geräten wurde die App noch **nicht**
  ausprobiert.
