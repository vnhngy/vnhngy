"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { Plan, formatEuro, pricePerGuest } from "@/lib/plans";

export default function PricingCard({
  plan,
  onSelect,
}: {
  plan: Plan;
  onSelect: (plan: Plan) => void;
}) {
  return (
    <div
      className={clsx(
        "relative flex flex-col rounded-3xl border p-6",
        plan.highlight
          ? "border-neon-pink/50 bg-card-glow shadow-glow"
          : "border-white/10 bg-white/5"
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-3 py-1 text-xs font-semibold text-white shadow-glow">
          Beliebteste Wahl
        </span>
      )}
      <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
      <p className="mt-1 text-sm text-white/60">{plan.tagline}</p>

      <div className="mt-5">
        <span className="font-display text-4xl font-extrabold text-white">
          {formatEuro(plan.priceCents)}
        </span>
        <p className="mt-1 text-xs text-white/50">{plan.billingLabel}</p>
        <p className="mt-1 text-xs text-neon-cyan">
          ab {formatEuro(pricePerGuest(plan))} pro Person
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-white/80">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-neon-cyan" />
            {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan)}
        className={clsx(
          "mt-6 rounded-xl px-4 py-3 text-center text-sm font-semibold transition active:scale-[0.98]",
          plan.highlight
            ? "bg-gradient-to-r from-neon-pink to-neon-purple text-white shadow-glow"
            : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
        )}
      >
        {plan.name} wählen
      </button>
    </div>
  );
}
