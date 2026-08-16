"use client";

import Image from "next/image";
import { Plus, Check, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/format";

export interface SearchResultItem {
  youtubeId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  inCatalog: boolean;
  timesPlayed: number;
}

export default function SongResultCard({
  item,
  onAdd,
  state,
}: {
  item: SearchResultItem;
  onAdd: (item: SearchResultItem) => void;
  state: "idle" | "adding" | "added";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20 hover:bg-white/[0.08]">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        <Image src={item.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
        <p className="truncate text-xs text-white/50">{item.channelTitle}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
          <span>{formatDuration(item.durationSeconds)}</span>
          {item.timesPlayed > 0 && (
            <span className="rounded-full bg-neon-gold/15 px-2 py-0.5 text-neon-gold">
              {item.timesPlayed}× gesungen
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onAdd(item)}
        disabled={state !== "idle"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink to-neon-purple text-white shadow-glow transition active:scale-90 disabled:opacity-70"
        aria-label="Zur Warteschlange hinzufügen"
      >
        {state === "adding" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "added" && <Check className="h-4 w-4" />}
        {state === "idle" && <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
