import type { HistoryEntry, Track } from './types';

export interface Ranked<T> {
  item: T;
  count: number;
  seconds: number;
}

function rank<T>(entries: HistoryEntry[], tracks: Record<string, Track>, keyOf: (t: Track) => string | undefined, valueOf: (t: Track, key: string) => T) {
  const map = new Map<string, Ranked<T>>();
  for (const e of entries) {
    const t = tracks[e.trackId];
    if (!t) continue;
    const key = keyOf(t);
    if (!key) continue;
    const r = map.get(key) ?? { item: valueOf(t, key), count: 0, seconds: 0 };
    r.count++;
    r.seconds += e.seconds;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.seconds - a.seconds);
}

export function since(history: HistoryEntry[], days: number | null) {
  if (days === null) return history;
  const cutoff = Date.now() - days * 86_400_000;
  return history.filter((h) => h.at >= cutoff);
}

export const topTracks = (h: HistoryEntry[], tracks: Record<string, Track>) =>
  rank(h, tracks, (t) => t.id, (t) => t);

export const topArtists = (h: HistoryEntry[], tracks: Record<string, Track>) =>
  rank(h, tracks, (t) => t.artist, (t) => ({ name: t.artist, id: t.artistId, artwork: t.artwork }));

export const topGenres = (h: HistoryEntry[], tracks: Record<string, Track>) =>
  rank(h, tracks, (t) => t.genre, (_t, key) => key);

export function recentTracks(h: HistoryEntry[], tracks: Record<string, Track>, limit = 20): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (let i = h.length - 1; i >= 0 && out.length < limit; i--) {
    const t = tracks[h[i].trackId];
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function listeningByHour(h: HistoryEntry[]): number[] {
  const hours = new Array(24).fill(0);
  for (const e of h) hours[new Date(e.at).getHours()] += e.seconds / 60;
  return hours;
}

export function streakDays(h: HistoryEntry[]): number {
  const days = new Set(h.map((e) => new Date(e.at).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
