/**
 * Lyrics: LRC parsing (incl. enhanced word-level timestamps) and lookup via
 * LRCLIB (https://lrclib.net), a free, open database of synced lyrics.
 */
import type { LyricLine, LyricWord, Lyrics, Track } from './types';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toSeconds(min: string, sec: string, frac?: string): number {
  const f = frac ? Number(frac) / Math.pow(10, frac.length) : 0;
  return Number(min) * 60 + Number(sec) + f;
}

export function parseLrc(lrc: string, duration = 0): LyricLine[] {
  let globalOffset = 0;
  const raw: { time: number; text: string; words?: LyricWord[] }[] = [];

  for (const line of lrc.split(/\r?\n/)) {
    const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (offsetMatch) {
      globalOffset = Number(offsetMatch[1]) / 1000;
      continue;
    }
    const times: number[] = [];
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    while ((m = TIME_TAG.exec(line)) && m.index === lastIndex) {
      times.push(toSeconds(m[1], m[2], m[3]));
      lastIndex = TIME_TAG.lastIndex;
    }
    if (!times.length) continue;
    const body = line.slice(lastIndex);

    let words: LyricWord[] | undefined;
    if (WORD_TAG.test(body)) {
      words = [];
      WORD_TAG.lastIndex = 0;
      const parts = body.split(WORD_TAG);
      // split() with 3 capture groups yields: [pre, min, sec, frac, text, min, sec, frac, text, ...]
      for (let i = 1; i + 3 < parts.length; i += 4) {
        const text = parts[i + 3] ?? '';
        if (text.trim()) words.push({ time: toSeconds(parts[i], parts[i + 1], parts[i + 2]), text });
      }
      if (!words.length) words = undefined;
    }
    const text = body.replace(WORD_TAG, '').trim();
    for (const t of times) raw.push({ time: Math.max(0, t - globalOffset), text, words });
  }

  raw.sort((a, b) => a.time - b.time);
  return raw.map((l, i) => ({
    ...l,
    end: raw[i + 1]?.time ?? Math.max(l.time + 5, duration || l.time + 5),
  }));
}

export function toLrc(lines: LyricLine[]): string {
  return lines
    .map((l) => {
      const m = Math.floor(l.time / 60);
      const s = (l.time % 60).toFixed(2).padStart(5, '0');
      return `[${String(m).padStart(2, '0')}:${s}]${l.text}`;
    })
    .join('\n');
}

/** Index of the active line for a playback position (-1 before the first line). */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Progress (0..1) through a line, word-accurate when word timings are known. */
export function lineProgress(line: LyricLine, position: number): number {
  if (position <= line.time) return 0;
  if (position >= line.end) return 1;
  if (line.words?.length) {
    const total = line.text.length || 1;
    let chars = 0;
    for (let i = 0; i < line.words.length; i++) {
      const w = line.words[i];
      const next = line.words[i + 1]?.time ?? line.end;
      if (position < w.time) break;
      const within = Math.min(1, (position - w.time) / Math.max(0.05, next - w.time));
      chars += w.text.length * (position >= next ? 1 : within);
    }
    return Math.min(1, chars / total);
  }
  // Without word timings, assume singing ends a bit before the next line starts.
  const singEnd = line.time + Math.min(line.end - line.time, Math.max(1.5, line.text.length * 0.09 + 0.6));
  return Math.min(1, (position - line.time) / Math.max(0.3, singEnd - line.time));
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i, '')
    .replace(/\s*[([](official|lyric|lyrics|audio|video|hd|hq|remaster|visualizer|explicit|clean)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([]?(feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const LRCLIB = 'https://lrclib.net/api';
const HEADERS = { 'Lrclib-Client': 'Klangraum v1.0 (https://github.com/vnhngy/vnhngy)', Accept: 'application/json' };

function toLyrics(rec: LrclibRecord, duration: number): Lyrics {
  return {
    synced: rec.syncedLyrics ? parseLrc(rec.syncedLyrics, duration || rec.duration) : null,
    plain: rec.plainLyrics ?? null,
    instrumental: !!rec.instrumental,
    source: 'lrclib',
  };
}

export async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  const title = cleanTitle(track.title);
  const artist = track.artist && track.artist !== 'Unbekannt' ? track.artist : '';

  if (artist) {
    const qs = new URLSearchParams({ track_name: title, artist_name: artist });
    if (track.album) qs.set('album_name', track.album);
    if (track.duration) qs.set('duration', String(Math.round(track.duration)));
    try {
      const res = await fetch(`${LRCLIB}/get?${qs}`, { headers: HEADERS });
      if (res.ok) return toLyrics((await res.json()) as LrclibRecord, track.duration);
    } catch {
      // try search below
    }
  }

  const qs = new URLSearchParams(artist ? { track_name: title, artist_name: artist } : { q: title });
  const res = await fetch(`${LRCLIB}/search?${qs}`, { headers: HEADERS });
  if (!res.ok) throw new Error('Songtexte konnten nicht geladen werden.');
  const results = (await res.json()) as LrclibRecord[];
  if (!results.length) return null;
  // Prefer synced lyrics whose duration is close to ours.
  const scored = results
    .map((r) => ({
      r,
      score: (r.syncedLyrics ? 0 : 100) + (track.duration ? Math.abs(r.duration - track.duration) : 0),
    }))
    .sort((a, b) => a.score - b.score);
  return toLyrics(scored[0].r, track.duration);
}

export async function searchLyrics(query: string): Promise<LrclibRecord[]> {
  const res = await fetch(`${LRCLIB}/search?${new URLSearchParams({ q: query })}`, { headers: HEADERS });
  if (!res.ok) throw new Error('Suche fehlgeschlagen.');
  return ((await res.json()) as LrclibRecord[]).slice(0, 20);
}

export function lyricsFromRecord(rec: LrclibRecord, duration: number): Lyrics {
  return toLyrics(rec, duration);
}

export function lyricsFromText(text: string, duration: number): Lyrics {
  const synced = parseLrc(text, duration);
  return {
    synced: synced.length ? synced : null,
    plain: synced.length ? synced.map((l) => l.text).join('\n') : text.trim(),
    instrumental: false,
    source: 'manual',
  };
}

export type { LrclibRecord };
