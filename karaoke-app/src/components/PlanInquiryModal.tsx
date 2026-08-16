"use client";

import { useState } from "react";
import { X, PartyPopper } from "lucide-react";
import { Plan, formatEuro } from "@/lib/plans";

export default function PlanInquiryModal({
  plan,
  onClose,
}: {
  plan: Plan;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan.id.toUpperCase(),
          name,
          email,
          guests: guests ? Number(guests) : undefined,
          eventDate: eventDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Anfrage fehlgeschlagen.");
        return;
      }
      setDone(true);
    } catch {
      setError("Verbindung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-stage-900 p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-neon-cyan">{plan.name}</p>
            <h3 className="font-display text-xl font-bold text-white">
              {formatEuro(plan.priceCents)} — Anfrage senden
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/50 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <PartyPopper className="h-10 w-10 text-neon-gold" />
            <p className="font-semibold text-white">Danke, {name}!</p>
            <p className="text-sm text-white/60">
              Wir melden uns per E-Mail, um deine Buchung für den Plan „{plan.name}“
              abzuschließen.
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full rounded-xl border border-white/10 bg-stage-950/60 px-4 py-3 text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-neon-pink/50"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail"
              className="w-full rounded-xl border border-white/10 bg-stage-950/60 px-4 py-3 text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-neon-pink/50"
            />
            <div className="flex gap-3">
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                placeholder="Anzahl Gäste"
                className="w-full rounded-xl border border-white/10 bg-stage-950/60 px-4 py-3 text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-neon-pink/50"
              />
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-stage-950/60 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-neon-pink/50"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-neon-pink to-neon-purple px-4 py-3 font-semibold text-white shadow-glow disabled:opacity-60"
            >
              {loading ? "Wird gesendet…" : "Anfrage senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
