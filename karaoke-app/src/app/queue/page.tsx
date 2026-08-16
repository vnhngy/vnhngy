"use client";

import useSWR from "swr";
import Link from "next/link";
import { Mic2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { NowPlayingCard, UpNextList } from "@/components/QueueList";
import { QueueEntryDTO } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function QueuePage() {
  const { data } = useSWR<{ playing: QueueEntryDTO[]; waiting: QueueEntryDTO[] }>(
    "/api/queue",
    fetcher,
    { refreshInterval: 3000 }
  );

  const playing = data?.playing?.[0];
  const waiting = data?.waiting ?? [];

  return (
    <main className="min-h-dvh bg-stage-gradient text-white">
      <Navbar />
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Live-Warteschlange</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan" />
            live
          </span>
        </div>

        <NowPlayingCard entry={playing} />

        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">
            Als Nächstes dran ({waiting.length})
          </h2>
          <UpNextList entries={waiting} />
        </div>

        <div className="mt-10 rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-center">
          <Mic2 className="mx-auto mb-2 h-5 w-5 text-white/40" />
          <p className="text-sm text-white/60">Willst du auch singen?</p>
          <Link
            href="/join"
            className="mt-3 inline-flex rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-5 py-2 text-sm font-semibold shadow-glow"
          >
            Jetzt anmelden
          </Link>
        </div>
      </div>
    </main>
  );
}
