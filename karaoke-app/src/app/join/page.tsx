"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic2, ArrowRight } from "lucide-react";

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wer schon einen Namen hinterlegt hat, muss ihn nicht erneut eingeben.
    fetch("/api/singers")
      .then((r) => r.json())
      .then((data) => {
        if (data.singer) {
          router.replace(`/sing${params.get("next") ? `?next=${params.get("next")}` : ""}`);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Bitte gib deinen Namen ein.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/singers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen.");
        return;
      }
      router.push("/sing");
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-stage-gradient flex flex-col items-center justify-center px-6 py-16 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-pink to-neon-purple shadow-glow">
            <Mic2 className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-bold">Bevor es losgeht…</h1>
          <p className="mt-2 text-sm text-white/60">
            Trag deinen Namen ein — er wird in der Warteschlange angezeigt,
            wenn du an der Reihe bist.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
        >
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-white/80">
            Dein Name
          </label>
          <input
            id="name"
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Alex"
            className="w-full rounded-xl border border-white/10 bg-stage-950/60 px-4 py-3 text-base text-white placeholder-white/30 outline-none ring-neon-pink/50 focus:ring-2"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon-pink to-neon-purple px-4 py-3 font-semibold text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Einen Moment…" : "Weiter zur Songsuche"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          Kein Konto nötig. Dein Name bleibt nur für diesen Abend gespeichert.
        </p>
      </div>
    </main>
  );
}
