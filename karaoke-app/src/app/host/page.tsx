"use client";

import useSWR from "swr";
import { useState } from "react";
import { Play, SkipForward, X, CheckCircle2, Music2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import YoutubePlayer from "@/components/YoutubePlayer";
import { initials } from "@/lib/format";
import { QueueEntryDTO } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HostPage() {
  const { data, mutate } = useSWR<{ playing: QueueEntryDTO[]; waiting: QueueEntryDTO[] }>(
    "/api/queue",
    fetcher,
    { refreshInterval: 4000 }
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const playing = data?.playing?.[0];
  const waiting = data?.waiting ?? [];

  async function setStatus(id: string, status: "PLAYING" | "PLAYED" | "SKIPPED") {
    setBusyId(id);
    await fetch(`/api/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await mutate();
    setBusyId(null);
  }

  async function removeEntry(id: string) {
    setBusyId(id);
    await fetch(`/api/queue/${id}`, { method: "DELETE" });
    await mutate();
    setBusyId(null);
  }

  async function handleEnded() {
    if (!playing) return;
    await setStatus(playing.id, "PLAYED");
    if (waiting[0]) {
      await setStatus(waiting[0].id, "PLAYING");
    }
  }

  return (
    <main className="min-h-dvh bg-stage-gradient text-white">
      <Navbar />
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        <h1 className="font-display text-2xl font-bold">Moderator:innen-Steuerung</h1>
        <p className="mt-1 text-sm text-white/60">
          Player, Reihenfolge & Songfreigabe für die Bühne.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0">
            {playing ? (
              <>
                <YoutubePlayer videoId={playing.song.youtubeId} onEnded={handleEnded} />
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {playing.singer.name}
                    </p>
                    <p className="truncate text-sm text-white/60">{playing.song.title}</p>
                  </div>
                  <button
                    onClick={() => handleEnded()}
                    disabled={busyId === playing.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
                  >
                    <SkipForward className="h-4 w-4" />
                    Nächster Song
                  </button>
                </div>
              </>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/5 text-white/40">
                <Music2 className="h-8 w-8" />
                Kein Song aktiv — starte einen aus der Warteschlange.
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="mb-3 font-display text-lg font-bold">
              Warteschlange ({waiting.length})
            </h2>
            <ul className="space-y-2">
              {waiting.map((entry, i) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                    {i + 1}
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple to-neon-pink text-xs font-bold">
                    {initials(entry.singer.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {entry.singer.name}
                    </p>
                    <p className="truncate text-xs text-white/50">{entry.song.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setStatus(entry.id, "PLAYING")}
                      disabled={busyId === entry.id}
                      className="rounded-lg bg-neon-cyan/20 p-2 text-neon-cyan transition hover:bg-neon-cyan/30 disabled:opacity-50"
                      title="Jetzt spielen"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setStatus(entry.id, "SKIPPED")}
                      disabled={busyId === entry.id}
                      className="rounded-lg bg-white/10 p-2 text-white/60 transition hover:bg-white/20 disabled:opacity-50"
                      title="Überspringen"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      disabled={busyId === entry.id}
                      className="rounded-lg bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      title="Entfernen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
              {waiting.length === 0 && (
                <li className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-white/40">
                  Niemand wartet gerade.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
