/**
 * Playback engine: owns the native audio player(s) and drives the queue.
 *
 * UI code never touches expo-audio directly for music playback; it calls the
 * functions exported here and reads state from `usePlayer`.
 */
import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { Platform } from 'react-native';
import { audius } from '../lib/audius';
import { shuffleArray } from '../lib/format';
import type { PlayContext, RepeatMode, Track } from '../lib/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';

let player: AudioPlayer | null = null;
let statusSub: { remove: () => void } | null = null;
let loadToken = 0;
let initialized = false;
let crossfading = false;
let crossfadeTriedFor = '';
let baseVolume = 1;
let listened = { trackId: '', seconds: 0, lastPos: 0 };
let notificationsAsked = false;
let pendingRestoreSeek: number | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let holdAtEnd = false;
const endListeners = new Set<() => void>();

const get = () => usePlayer.getState();
const set = (patch: Partial<ReturnType<typeof usePlayer.getState>>) => usePlayer.setState(patch);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function initEngine() {
  if (initialized) return;
  initialized = true;
  await configureAudioSession(false);
  player = makePlayer(null);

  // Restore the last session paused at its previous position.
  const { current, position } = get();
  set({ playing: false, buffering: false, sleepEndsAt: null, sleepEndOfTrack: false });
  if (current) {
    const src = await resolveSource(current).catch(() => null);
    if (src && player) {
      pendingRestoreSeek = position > 2 ? position : null;
      player.replace(src);
      applyRate();
      updateLockScreen(current);
    }
  }
  setInterval(tickSleepTimer, 1000);
}

export async function configureAudioSession(recording: boolean) {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: recording,
    shouldRouteThroughEarpiece: false,
  });
}

function makePlayer(source: string | null): AudioPlayer {
  const p = createAudioPlayer(source, { updateInterval: 250, keepAudioSessionActive: true });
  attach(p);
  return p;
}

function attach(p: AudioPlayer) {
  statusSub?.remove();
  statusSub = p.addListener('playbackStatusUpdate', (s) => onStatus(p, s));
}

// ---------------------------------------------------------------------------
// Status handling
// ---------------------------------------------------------------------------

function onStatus(p: AudioPlayer, s: AudioStatus) {
  if (p !== player) return;

  if (pendingRestoreSeek != null && s.isLoaded && s.duration > 0) {
    const to = pendingRestoreSeek;
    pendingRestoreSeek = null;
    p.seekTo(to).catch(() => {});
  }

  const { current } = get();
  if (current && listened.trackId === current.id && s.playing) {
    const delta = s.currentTime - listened.lastPos;
    if (delta > 0 && delta < 2) listened.seconds += delta;
  }
  listened.lastPos = s.currentTime;

  set({
    playing: s.playing,
    buffering: s.isBuffering && !s.isLoaded,
    position: s.currentTime,
    duration: s.duration > 0 ? s.duration : current?.duration ?? 0,
    error: s.error ?? null,
  });

  const fade = useSettings.getState().crossfade;
  if (
    fade > 0 &&
    !holdAtEnd &&
    !crossfading &&
    current &&
    crossfadeTriedFor !== current.id &&
    s.playing &&
    get().repeat !== 'one' &&
    !get().sleepEndOfTrack &&
    s.duration > fade * 3 &&
    s.duration - s.currentTime <= fade
  ) {
    crossfading = true;
    crossfadeTriedFor = current.id;
    advance({ crossfade: true }).catch(() => (crossfading = false));
    return;
  }

  if (s.didJustFinish) onTrackEnded();
}

function onTrackEnded() {
  endListeners.forEach((fn) => fn());
  if (holdAtEnd) {
    player?.pause();
    return;
  }
  const st = get();
  if (st.sleepEndOfTrack) {
    set({ sleepEndOfTrack: false });
    player?.pause();
    return;
  }
  if (st.repeat === 'one') {
    player?.seekTo(0).then(() => player?.play());
    return;
  }
  advance({ auto: true });
}

function flushListen() {
  if (listened.trackId && listened.seconds >= 30) {
    useLibrary.getState().logListen(listened.trackId, listened.seconds);
  }
  listened = { trackId: '', seconds: 0, lastPos: 0 };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function resolveSource(track: Track): Promise<string> {
  if (track.source === 'local' && track.uri) return track.uri;
  const downloaded = useLibrary.getState().downloads[track.id];
  if (downloaded) return downloaded;
  if (useSettings.getState().offlineMode) throw new Error('Offline-Modus: Dieser Song ist nicht heruntergeladen.');
  return audius.streamUrl(track.id);
}

async function load(track: Track, opts: { play?: boolean; crossfade?: boolean } = {}) {
  const token = ++loadToken;
  const shouldPlay = opts.play ?? true;
  flushListen();
  listened = { trackId: track.id, seconds: 0, lastPos: 0 };
  pendingRestoreSeek = null;
  set({ current: track, position: 0, duration: track.duration, error: null, buffering: true });
  useLibrary.getState().upsertTracks([track]);

  let src: string;
  try {
    src = await resolveSource(track);
  } catch (e) {
    crossfading = false;
    if (token !== loadToken) return;
    set({ error: (e as Error).message, buffering: false });
    // Skip songs that can't be played (e.g. offline) instead of stalling.
    if (shouldPlay) setTimeout(() => token === loadToken && advance({ auto: true }), 600);
    return;
  }
  if (token !== loadToken) return;

  if (shouldPlay && Platform.OS === 'android' && !notificationsAsked) {
    notificationsAsked = true;
    requestNotificationPermissionsAsync().catch(() => {});
  }

  const fadeSeconds = useSettings.getState().crossfade;
  if (opts.crossfade && player && fadeSeconds > 0) {
    const old = player;
    old.clearLockScreenControls();
    player = makePlayer(src);
    player.volume = 0;
    applyRate();
    player.play();
    rampVolumes(old, player, fadeSeconds * 1000, () => {
      old.remove();
      crossfading = false;
    });
  } else {
    crossfading = false;
    if (!player) player = makePlayer(null);
    player.replace(src);
    applyRate();
    if (shouldPlay) {
      if (useSettings.getState().smoothStart) {
        player.volume = 0;
        player.play();
        rampVolumes(null, player, 1500);
      } else {
        player.volume = baseVolume;
        player.play();
      }
    }
  }
  updateLockScreen(track);
}

function rampVolumes(from: AudioPlayer | null, to: AudioPlayer | null, ms: number, done?: () => void) {
  if (fadeTimer) clearInterval(fadeTimer);
  const start = Date.now();
  const startFrom = from?.volume ?? 0;
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    try {
      if (from) from.volume = startFrom * (1 - t);
      if (to) to.volume = baseVolume * t;
    } catch {
      // player was released mid-fade
    }
    if (t >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      done?.();
    }
  }, 50);
}

function updateLockScreen(track: Track) {
  try {
    player?.setActiveForLockScreen(
      true,
      { title: track.title, artist: track.artist, albumTitle: track.album, artworkUrl: track.artwork },
      { showSeekBackward: true, showSeekForward: true },
    );
  } catch {
    // Lock screen controls are unavailable on some platforms (e.g. web).
  }
}

function applyRate() {
  if (!player) return;
  player.shouldCorrectPitch = true;
  player.setPlaybackRate(get().rate, 'high');
}

// ---------------------------------------------------------------------------
// Queue navigation
// ---------------------------------------------------------------------------

function buildOrder(length: number, start: number, shuffle: boolean): { order: number[]; pos: number } {
  const identity = Array.from({ length }, (_, i) => i);
  if (!shuffle) return { order: identity, pos: start };
  const rest = shuffleArray(identity.filter((i) => i !== start));
  return { order: [start, ...rest], pos: 0 };
}

export async function playList(tracks: Track[], startIndex = 0, context: PlayContext, opts: { shuffle?: boolean; play?: boolean } = {}) {
  if (!tracks.length) return;
  const shuffle = opts.shuffle ?? get().shuffle;
  const start = opts.shuffle && startIndex === 0 ? Math.floor(Math.random() * tracks.length) : startIndex;
  const { order, pos } = buildOrder(tracks.length, start, shuffle);
  set({ tracks, order, pos, context, shuffle });
  await load(tracks[order[pos]], { play: opts.play });
}

export function playTrack(track: Track, context: PlayContext = { type: 'other', name: track.title }) {
  return playList([track], 0, context);
}

export async function advance(opts: { auto?: boolean; crossfade?: boolean } = {}) {
  const st = get();
  if (st.upNext.length) {
    const [nextTrack, ...rest] = st.upNext;
    set({ upNext: rest });
    return load(nextTrack, { crossfade: opts.crossfade });
  }
  if (st.pos + 1 < st.order.length) {
    set({ pos: st.pos + 1 });
    return load(st.tracks[st.order[st.pos + 1]], { crossfade: opts.crossfade });
  }
  if (st.repeat === 'all' && st.tracks.length) {
    const { order } = buildOrder(st.tracks.length, 0, st.shuffle);
    set({ order, pos: 0 });
    return load(st.tracks[order[0]], { crossfade: opts.crossfade });
  }
  if (useSettings.getState().autoplay && st.current && !useSettings.getState().offlineMode) {
    const added = await extendWithRadio(st.current);
    if (added) return advance(opts);
  }
  crossfading = false;
  if (opts.auto) {
    player?.pause();
    await player?.seekTo(0).catch(() => {});
  }
}

async function extendWithRadio(seed: Track): Promise<boolean> {
  set({ loadingRadio: true });
  try {
    const exclude = new Set(get().tracks.map((t) => t.id));
    const more = await audius.radio(seed, exclude);
    if (!more.length) return false;
    const st = get();
    const base = st.tracks.length;
    set({
      tracks: [...st.tracks, ...more],
      order: [...st.order, ...more.map((_, i) => base + i)],
    });
    return true;
  } catch {
    return false;
  } finally {
    set({ loadingRadio: false });
  }
}

export async function previous() {
  const st = get();
  if (st.position > 3 || st.pos === 0) {
    await seek(0);
    return;
  }
  set({ pos: st.pos - 1 });
  await load(st.tracks[st.order[st.pos - 1]]);
}

export function next() {
  return advance();
}

export async function jumpTo(orderPos: number) {
  const st = get();
  if (orderPos < 0 || orderPos >= st.order.length) return;
  set({ pos: orderPos });
  await load(st.tracks[st.order[orderPos]]);
}

export async function playFromUpNext(index: number) {
  const st = get();
  const track = st.upNext[index];
  if (!track) return;
  set({ upNext: st.upNext.slice(index + 1) });
  await load(track);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export function play() {
  const st = get();
  if (!st.current) return;
  if (!player) return;
  if (!player.isLoaded && !st.buffering) {
    load(st.current);
    return;
  }
  player.play();
}

export function pause() {
  player?.pause();
}

export function toggle() {
  if (get().playing) pause();
  else play();
}

export async function seek(seconds: number) {
  if (!player) return;
  const d = get().duration;
  const to = Math.max(0, d ? Math.min(seconds, d - 0.5) : seconds);
  set({ position: to });
  listened.lastPos = to;
  await player.seekTo(to).catch(() => {});
}

export function skipBy(seconds: number) {
  return seek(get().position + seconds);
}

export function setRate(rate: number) {
  set({ rate });
  applyRate();
}

export function setVolume(v: number) {
  baseVolume = Math.max(0, Math.min(1, v));
  if (player && !fadeTimer) player.volume = baseVolume;
}

export function getVolume() {
  return baseVolume;
}

export function setShuffle(on: boolean) {
  const st = get();
  if (!st.tracks.length) {
    set({ shuffle: on });
    return;
  }
  const currentIdx = st.order[st.pos] ?? 0;
  const { order, pos } = buildOrder(st.tracks.length, currentIdx, on);
  set({ shuffle: on, order, pos });
}

export function cycleRepeat() {
  const nextMode: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
  set({ repeat: nextMode[get().repeat] });
}

// ---------------------------------------------------------------------------
// Queue editing
// ---------------------------------------------------------------------------

export function playNext(track: Track) {
  useLibrary.getState().upsertTracks([track]);
  if (!get().current) return playTrack(track);
  set({ upNext: [track, ...get().upNext] });
}

export function addToQueue(tracks: Track[]) {
  useLibrary.getState().upsertTracks(tracks);
  if (!get().current && tracks.length) return playList(tracks, 0, { type: 'other', name: 'Warteschlange' });
  set({ upNext: [...get().upNext, ...tracks] });
}

export function removeFromUpNext(index: number) {
  set({ upNext: get().upNext.filter((_, i) => i !== index) });
}

export function moveUpNext(from: number, to: number) {
  const list = get().upNext.slice();
  if (to < 0 || to >= list.length) return;
  const [m] = list.splice(from, 1);
  list.splice(to, 0, m);
  set({ upNext: list });
}

export function clearUpNext() {
  set({ upNext: [] });
}

export function removeUpcoming(orderPos: number) {
  const st = get();
  if (orderPos <= st.pos) return;
  set({ order: st.order.filter((_, i) => i !== orderPos) });
}

export async function startRadio(seed: Track) {
  set({ loadingRadio: true });
  try {
    const more = await audius.radio(seed, new Set([seed.id]));
    await playList([seed, ...more], 0, { type: 'radio', id: seed.id, name: `${seed.title}-Radio` }, { shuffle: false });
  } finally {
    set({ loadingRadio: false });
  }
}

// ---------------------------------------------------------------------------
// Sleep timer
// ---------------------------------------------------------------------------

export function setSleepTimer(minutes: number | 'track' | null) {
  if (minutes === null) set({ sleepEndsAt: null, sleepEndOfTrack: false });
  else if (minutes === 'track') set({ sleepEndsAt: null, sleepEndOfTrack: true });
  else set({ sleepEndsAt: Date.now() + minutes * 60_000, sleepEndOfTrack: false });
}

function tickSleepTimer() {
  const { sleepEndsAt } = get();
  if (!sleepEndsAt || !player) return;
  const remaining = sleepEndsAt - Date.now();
  if (remaining <= 0) {
    set({ sleepEndsAt: null });
    const p = player;
    rampVolumes(p, null, 4000, () => {
      p.pause();
      p.volume = baseVolume;
    });
  }
}

/** Karaoke: stop at the end of the current song instead of advancing. */
export function setHoldAtEnd(on: boolean) {
  holdAtEnd = on;
}

export function onTrackEnd(fn: () => void): () => void {
  endListeners.add(fn);
  return () => endListeners.delete(fn);
}

/** Exposed for the karaoke screen, which needs precise access to the position. */
export function getPlayer(): AudioPlayer | null {
  return player;
}
