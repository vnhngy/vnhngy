import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccentKey } from '../lib/theme';
import { persistStorage } from './storage';

export type ThemeMode = 'system' | 'dark' | 'light';

interface SettingsState {
  themeMode: ThemeMode;
  accent: AccentKey;
  /** Crossfade between tracks in seconds (0 = off). */
  crossfade: number;
  /** Continue with similar songs when the queue ends. */
  autoplay: boolean;
  /** Only show downloaded and imported music. */
  offlineMode: boolean;
  /** Fade in at the start of each track. */
  smoothStart: boolean;
  showLyricsInPlayer: boolean;
  lyricsFontSize: number;
  karaokeCountdown: number;
  /** dB above ambient noise that counts as singing. */
  karaokeSensitivity: number;
  karaokeMusicVolume: number;
  singerName: string;
  haptics: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      accent: 'gruen',
      crossfade: 0,
      autoplay: true,
      offlineMode: false,
      smoothStart: false,
      showLyricsInPlayer: true,
      lyricsFontSize: 26,
      karaokeCountdown: 3,
      karaokeSensitivity: 10,
      karaokeMusicVolume: 0.7,
      singerName: 'Ich',
      haptics: true,
      set: (patch) => set(patch),
    }),
    { name: 'settings', storage: persistStorage },
  ),
);
