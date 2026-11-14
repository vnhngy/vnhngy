import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/player';

/**
 * Playback position interpolated between native status updates (which arrive
 * every ~250 ms), so lyric highlighting moves smoothly.
 */
export function useSmoothPosition(intervalMs = 80): number {
  const [pos, setPos] = useState(() => usePlayer.getState().position);
  const anchor = useRef({ pos: usePlayer.getState().position, at: 0 });

  useEffect(() => {
    anchor.current = { pos: usePlayer.getState().position, at: Date.now() };
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.position !== prev.position) anchor.current = { pos: s.position, at: Date.now() };
    });
    const id = setInterval(() => {
      const s = usePlayer.getState();
      const elapsed = s.playing ? ((Date.now() - anchor.current.at) / 1000) * s.rate : 0;
      setPos(anchor.current.pos + Math.min(elapsed, 0.6));
    }, intervalMs);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [intervalMs]);

  return pos;
}
