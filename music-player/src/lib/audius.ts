/**
 * Client for the public Audius API (https://docs.audius.org) — a free, open
 * music catalog with full-length, legally streamable tracks. No API key needed.
 */
import type { Album, Artist, Track } from './types';

const APP_NAME = 'klangraum';
const CANDIDATE_HOSTS = ['https://api.audius.co', 'https://discoveryprovider.audius.co'];

let hostPromise: Promise<string> | null = null;

async function probe(host: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${host}/v1/tracks/trending?limit=1&app_name=${APP_NAME}`, 6000);
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveHost(): Promise<string> {
  for (const host of CANDIDATE_HOSTS) {
    if (await probe(host)) return host;
  }
  // Ask the gateway for its list of discovery nodes as a last resort.
  try {
    const res = await fetchWithTimeout('https://api.audius.co', 6000);
    const json = (await res.json()) as { data?: string[] };
    for (const host of json.data ?? []) {
      if (await probe(host)) return host;
    }
  } catch {
    // fall through
  }
  throw new Error('Der Musikkatalog ist gerade nicht erreichbar. Bitte prüfe deine Internetverbindung.');
}

function getHost(): Promise<string> {
  if (!hostPromise) {
    hostPromise = resolveHost().catch((e) => {
      hostPromise = null;
      throw e;
    });
  }
  return hostPromise;
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const host = await getHost();
  const qs = new URLSearchParams({ app_name: APP_NAME });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetchWithTimeout(`${host}/v1${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Anfrage fehlgeschlagen (${res.status})`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

type Sizes = Partial<Record<'150x150' | '480x480' | '1000x1000', string>> | null | undefined;

interface RawUser {
  id: string;
  name: string;
  handle: string;
  profile_picture?: Sizes;
  follower_count?: number;
  is_verified?: boolean;
  bio?: string | null;
}

interface RawTrack {
  id: string;
  title: string;
  user: RawUser;
  artwork?: Sizes;
  duration: number;
  genre?: string;
  mood?: string | null;
  play_count?: number;
  is_streamable?: boolean;
}

interface RawPlaylist {
  id: string;
  playlist_name: string;
  user: RawUser;
  artwork?: Sizes;
  is_album: boolean;
  track_count: number;
  description?: string | null;
}

const pick = (s: Sizes, large = false) => (s ? (large ? s['1000x1000'] ?? s['480x480'] : s['480x480'] ?? s['150x150']) : undefined);

export function mapTrack(t: RawTrack): Track {
  return {
    id: `audius:${t.id}`,
    source: 'audius',
    title: t.title,
    artist: t.user?.name ?? 'Unbekannt',
    artistId: t.user?.id,
    artwork: pick(t.artwork),
    duration: t.duration ?? 0,
    genre: t.genre || undefined,
    mood: t.mood || undefined,
    playCount: t.play_count,
  };
}

function mapUser(u: RawUser): Artist {
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    picture: pick(u.profile_picture),
    followers: u.follower_count,
    verified: u.is_verified,
    bio: u.bio ?? undefined,
  };
}

function mapPlaylist(p: RawPlaylist): Album {
  return {
    id: p.id,
    name: p.playlist_name,
    artist: p.user?.name ?? '',
    artwork: pick(p.artwork),
    isAlbum: p.is_album,
    trackCount: p.track_count,
    description: p.description ?? undefined,
  };
}

const streamable = (tracks: RawTrack[]) => tracks.filter((t) => t && t.is_streamable !== false).map(mapTrack);

export const GENRES = [
  { name: 'Electronic', label: 'Electronic', color: '#7A4DFF' },
  { name: 'Hip-Hop/Rap', label: 'Hip-Hop', color: '#E8115B' },
  { name: 'Pop', label: 'Pop', color: '#1E3264' },
  { name: 'Rock', label: 'Rock', color: '#BA5D07' },
  { name: 'R&B/Soul', label: 'R&B / Soul', color: '#8D67AB' },
  { name: 'Alternative', label: 'Alternative', color: '#477D95' },
  { name: 'House', label: 'House', color: '#148A08' },
  { name: 'Lo-Fi', label: 'Lo-Fi', color: '#503750' },
  { name: 'Ambient', label: 'Ambient', color: '#1D4B5A' },
  { name: 'Techno', label: 'Techno', color: '#535353' },
  { name: 'Jazz', label: 'Jazz', color: '#B06239' },
  { name: 'Acoustic', label: 'Akustik', color: '#608108' },
  { name: 'Classical', label: 'Klassik', color: '#7D4B32' },
  { name: 'Latin', label: 'Latin', color: '#E1118C' },
  { name: 'Folk', label: 'Folk', color: '#AF2896' },
  { name: 'Soundtrack', label: 'Soundtrack', color: '#283EA3' },
];

export const MOODS = ['Energizing', 'Peaceful', 'Romantic', 'Upbeat', 'Melancholy', 'Easygoing', 'Aggressive', 'Sensual'];

export const audius = {
  streamUrl: async (trackId: string) => {
    const host = await getHost();
    return `${host}/v1/tracks/${trackId.replace('audius:', '')}/stream?app_name=${APP_NAME}`;
  },

  trending: async (genre?: string, time: 'week' | 'month' | 'allTime' = 'week') =>
    streamable(await get<RawTrack[]>('/tracks/trending', { genre, time })),

  undergroundTrending: async () => streamable(await get<RawTrack[]>('/tracks/trending/underground', { limit: 30 })),

  searchTracks: async (query: string) => streamable(await get<RawTrack[]>('/tracks/search', { query })),

  searchArtists: async (query: string) => (await get<RawUser[]>('/users/search', { query })).map(mapUser),

  searchPlaylists: async (query: string) => (await get<RawPlaylist[]>('/playlists/search', { query })).map(mapPlaylist),

  trendingPlaylists: async () => (await get<RawPlaylist[]>('/playlists/trending', { time: 'week' })).map(mapPlaylist),

  artist: async (id: string) => mapUser(await get<RawUser>(`/users/${id}`)),

  artistTracks: async (id: string) => streamable(await get<RawTrack[]>(`/users/${id}/tracks`, { sort: 'plays', limit: 50 })),

  playlist: async (id: string) => {
    const data = await get<RawPlaylist[] | RawPlaylist>(`/playlists/${id}`);
    return mapPlaylist(Array.isArray(data) ? data[0] : data);
  },

  playlistTracks: async (id: string) => streamable(await get<RawTrack[]>(`/playlists/${id}/tracks`)),

  /** "Song radio": tracks related to a seed by genre and mood, mixed with the artist's own hits. */
  radio: async (seed: Track, exclude: Set<string> = new Set()) => {
    const [byGenre, byArtist] = await Promise.all([
      seed.genre ? audius.trending(seed.genre, 'month').catch(() => []) : audius.trending().catch(() => []),
      seed.source === 'audius' && seed.artistId ? audius.artistTracks(seed.artistId).catch(() => []) : Promise.resolve([] as Track[]),
    ]);
    const pool = [...byArtist.slice(0, 5), ...byGenre].filter((t) => t.id !== seed.id && !exclude.has(t.id));
    const seen = new Set<string>();
    const unique = pool.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unique[i], unique[j]] = [unique[j], unique[i]];
    }
    return unique.slice(0, 25);
  },
};
