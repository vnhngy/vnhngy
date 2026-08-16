# SingNight — Karaoke-App fürs iPhone

Eine gehostete, moderne Karaoke-Web-App (installierbar als Home-Screen-App
auf dem iPhone/PWA). Gäste öffnen die Seite im Browser, tragen ihren Namen
ein, suchen einen Song in der YouTube-Datenbank und reihen sich in eine
Live-Warteschlange ein.

## Features

- **Preis-/Buchungsseite** (`/`) mit drei Abo-Stufen — Solo, Gruppe,
  Veranstaltung — fair kalkuliert (Basis-Infrastrukturkosten + Preis pro
  Sänger:in, sinkt mit steigender Gästezahl) plus interaktivem
  Preisrechner nach Gästezahl.
- **YouTube-Songsuche** (`/sing`) über die offizielle YouTube Data API v3 —
  wirklich jedes Lied auf YouTube ist auffindbar. Ergebnisse werden mit dem
  lokalen Song-Katalog gemischt (bereits bekannte/beliebte Songs zuerst).
- **Live-Warteschlange** (`/queue`, groß-bildschirmtauglich für TV/Bühne;
  auch in `/sing` sichtbar) zeigt in Echtzeit (Polling alle 3–4 Sek.), wer
  gerade singt und wer als Nächstes dran ist.
- **Automatische Songdatenbank**: Jeder gesungene Song wird beim Beenden
  automatisch mit Play-Count und letztem Spieldatum in der Datenbank
  gespeichert (`/api/queue/[id]` → Status `PLAYED`), inklusive
  Auto-Erkennung über den YouTube-IFrame-Player im Moderator:innen-Bereich
  (`/host`).
- **Namentliche Anmeldung** (`/join`): Vor dem ersten Song trägt jede:r
  Sänger:in nur den eigenen Namen ein — kein Konto, kein Passwort. Der Name
  erscheint automatisch in der Warteschlange.

## Architektur

- **Next.js 14** (App Router, TypeScript) — SSR + API-Routen in einem
  Projekt, ideal für schnelles, günstiges Hosting.
- **Prisma + SQLite** als Datenbank (zero-config, läuft ohne externen
  DB-Server). Für Serverless-Hosting (siehe unten) auf Postgres umstellbar.
- **Tailwind CSS** für das Design (dunkles Bühnenlicht-Theme, Neon-Akzente,
  mobile-first).
- **YouTube Data API v3** für die Songsuche.
- Kein externer Zahlungsanbieter angebunden — die Preis-Seite erfasst
  Buchungsanfragen (`PlanInquiry`) und kann später leicht mit Stripe o. Ä.
  verknüpft werden.

## Lokale Einrichtung

```bash
cd karaoke-app
npm install
cp .env.example .env
# YOUTUBE_API_KEY in .env eintragen (siehe unten)
npm run db:push      # legt die SQLite-Datenbank an
npm run db:seed       # optional: ein paar Demo-Songs
npm run dev
```

Die App läuft dann unter `http://localhost:3000`.

### YouTube API Key erstellen (kostenlos)

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen, neues
   Projekt anlegen (oder bestehendes wählen).
2. **APIs & Dienste → Bibliothek** → nach „YouTube Data API v3“ suchen →
   aktivieren.
3. **APIs & Dienste → Anmeldedaten** → „Anmeldedaten erstellen“ → „API-Schlüssel“.
4. Den Schlüssel in `.env` als `YOUTUBE_API_KEY` eintragen.
5. Empfohlen: Den Schlüssel unter „Schlüssel einschränken“ auf die YouTube
   Data API v3 begrenzen.

Das kostenlose Kontingent (10.000 Einheiten/Tag, eine Suche kostet ~100
Einheiten) reicht für mehrere hundert Songsuchen pro Tag.

## Deployment (Hosting)

Am einfachsten mit **Vercel**:

1. Repository zu Vercel verbinden, `karaoke-app/` als Root-Verzeichnis wählen.
2. Environment-Variablen setzen: `YOUTUBE_API_KEY`, `DATABASE_URL`.
3. **Wichtig für Serverless-Hosting**: SQLite-Dateien sind auf Vercel nicht
   dauerhaft beschreibbar. Für den Produktivbetrieb `prisma/schema.prisma`
   auf `provider = "postgresql"` umstellen und `DATABASE_URL` auf eine
   gehostete Postgres-Datenbank zeigen lassen (z. B. kostenlos bei
   [Neon](https://neon.tech) oder [Supabase](https://supabase.com)).
4. Deploy — `npm run build` führt automatisch `prisma migrate deploy` aus.

Alternativ funktioniert die App unverändert (inkl. SQLite-Datei) auch auf
jedem klassischen Host mit Node.js (VPS, Railway, Render, Fly.io) — dort
bleibt die SQLite-Datenbankdatei zwischen Deployments erhalten, solange ein
persistentes Volume genutzt wird.

## Als iPhone-App nutzen

Die Seite ist eine installierbare PWA:

1. Auf dem iPhone in Safari die gehostete URL öffnen.
2. Teilen-Symbol → „Zum Home-Bildschirm“.
3. Die App startet danach im Vollbild (ohne Safari-Leiste) direkt auf der
   Namenseingabe-Seite.

## Seitenübersicht

| Route     | Zweck                                                        |
| --------- | ------------------------------------------------------------- |
| `/`       | Landingpage mit Preisen/Abo-Modellen                          |
| `/join`   | Namenseingabe vor dem ersten Song                              |
| `/sing`   | Songsuche + zur Warteschlange hinzufügen                       |
| `/queue`  | Öffentliche Live-Anzeige „wer singt als Nächstes“ (TV/Bühne)   |
| `/host`   | Moderator:innen-Steuerung: Player, Reihenfolge, Songfreigabe    |

## Preislogik

Jede Stufe deckt eine feste Infrastruktur-Basis (~3,50 €) plus einen
marginalen Betrag (~2,00 €) pro realistisch gleichzeitig aktivem Gast. Mit
steigender Gästezahl sinkt der Preis pro Person spürbar — siehe
`src/lib/plans.ts` für die genaue Kalkulation und den Preisrechner in
`src/components/PriceCalculator.tsx`.
