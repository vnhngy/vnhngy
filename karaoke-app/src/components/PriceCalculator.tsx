"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { recommendPlan, formatEuro, pricePerGuest } from "@/lib/plans";

export default function PriceCalculator() {
  const [guests, setGuests] = useState(6);
  const plan = useMemo(() => recommendPlan(guests), [guests]);
  const perGuest = useMemo(() => pricePerGuest(plan, guests), [plan, guests]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-2 text-sm font-medium text-white/70">
        <Users className="h-4 w-4" />
        Wie viele Gäste singen mit?
      </div>
      <input
        type="range"
        min={1}
        max={80}
        value={guests}
        onChange={(e) => setGuests(Number(e.target.value))}
        className="mt-4 w-full accent-neon-pink"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-white/50">
        <span>1</span>
        <span className="font-display text-lg font-bold text-white">{guests} Gäste</span>
        <span>80+</span>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-neon-cyan/80">
            Empfohlener Plan
          </p>
          <p className="font-display text-lg font-bold text-white">{plan.name}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-extrabold text-white">
            {formatEuro(plan.priceCents)}
          </p>
          <p className="text-xs text-white/50">≈ {formatEuro(perGuest)} pro Person</p>
        </div>
      </div>
    </div>
  );
}
