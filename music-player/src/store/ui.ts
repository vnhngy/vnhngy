import { create } from 'zustand';
import type { Track } from '../lib/types';

export interface TrackMenuTarget {
  track: Track;
  playlistId?: string;
  playlistIndex?: number;
}

interface UiState {
  trackMenu: TrackMenuTarget | null;
  addToPlaylist: Track[] | null;
  toast: { id: number; message: string } | null;
  openTrackMenu: (t: TrackMenuTarget) => void;
  closeTrackMenu: () => void;
  openAddToPlaylist: (tracks: Track[]) => void;
  closeAddToPlaylist: () => void;
  showToast: (message: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  trackMenu: null,
  addToPlaylist: null,
  toast: null,
  openTrackMenu: (trackMenu) => set({ trackMenu }),
  closeTrackMenu: () => set({ trackMenu: null }),
  openAddToPlaylist: (addToPlaylist) => set({ addToPlaylist, trackMenu: null }),
  closeAddToPlaylist: () => set({ addToPlaylist: null }),
  showToast: (message) => set({ toast: { id: Date.now(), message } }),
}));

export const toast = (message: string) => useUi.getState().showToast(message);
