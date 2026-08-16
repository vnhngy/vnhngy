"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search, Loader2, ListMusic } from "lucide-react";
import Navbar from "@/components/Navbar";
import SongResultCard, { SearchResultItem } from "@/components/SongResultCard";
import { UpNextList, NowPlayingCard } from "@/components/QueueList";
import { QueueEntryDTO } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SingPage() {
  const router = useRouter();
  const [singerName, setSingerName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [karaokeOnly, setKaraokeOnly] = useState(true);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addState, setAddState] = useState<Record<string, "adding" | "added">>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: queueData, mutate } = useSWR<{
    playing: QueueEntryDTO[];
    waiting: QueueEntryDTO[];
  }>("/api/queue", fetcher, { refreshInterval: 4000 });

  useEffect(() => {
    fetch("/api/singers")
      .then((r) => r.json())
      .then((data) => {
        if (!data.singer) {
          router.replace("/join?next=/sing");
        } else {
          setSingerName(data.singer.name);
        }
      });
  }, [router]);

  const runSearch = useCallback((q: string, karaoke: boolean) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&karaokeOnly=${karaoke}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? []);
        if (data.youtubeError) setSearchError(data.youtubeError);
      })
      .catch(() => setSearchError("Suche fehlgeschlagen. Bitte erneut versuchen."))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, karaokeOnly), 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, karaokeOnly, runSearch]);

  async function handleAdd(item: SearchResultItem) {
    setAddState((s) => ({ ...s, [item.youtubeId]: "adding" }));
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtubeId: item.youtubeId,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: item.durationSeconds,
      }),
    });
    if (res.ok) {
      setAddState((s) => ({ ...s, [item.youtubeId]: "added" }));
      mutate();
    } else {
      const data = await res.json().catch(() => ({}));
      setSearchError(data.error ?? "Hinzufügen fehlgeschlagen.");
      setAddState((s) => {
        const next = { ...s };
        delete next[item.youtubeId];
        return next;
      });
    }
  }

  const playing = queueData?.playing?.[0];
  const waiting = queueData?.waiting ?? [];
  const myPosition =
    singerName != null
      ? waiting.findIndex((e) => e.singer.name === singerName) + 1
      : 0;

  return (
    <main className="min-h-dvh bg-stage-gradient text-white">
      <Navbar />
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <h1 className="font-display text-2xl font-bold">
          Hey {singerName ?? "…"} 👋
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Such deinen Song aus der YouTube-Datenbank und reih dich in die Warteschlange ein.
        </p>

        {myPosition > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 px-4 py-2.5 text-sm text-neon-cyan">
            <ListMusic className="h-4 w-4" />
            Du bist aktuell Platz {myPosition} in der Warteschlange.
          </div>
        )}

        <div className="mt-6">
          <NowPlayingCard entry={playing} />
        </div>

        <div className="sticky top-16 z-10 mt-6 rounded-2xl border border-white/10 bg-stage-950/80 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Songtitel oder Interpret suchen…"
              className="w-full bg-transparent py-3 text-base text-white placeholder-white/30 outline-none"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/40" />}
          </div>
          <label className="mt-2 flex items-center gap-2 px-1 text-xs text-white/50">
            <input
              type="checkbox"
              checked={karaokeOnly}
              onChange={(e) => setKaraokeOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/30 bg-transparent accent-neon-pink"
            />
            Nur Karaoke-Versionen anzeigen
          </label>
        </div>

        {searchError && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {searchError}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {results.map((item) => (
            <SongResultCard
              key={item.youtubeId}
              item={item}
              onAdd={handleAdd}
              state={addState[item.youtubeId] ?? "idle"}
            />
          ))}
          {!searching && query.trim().length >= 2 && results.length === 0 && !searchError && (
            <p className="py-8 text-center text-sm text-white/40">
              Keine Songs gefunden. Versuch einen anderen Suchbegriff.
            </p>
          )}
        </div>

        <div className="mt-10">
          <h2 className="mb-3 font-display text-lg font-bold">Warteschlange</h2>
          <UpNextList entries={waiting} />
        </div>
      </div>
    </main>
  );
}
