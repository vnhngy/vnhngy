import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/format';
import type { Album, Artist, HistoryEntry, KaraokeRecording, Lyrics, Playlist, Track } from '../lib/types';
import { persistStorage } from './storage';

export interface RecentItem {
  kind: 'playlist' | 'artist' | 'album' | 'liked' | 'genre';
  id: string;
  name: string;
  artwork?: string;
  subtitle?: string;
  at: number;
}

export interface CachedLyrics extends Lyrics {
  offset: number;
  fetchedAt: number;
}

interface LibraryState {
  /** Metadata for every track the user has interacted with. */
  tracks: Record<string, Track>;
  liked: Record<string, number>;
  playlists: Playlist[];
  localIds: string[];
  downloads: Record<string, string>;
  followedArtists: Artist[];
  savedAlbums: Album[];
  recentSearches: string[];
  history: HistoryEntry[];
  recent: RecentItem[];
  lyrics: Record<string, CachedLyrics>;
  recordings: KaraokeRecording[];

  upsertTracks: (tracks: Track[]) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  toggleLike: (track: Track) => boolean;
  createPlaylist: (name: string, trackIds?: string[], description?: string) => string;
  updatePlaylist: (id: string, patch: Partial<Pick<Playlist, 'name' | 'description' | 'pinned'>>) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: Track[]) => number;
  removeFromPlaylist: (id: string, index: number) => void;
  movePlaylistTrack: (id: string, from: number, to: number) => void;
  addLocalTracks: (tracks: Track[]) => void;
  removeLocalTrack: (id: string) => void;
  setDownload: (id: string, uri: string) => void;
  removeDownload: (id: string) => void;
  toggleFollowArtist: (artist: Artist) => boolean;
  toggleSaveAlbum: (album: Album) => boolean;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  logListen: (trackId: string, seconds: number) => void;
  pushRecent: (item: Omit<RecentItem, 'at'>) => void;
  setLyrics: (trackId: string, lyrics: Lyrics) => void;
  setLyricsOffset: (trackId: string, offset: number) => void;
  addRecording: (rec: KaraokeRecording) => void;
  removeRecording: (id: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 5000;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      tracks: {},
      liked: {},
      playlists: [],
      localIds: [],
      downloads: {},
      followedArtists: [],
      savedAlbums: [],
      recentSearches: [],
      history: [],
      recent: [],
      lyrics: {},
      recordings: [],

      upsertTracks: (tracks) =>
        set((s) => {
          const next = { ...s.tracks };
          for (const t of tracks) next[t.id] = { ...next[t.id], ...t };
          return { tracks: next };
        }),

      updateTrack: (id, patch) =>
        set((s) => (s.tracks[id] ? { tracks: { ...s.tracks, [id]: { ...s.tracks[id], ...patch } } } : s)),

      toggleLike: (track) => {
        const isLiked = !!get().liked[track.id];
        set((s) => {
          const liked = { ...s.liked };
          if (isLiked) delete liked[track.id];
          else liked[track.id] = Date.now();
          return { liked, tracks: { ...s.tracks, [track.id]: { ...s.tracks[track.id], ...track } } };
        });
        return !isLiked;
      },

      createPlaylist: (name, trackIds = [], description = '') => {
        const id = uid('pl_');
        const now = Date.now();
        set((s) => ({
          playlists: [{ id, name: name.trim() || 'Neue Playlist', description, trackIds, createdAt: now, updatedAt: now }, ...s.playlists],
        }));
        return id;
      },

      updatePlaylist: (id, patch) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) })),

      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

      addToPlaylist: (id, tracks) => {
        let added = 0;
        set((s) => {
          const all = { ...s.tracks };
          for (const t of tracks) all[t.id] = { ...all[t.id], ...t };
          return {
            tracks: all,
            playlists: s.playlists.map((p) => {
              if (p.id !== id) return p;
              const fresh = tracks.map((t) => t.id).filter((tid) => !p.trackIds.includes(tid));
              added = fresh.length;
              return { ...p, trackIds: [...p.trackIds, ...fresh], updatedAt: Date.now() };
            }),
          };
        });
        return added;
      },

      removeFromPlaylist: (id, index) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index), updatedAt: Date.now() } : p,
          ),
        })),

      movePlaylistTrack: (id, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id || to < 0 || to >= p.trackIds.length) return p;
            const ids = p.trackIds.slice();
            const [moved] = ids.splice(from, 1);
            ids.splice(to, 0, moved);
            return { ...p, trackIds: ids, updatedAt: Date.now() };
          }),
        })),

      addLocalTracks: (tracks) =>
        set((s) => {
          const all = { ...s.tracks };
          for (const t of tracks) all[t.id] = t;
          const ids = [...tracks.map((t) => t.id).filter((id) => !s.localIds.includes(id)), ...s.localIds];
          return { tracks: all, localIds: ids };
        }),

      removeLocalTrack: (id) =>
        set((s) => {
          const liked = { ...s.liked };
          delete liked[id];
          return {
            localIds: s.localIds.filter((x) => x !== id),
            liked,
            playlists: s.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((t) => t !== id) })),
          };
        }),

      setDownload: (id, uri) => set((s) => ({ downloads: { ...s.downloads, [id]: uri } })),
      removeDownload: (id) =>
        set((s) => {
          const downloads = { ...s.downloads };
          delete downloads[id];
          return { downloads };
        }),

      toggleFollowArtist: (artist) => {
        const following = get().followedArtists.some((a) => a.id === artist.id);
        set((s) => ({
          followedArtists: following ? s.followedArtists.filter((a) => a.id !== artist.id) : [artist, ...s.followedArtists],
        }));
        return !following;
      },

      toggleSaveAlbum: (album) => {
        const saved = get().savedAlbums.some((a) => a.id === album.id);
        set((s) => ({ savedAlbums: saved ? s.savedAlbums.filter((a) => a.id !== album.id) : [album, ...s.savedAlbums] }));
        return !saved;
      },

      addRecentSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        set((s) => ({ recentSearches: [query, ...s.recentSearches.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 15) }));
      },
      clearRecentSearches: () => set({ recentSearches: [] }),

      logListen: (trackId, seconds) =>
        set((s) => ({ history: [...s.history, { trackId, at: Date.now(), seconds: Math.round(seconds) }].slice(-MAX_HISTORY) })),

      pushRecent: (item) =>
        set((s) => ({
          recent: [{ ...item, at: Date.now() }, ...s.recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 20),
        })),

      setLyrics: (trackId, lyrics) =>
        set((s) => ({
          lyrics: { ...s.lyrics, [trackId]: { ...lyrics, offset: s.lyrics[trackId]?.offset ?? 0, fetchedAt: Date.now() } },
        })),

      setLyricsOffset: (trackId, offset) =>
        set((s) => (s.lyrics[trackId] ? { lyrics: { ...s.lyrics, [trackId]: { ...s.lyrics[trackId], offset } } } : s)),

      addRecording: (rec) => set((s) => ({ recordings: [rec, ...s.recordings] })),
      removeRecording: (id) => set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
      clearHistory: () => set({ history: [], recent: [] }),
    }),
    { name: 'library', storage: persistStorage, version: 1 },
  ),
);

export function likedTracks(s: Pick<LibraryState, 'liked' | 'tracks'>): Track[] {
  return Object.entries(s.liked)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => s.tracks[id])
    .filter(Boolean);
}
