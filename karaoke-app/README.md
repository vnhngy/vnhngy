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
- **Prisma + PostgreSQL** als Datenbank — läuft produktiv auf jedem
  Serverless-Host (Vercel etc.) und lokal per Docker Compose.
- **Tailwind CSS** für das Design (dunkles Bühnenlicht-Theme, Neon-Akzente,
  mobile-first).
- **YouTube Data API v3** für die Songsuche.
- Kein externer Zahlungsanbieter angebunden — die Preis-Seite erfasst
  Buchungsanfragen (`PlanInquiry`) und kann später leicht mit Stripe o. Ä.
  verknüpft werden.

## Lokale Einrichtung

Voraussetzung: [Docker](https://www.docker.com/) (für die lokale Postgres-DB) —
alternativ eine eigene Postgres-Instanz mit passender `DATABASE_URL`.

```bash
cd karaoke-app
npm install
cp .env.example .env
# YOUTUBE_API_KEY in .env eintragen (siehe unten)

docker compose up -d   # startet lokale Postgres-DB (Port 5432)
npm run db:migrate     # wendet die Datenbank-Migrationen an
npm run db:seed        # optional: ein paar Demo-Songs
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

Am einfachsten mit **Vercel** — Schritt für Schritt:

### 1. Gehostete Postgres-Datenbank anlegen (kostenlos)

Bei [Neon](https://neon.tech) (empfohlen, sehr einfach) oder
[Supabase](https://supabase.com):

1. Kostenloses Konto erstellen, neues Projekt anlegen.
2. Die **Connection String** kopieren (bei Neon: „Connection Details“ →
   Modus „Pooled connection“ verwenden — Format
   `postgresql://user:passwort@host/datenbank?sslmode=require`).

### 2. Bei Vercel deployen

1. Auf [vercel.com](https://vercel.com) mit GitHub einloggen.
2. „Add New… → Project“ → das Repository auswählen.
3. **Root Directory** auf `karaoke-app` setzen (wichtig!).
4. Unter „Environment Variables“ eintragen:
   - `DATABASE_URL` → die Connection-String aus Schritt 1
   - `YOUTUBE_API_KEY` → dein YouTube-API-Key (siehe oben)
5. „Deploy“ klicken.

`npm run build` führt dabei automatisch `prisma migrate deploy` aus, wendet
also die in `prisma/migrations/` enthaltenen Migrationen auf die neue
Datenbank an — kein manueller DB-Setup-Schritt nötig.

Nach dem Deploy bekommst du eine URL wie `singnight.vercel.app`. Die kannst
du direkt auf dem iPhone öffnen und wie unten beschrieben zum Home-Bildschirm
hinzufügen.

### Alternative Hosts

Die App läuft unverändert auch auf jedem klassischen Node.js-Host (VPS,
Railway, Render, Fly.io) — einfach dieselben zwei Umgebungsvariablen setzen
und `npm run build && npm run start` ausführen.

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
