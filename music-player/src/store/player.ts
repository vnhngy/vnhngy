import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlayContext, RepeatMode, Track } from '../lib/types';
import { persistStorage } from './storage';

export interface PlayerState {
  /** Tracks of the current context in their original order. */
  tracks: Track[];
  /** Playback order as indices into `tracks` (shuffled when shuffle is on). */
  order: number[];
  /** Position within `order` of the current (or last) context track. */
  pos: number;
  /** Tracks the user queued manually; they play before the context continues. */
  upNext: Track[];
  current: Track | null;
  context: PlayContext | null;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;

  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  error: string | null;
  loadingRadio: boolean;

  sleepEndsAt: number | null;
  sleepEndOfTrack: boolean;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (): PlayerState => ({
      tracks: [],
      order: [],
      pos: 0,
      upNext: [],
      current: null,
      context: null,
      shuffle: false,
      repeat: 'off',
      rate: 1,
      playing: false,
      buffering: false,
      position: 0,
      duration: 0,
      error: null,
      loadingRadio: false,
      sleepEndsAt: null,
      sleepEndOfTrack: false,
    }),
    {
      name: 'player',
      storage: persistStorage,
      partialize: (s) => ({
        tracks: s.tracks,
        order: s.order,
        pos: s.pos,
        upNext: s.upNext,
        current: s.current,
        context: s.context,
        shuffle: s.shuffle,
        repeat: s.repeat,
        rate: s.rate,
        position: s.position,
        duration: s.duration,
      }),
    },
  ),
);

/** Upcoming context tracks after the current position (respecting shuffle order). */
export function upcomingFromContext(s: Pick<PlayerState, 'tracks' | 'order' | 'pos'>): { track: Track; orderPos: number }[] {
  return s.order.slice(s.pos + 1).map((idx, i) => ({ track: s.tracks[idx], orderPos: s.pos + 1 + i })).filter((x) => x.track);
}
