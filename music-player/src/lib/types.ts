export type TrackSource = 'audius' | 'local';

export interface Track {
  /** Globally unique id, prefixed with the source (e.g. `audius:abc`, `local:123`). */
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  artwork?: string;
  /** Duration in seconds (0 when unknown). */
  duration: number;
  genre?: string;
  mood?: string;
  /** Local file uri for imported tracks. */
  uri?: string;
  playCount?: number;
}

export interface Artist {
  id: string;
  name: string;
  handle?: string;
  picture?: string;
  followers?: number;
  verified?: boolean;
  bio?: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  artwork?: string;
  isAlbum: boolean;
  trackCount: number;
  description?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayContext {
  type: 'playlist' | 'album' | 'artist' | 'liked' | 'search' | 'genre' | 'radio' | 'library' | 'karaoke' | 'other';
  id?: string;
  name: string;
}

export interface LyricWord {
  time: number;
  text: string;
}

export interface LyricLine {
  time: number;
  /** End time of the line (start of the next line, or track end). */
  end: number;
  text: string;
  /** Present when the source had word-level timestamps (enhanced LRC). */
  words?: LyricWord[];
}

export interface Lyrics {
  synced: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
  source: 'lrclib' | 'manual';
}

export interface HistoryEntry {
  trackId: string;
  at: number;
  seconds: number;
}

export interface KaraokeRecording {
  id: string;
  trackId: string;
  singer: string;
  uri: string;
  score: number;
  timing: number;
  stability: number;
  lineScores: number[];
  /** Song position (s) when the recording started, needed to replay the mix in sync. */
  songOffset: number;
  /** Seconds of countdown recorded before the music started. */
  lead: number;
  duration: number;
  createdAt: number;
}
