"use client";

import Image from "next/image";
import { Mic2, Clock } from "lucide-react";
import clsx from "clsx";
import { QueueEntryDTO } from "@/lib/types";
import { initials, formatDuration } from "@/lib/format";

export function NowPlayingCard({ entry }: { entry: QueueEntryDTO | undefined }) {
  if (!entry) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-white/50">
        Gerade singt niemand — die Bühne ist frei! 🎤
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neon-pink/30 bg-card-glow p-6 shadow-glow">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-neon-pink/20 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-neon-pink/60">
          <Image
            src={entry.song.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0">
          <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-neon-pink/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-neon-pink">
            <Mic2 className="h-3 w-3" /> Jetzt auf der Bühne
          </p>
          <h3 className="truncate font-display text-lg font-bold text-white">
            {entry.singer.name}
          </h3>
          <p className="truncate text-sm text-white/70">{entry.song.title}</p>
        </div>
      </div>
    </div>
  );
}

export function UpNextList({
  entries,
  emphasizeFirst = true,
}: {
  entries: QueueEntryDTO[];
  emphasizeFirst?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-white/50">
        Die Warteschlange ist leer. Sei die/der Erste! 🎶
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry, i) => (
        <li
          key={entry.id}
          className={clsx(
            "flex items-center gap-4 rounded-2xl border p-4 transition",
            i === 0 && emphasizeFirst
              ? "border-neon-cyan/40 bg-neon-cyan/10 shadow-glow-cyan"
              : "border-white/10 bg-white/5"
          )}
        >
          <div
            className={clsx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
              i === 0 && emphasizeFirst
                ? "bg-neon-cyan text-stage-950"
                : "bg-white/10 text-white/70"
            )}
          >
            {i + 1}
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neon-purple to-neon-pink text-sm font-bold text-white">
            {initials(entry.singer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{entry.singer.name}</p>
            <p className="truncate text-sm text-white/60">{entry.song.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-white/40">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(entry.song.durationSeconds)}
          </div>
        </li>
      ))}
    </ol>
  );
}
