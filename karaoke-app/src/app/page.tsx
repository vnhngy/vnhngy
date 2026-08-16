"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mic2,
  Search,
  ListMusic,
  Database,
  UserCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import PricingCard from "@/components/PricingCard";
import PriceCalculator from "@/components/PriceCalculator";
import PlanInquiryModal from "@/components/PlanInquiryModal";
import { PLANS, Plan } from "@/lib/plans";

const features = [
  {
    icon: Database,
    title: "Jedes Lied verfügbar",
    text: "Volle Anbindung an die YouTube-Datenbank — egal welcher Song, er lässt sich finden und sofort in die Warteschlange packen.",
  },
  {
    icon: ListMusic,
    title: "Live-Warteschlange",
    text: "Alle Gäste sehen in Echtzeit, wer gerade singt und wer als Nächstes dran ist — auf dem Handy oder dem großen Bildschirm.",
  },
  {
    icon: Sparkles,
    title: "Songs merken sich selbst",
    text: "Jeder gespielte Song wird automatisch in der Datenbank gespeichert — mit Play-Count, damit Partyklassiker beim nächsten Mal sofort auffindbar sind.",
  },
  {
    icon: UserCheck,
    title: "Namentliche Anmeldung",
    text: "Vor dem Singen einfach Namen eintragen — er erscheint automatisch in der Warteschlange, wenn man an der Reihe ist.",
  },
];

const steps = [
  {
    icon: UserCheck,
    title: "Namen eintragen",
    text: "App öffnen, Namen eingeben — fertig. Kein Konto, kein Passwort.",
  },
  {
    icon: Search,
    title: "Song suchen",
    text: "In der kompletten YouTube-Songdatenbank nach jedem Lied suchen.",
  },
  {
    icon: Mic2,
    title: "Auftreten",
    text: "Wenn man an der Reihe ist, zeigt die Bühnenanzeige automatisch den Namen.",
  },
];

export default function HomePage() {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  return (
    <main className="min-h-dvh bg-stage-gradient text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-stage-gradient" />
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            <Sparkles className="h-3.5 w-3.5 text-neon-gold" />
            Karaoke, neu gedacht für dein iPhone
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            Deine Bühne.
            <br />
            <span className="bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan bg-clip-text text-transparent">
              Jedes Lied. Jede Party.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/60 sm:text-lg">
            SingNight verwandelt dein iPhone in eine professionelle
            Karaoke-Anlage: YouTube-Songsuche, Live-Warteschlange und faire
            Preise — für dich allein, deine Gruppe oder die ganze Veranstaltung.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/join"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-7 py-3.5 font-semibold text-white shadow-glow transition active:scale-95 sm:w-auto"
            >
              <Mic2 className="h-4 w-4" />
              Jetzt mitsingen
            </Link>
            <a
              href="#preise"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Preise ansehen
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Mock Phone Preview */}
        <div className="relative mx-auto mt-16 max-w-xs animate-float">
          <div className="rounded-[2.5rem] border-4 border-white/10 bg-stage-900 p-3 shadow-glow">
            <div className="rounded-[1.75rem] bg-stage-950 p-4">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-neon-pink to-neon-purple" />
                <div>
                  <div className="h-2 w-20 rounded bg-white/20" />
                  <div className="mt-1.5 h-2 w-14 rounded bg-white/10" />
                </div>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 p-2">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-white/10" />
                  <div className="flex-1">
                    <div className="h-2 w-24 rounded bg-white/20" />
                    <div className="mt-1.5 h-2 w-16 rounded bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl font-bold">Alles für den perfekten Karaoke-Abend</h2>
            <p className="mt-2 text-white/60">
              Von der Songsuche bis zur Bühnenanzeige — SingNight übernimmt die Technik.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-neon-pink/20 to-neon-purple/20 text-neon-pink">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-white/60">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-display text-3xl font-bold">So einfach geht&apos;s</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-neon-pink px-2.5 py-0.5 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <div className="mx-auto mb-3 mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink to-neon-purple">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-white/60">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="preise" className="scroll-mt-16 px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl font-bold">Faire Preise für jede Gruppengröße</h2>
            <p className="mt-2 text-white/60">
              Je mehr Leute mitsingen, desto günstiger wird&apos;s pro Person — ganz
              ohne versteckte Kosten.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <PricingCard key={plan.id} plan={plan} onSelect={setSelectedPlan} />
            ))}
          </div>

          <div className="mx-auto mt-10 max-w-md">
            <PriceCalculator />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-white/10 bg-card-glow p-10 text-center">
          <Mic2 className="h-8 w-8 text-neon-pink" />
          <h2 className="font-display text-2xl font-bold">Bereit für die Bühne?</h2>
          <p className="max-w-md text-sm text-white/60">
            Trag deinen Namen ein und finde in Sekunden deinen ersten Song.
          </p>
          <Link
            href="/join"
            className="rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-7 py-3 font-semibold text-white shadow-glow"
          >
            Jetzt starten
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-white/40">
        © {new Date().getFullYear()} SingNight — Karaoke für dein iPhone.
      </footer>

      {selectedPlan && (
        <PlanInquiryModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
      )}
    </main>
  );
}
