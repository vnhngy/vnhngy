import { useCallback, useEffect, useRef, useState } from 'react';

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 10 * 60_000;

/** Small data-fetching hook with an in-memory cache keyed by `key`. */
export function useAsync<T>(key: string | null, fn: () => Promise<T>) {
  const hit = key ? cache.get(key) : undefined;
  const [data, setData] = useState<T | undefined>(hit?.data as T | undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!key && !hit);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(
    async (force = false) => {
      if (!key) return;
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < TTL) {
        setData(cached.data as T);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await fnRef.current();
        cache.set(key, { at: Date.now(), data: result });
        setData(result);
      } catch (e) {
        setError((e as Error).message || 'Etwas ist schiefgelaufen.');
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    // Fetch on mount / key change; state updates inside run() are intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
  }, [run]);

  return { data, error, loading, reload: () => run(true) };
}
