export type PlanId = "solo" | "group" | "event";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Preis in Cent */
  priceCents: number;
  /** z. B. "pro Session (24 Std.)" oder "pro Veranstaltung (bis 6 Std.)" */
  billingLabel: string;
  guestRange: { min: number; max: number | null };
  highlight?: boolean;
  features: string[];
}

/**
 * Preislogik ("fair" kalkuliert):
 * Jede Stufe deckt eine feste Infrastruktur-Basis (Server, YouTube-Suche,
 * Warteschlangen-Sync) von ca. 3,50 € plus einen marginalen Betrag von
 * ca. 2,00 € pro realistisch gleichzeitig aktivem Sänger. Mit steigender
 * Gästezahl sinkt so der Preis pro Person deutlich, weil sich die Basis
 * auf mehr Leute verteilt — genau wie bei echten Veranstaltungskosten.
 *
 * Solo:   3,50 € Basis + 1 × 2,00 €  ≈  4,99 €  → 4,99 €/Person
 * Gruppe: 3,50 € Basis + 8 × 2,00 €  ≈ 19,90 €  → ab 1,99 €/Person (bei 10 Gästen)
 * Event:  3,50 € Basis + Staffelrabatt, gedeckelt ≈ 79,90 € → ab 1,33 €/Person (bei 60 Gästen)
 */
export const PLANS: Plan[] = [
  {
    id: "solo",
    name: "Solo",
    tagline: "Für dich allein — Üben oder einfach drauflos singen.",
    priceCents: 499,
    billingLabel: "pro Session (24 Std. Zugang)",
    guestRange: { min: 1, max: 1 },
    features: [
      "1 Sänger:in",
      "Volle YouTube-Songsuche",
      "Eigene Warteschlange",
      "Songverlauf & Favoriten",
      "24 Stunden Zugriff ab Kauf",
    ],
  },
  {
    id: "group",
    name: "Gruppe",
    tagline: "Perfekt für Geburtstage, WG-Partys & Freundeskreis.",
    priceCents: 1990,
    billingLabel: "pro Session (24 Std. Zugang, bis 10 Gäste)",
    guestRange: { min: 2, max: 10 },
    highlight: true,
    features: [
      "Bis zu 10 Sänger:innen gleichzeitig",
      "Gemeinsame Live-Warteschlange",
      "„Wer singt als nächstes“-Anzeige für alle Gäste",
      "Jede:r meldet sich per Name selbst an",
      "Automatischer Songverlauf der Party",
    ],
  },
  {
    id: "event",
    name: "Veranstaltung",
    tagline: "Für Bars, Hochzeiten, Firmenfeiern & Vereine.",
    priceCents: 7990,
    billingLabel: "pro Veranstaltung (bis 6 Std., unbegrenzte Gäste)",
    guestRange: { min: 11, max: null },
    features: [
      "Unbegrenzte Sänger:innen",
      "Bühnen-/TV-Anzeige für die Warteschlange",
      "Moderator:innen-Steuerung (Player, Reihenfolge, Skip)",
      "Eigenes Branding/Logo auf der Anzeige",
      "Priorisierte Songsuche & Support",
      "Auch als Dauer-Abo für feste Locations: 249 €/Monat",
    ],
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unbekannter Plan: ${id}`);
  return plan;
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

export function pricePerGuest(plan: Plan, guestCountOverride?: number): number {
  const guests =
    guestCountOverride ?? plan.guestRange.max ?? Math.max(plan.guestRange.min, 20);
  return plan.priceCents / Math.max(guests, 1);
}

/** Empfiehlt anhand der Gästezahl den passenden, günstigsten Plan. */
export function recommendPlan(guestCount: number): Plan {
  if (guestCount <= 1) return getPlan("solo");
  if (guestCount <= 10) return getPlan("group");
  return getPlan("event");
}
