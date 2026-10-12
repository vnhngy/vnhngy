import { useCallback, useEffect, useState } from 'react';
import { useLibrary, type CachedLyrics } from '../store/library';
import { fetchLyrics } from './lyrics';
import type { Track } from './types';

const WEEK = 7 * 86_400_000;
const pending = new Map<string, Promise<void>>();

/** Loads (and caches) lyrics for a track. Manual lyrics are never overwritten. */
export function useLyrics(track: Track | null | undefined) {
  const cached = useLibrary((s) => (track ? s.lyrics[track.id] : undefined)) as CachedLyrics | undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(
    async (force = false) => {
      if (!track) return;
      const existing = useLibrary.getState().lyrics[track.id];
      if (!force && existing && (existing.source === 'manual' || Date.now() - existing.fetchedAt < WEEK)) return;
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        let p = pending.get(track.id);
        if (!p) {
          p = fetchLyrics(track).then((res) => {
            if (res) useLibrary.getState().setLyrics(track.id, res);
            else throw new NotFound();
          });
          pending.set(track.id, p);
        }
        await p;
      } catch (e) {
        if (e instanceof NotFound) setNotFound(true);
        else setError('Songtext konnte nicht geladen werden. Bist du online?');
      } finally {
        pending.delete(track.id);
        setLoading(false);
      }
    },
    [track],
  );

  useEffect(() => {
    // Fetch on mount / track change; state updates inside load() are intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { lyrics: cached ?? null, loading, error, notFound: notFound && !cached, reload: () => load(true) };
}

class NotFound extends Error {}
