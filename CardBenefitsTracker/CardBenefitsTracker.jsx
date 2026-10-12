import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Check, ChevronDown, Pencil, Trash2, X, Copy, Sparkles, CreditCard,
  ListChecks, LayoutGrid, Minus, Users, Loader2, Info, CloudOff, Cloud,
  RefreshCw, AlertTriangle, LogOut, Gift, CalendarDays, ArrowRight,
} from "lucide-react";

/* ───────────────────────── Konstanten ───────────────────────── */

const PROFILE_KEY = "cbt-profile";              // shared: false → Space-Code + Name pro Person
const spaceKey = (code) => `cbt-space-${code}`;  // shared: true  → alle Space-Daten
const STORAGE_TIMEOUT = 1500;
const POLL_MS = 10000;
const SAVE_DEBOUNCE_MS = 700;
const DAY = 86400000;

const ISSUERS = {
  "American Express": "#2E77C9",
  Chase: "#1A3F86",
  "Capital One": "#C4122F",
  Citi: "#0E8FC8",
  "Bank of America": "#8A1C33",
  "Wells Fargo": "#B8860B",
  "U.S. Bank": "#5B2C83",
  Discover: "#E26A12",
  Barclays: "#13939C",
  Andere: "#5F6670",
};

const CADENCES = {
  monthly: { n: 12, label: "Monatlich", short: "mtl." },
  quarterly: { n: 4, label: "Quartalsweise", short: "quart." },
  semiannual: { n: 2, label: "Halbjährlich", short: "halbj." },
  annual: { n: 1, label: "Jährlich", short: "jährl." },
  perk: { n: 0, label: "Perk (nur Info)", short: "Perk" },
};
const CADENCE_ORDER = ["monthly", "quarterly", "semiannual", "annual"];

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const b = (id, name, value, cadence, note = "") => ({ id, name, value, cadence, note });

const TEMPLATES = [
  {
    tid: "amex-biz-plat", name: "Amex Business Platinum", issuer: "American Express", fee: 895, resetType: "calendar",
    benefits: [
      b("hotel", "Hotel-Credit (FHR/THC)", 600, "semiannual", "Über Amex Travel buchen"),
      b("indeed", "Indeed", 360, "quarterly"),
      b("hilton", "Hilton", 200, "quarterly", "Direkt bei Hilton zahlen"),
      b("wireless", "Wireless / Mobilfunk", 120, "monthly", "US-Mobilfunkanbieter"),
      b("airline", "Airline-Gebühren", 200, "annual", "Fluggesellschaft vorher wählen"),
      b("clear", "CLEAR Plus", 209, "annual"),
      b("chatgpt", "ChatGPT", 300, "annual"),
      b("adobe", "Adobe", 250, "annual"),
      b("dell", "Dell", 150, "annual"),
    ],
  },
  {
    tid: "amex-biz-gold", name: "Amex Business Gold", issuer: "American Express", fee: 375, resetType: "calendar",
    benefits: [
      b("fedex", "FedEx / Grubhub / Office", 240, "monthly"),
      b("walmart", "Walmart+", 155, "monthly", "Monatliches Abo"),
      b("chatgpt", "ChatGPT", 300, "annual"),
      b("squarespace", "Squarespace", 150, "annual"),
    ],
  },
  {
    tid: "chase-ink-pref", name: "Chase Ink Preferred", issuer: "Chase", fee: 95, resetType: "anniversary",
    benefits: [
      b("phone", "Handy-Schutz", 0, "perk", "Mobilfunkrechnung mit der Karte zahlen"),
      b("nofx", "Keine Fremdwährungsgebühren", 0, "perk"),
    ],
  },
  {
    tid: "chase-ink-prem", name: "Chase Ink Premier", issuer: "Chase", fee: 195, resetType: "anniversary",
    benefits: [
      b("lyft", "5 % auf Lyft", 0, "perk"),
      b("phone", "Handy-Schutz", 0, "perk"),
      b("nofx", "Keine Fremdwährungsgebühren", 0, "perk"),
    ],
  },
  {
    tid: "cap1-spark-cash-plus", name: "Capital One Spark Cash Plus", issuer: "Capital One", fee: 150, resetType: "anniversary",
    benefits: [
      b("feerefund", "Jahresgebühr-Erstattung", 150, "annual", "Ab $150.000 Ausgaben pro Kartenjahr"),
      b("travel5", "5 % auf Hotels & Mietwagen", 0, "perk", "Über Capital One Business Travel"),
      b("nofx", "Keine Fremdwährungsgebühren", 0, "perk"),
    ],
  },
];

function cardFromTemplate(t, overrides = {}) {
  return {
    id: overrides.id || uid(),
    templateId: t.tid,
    name: t.name,
    nickname: "",
    issuer: t.issuer,
    fee: t.fee,
    resetType: t.resetType,
    anniversary: null,
    benefits: t.benefits.map((x) => ({ ...x })),
    order: Date.now(),
    u: 0,
    ...overrides,
  };
}

function seedSpace() {
  return {
    v: 1,
    cards: TEMPLATES.map((t, i) => cardFromTemplate(t, { id: `seed-${t.tid}`, order: i + 1 })),
    usage: {},
  };
}

/* ───────────────────────── Helfer ───────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function randomCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const arr = new Uint32Array(6);
  (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(arr) : arr.forEach((_, i) => (arr[i] = Math.random() * 1e9));
  for (let i = 0; i < 6; i++) s += A[arr[i] % A.length];
  return s;
}
const normalizeCode = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const prettyCode = (c) => (c && c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c || "");

function money(v, { sign = false } = {}) {
  const r = Math.round((v || 0) * 100) / 100;
  const whole = Math.abs(r - Math.round(r)) < 0.005;
  const s = Math.abs(r).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  const pre = r < 0 ? "−" : sign && r > 0 ? "+" : "";
  return `${pre}$${s}`;
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct < 0 ? c : 255 - c))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), bl = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
const accentOf = (card) => ISSUERS[card.issuer] || ISSUERS.Andere;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/* window.storage (Artifact-API). Liefert {status: ok|missing|error, value}. */
async function storageGet(key, shared) {
  try {
    if (!window.storage) return { status: "error" };
    const res = await withTimeout(window.storage.get(key, shared), STORAGE_TIMEOUT);
    if (!res || res.value == null) return { status: "missing" };
    return { status: "ok", value: typeof res.value === "string" ? JSON.parse(res.value) : res.value };
  } catch (e) {
    const msg = String((e && e.message) || e).toLowerCase();
    if (msg.includes("not found") || msg.includes("not exist") || msg.includes("no such")) return { status: "missing" };
    return { status: "error" };
  }
}
async function storageSet(key, value, shared) {
  try {
    if (!window.storage) return false;
    await withTimeout(window.storage.set(key, JSON.stringify(value), shared), STORAGE_TIMEOUT * 2);
    return true;
  } catch (e) {
    return false;
  }
}
async function storageDelete(key, shared) {
  try {
    if (window.storage && window.storage.delete) await withTimeout(window.storage.delete(key, shared), STORAGE_TIMEOUT);
  } catch (e) { /* egal */ }
}

/* Konfliktfreies Zusammenführen: pro Karte und pro Häkchen gewinnt der neuere Zeitstempel. */
function mergeSpaces(a, b2) {
  if (!a) return b2;
  if (!b2) return a;
  const cards = {};
  for (const c of [...(a.cards || []), ...(b2.cards || [])]) {
    const ex = cards[c.id];
    if (!ex || (c.u || 0) > (ex.u || 0)) cards[c.id] = c;
  }
  const usage = { ...(a.usage || {}) };
  for (const [k, val] of Object.entries(b2.usage || {})) {
    if (!usage[k] || (val.t || 0) > (usage[k].t || 0)) usage[k] = val;
  }
  return {
    v: 1,
    cards: Object.values(cards).sort((x, y) => (x.order || 0) - (y.order || 0) || x.id.localeCompare(y.id)),
    usage,
  };
}
const spaceSig = (s) => JSON.stringify(s);

/* ───────────────────────── Zeiträume ───────────────────────── */

function parseISODate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const fmtDay = (dt) => `${dt.getDate()}. ${MONTHS[dt.getMonth()]}`;

function anniversaryWindow(card, now) {
  const a = parseISODate(card.anniversary);
  if (card.resetType !== "anniversary" || !a) return null;
  let start = new Date(now.getFullYear(), a.m, a.d);
  if (start > now) start = new Date(now.getFullYear() - 1, a.m, a.d);
  const end = new Date(start.getFullYear() + 1, a.m, a.d);
  return { start, end };
}

/* Liefert alle Zeiträume des aktuellen Zyklus eines Benefits + Index des aktuellen. */
function cycleFor(card, cadence, now) {
  const y = now.getFullYear();
  let periods = [];
  if (cadence === "monthly") {
    periods = MONTHS.map((m, i) => ({ key: `${y}-M${i + 1}`, label: m, long: `${MONTHS_LONG[i]} ${y}`, start: new Date(y, i, 1), end: new Date(y, i + 1, 1) }));
  } else if (cadence === "quarterly") {
    periods = [0, 1, 2, 3].map((q) => ({ key: `${y}-Q${q + 1}`, label: `Q${q + 1}`, long: `Q${q + 1} ${y}`, start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 1) }));
  } else if (cadence === "semiannual") {
    periods = [0, 1].map((h) => ({ key: `${y}-H${h + 1}`, label: h ? "Jul–Dez" : "Jan–Jun", long: `${h + 1}. Halbjahr ${y}`, start: new Date(y, h * 6, 1), end: new Date(y, h * 6 + 6, 1) }));
  } else if (cadence === "annual") {
    const w = anniversaryWindow(card, now);
    if (w) {
      const last = new Date(w.end.getTime() - DAY);
      periods = [{ key: `A${isoOf(w.start)}`, label: `${fmtDay(w.start)} – ${fmtDay(last)}`, long: `Kartenjahr bis ${fmtDay(last)} ${last.getFullYear()}`, start: w.start, end: w.end }];
    } else {
      periods = [{ key: `${y}-Y`, label: String(y), long: `Jahr ${y}`, start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }];
    }
  }
  const current = periods.findIndex((p) => p.start <= now && now < p.end);
  return { periods, current };
}

const usageKey = (cardId, benefitId, periodKey) => `${cardId}|${benefitId}|${periodKey}`;
const perPeriod = (benefit) => {
  const n = CADENCES[benefit.cadence]?.n || 0;
  return n ? (Number(benefit.value) || 0) / n : 0;
};
const daysLeft = (end, now) => Math.max(0, Math.ceil((end - now) / DAY));

function computeStats(cards, usage, now) {
  let available = 0, collected = 0, potential = 0, fees = 0;
  for (const card of cards) {
    fees += Number(card.fee) || 0;
    for (const ben of card.benefits) {
      if (ben.cadence === "perk") continue;
      potential += Number(ben.value) || 0;
      const { periods, current } = cycleFor(card, ben.cadence, now);
      const pp = perPeriod(ben);
      periods.forEach((p, i) => {
        const used = usage[usageKey(card.id, ben.id, p.key)]?.v;
        if (used) collected += pp;
        else if (i === current) available += pp;
      });
    }
  }
  return { available, collected, potential, fees, net: collected - fees };
}

/* ───────────────────────── KI-Recherche ───────────────────────── */

async function researchBenefits(cardName, issuer) {
  const prompt = `Du recherchierst Kreditkarten-Benefits. Karte: "${cardName}"${issuer && issuer !== "Andere" ? ` (Herausgeber: ${issuer})` : ""}.
Liste die wiederkehrenden Statement-Credits und wichtigsten dauerhaften Perks dieser Karte auf.
Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Text davor oder danach, ohne Markdown. Jedes Element:
{"name": string (kurz, deutsch), "value": number (jährlicher Gesamtwert in USD, 0 bei Perks), "cadence": "monthly"|"quarterly"|"semiannual"|"annual"|"perk", "note": string (kurzer Hinweis zur Einlösung, deutsch, max 60 Zeichen)}
Regeln: "value" ist immer der JÄHRLICHE Gesamtwert (z. B. $10 pro Monat → 120, cadence "monthly"). Reine Vorteile ohne Dollarbetrag (Versicherungen, keine Fremdwährungsgebühr, Bonuspunkte) → cadence "perk", value 0. Maximal 12 Einträge. Wenn du die Karte nicht kennst, antworte mit [].`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < s) throw new Error("Keine Liste in der Antwort");
  const arr = JSON.parse(text.slice(s, e + 1));
  if (!Array.isArray(arr)) throw new Error("Antwort ist keine Liste");
  return arr
    .filter((x) => x && typeof x.name === "string" && x.name.trim())
    .slice(0, 15)
    .map((x) => {
      const cadence = CADENCES[x.cadence] ? x.cadence : "annual";
      return {
        id: uid(),
        name: x.name.trim().slice(0, 60),
        value: cadence === "perk" ? 0 : Math.max(0, Math.round(Number(x.value) || 0)),
        cadence,
        note: typeof x.note === "string" ? x.note.slice(0, 120) : "",
        review: true,
      };
    });
}

/* ───────────────────────── UI-Bausteine ───────────────────────── */

function CardArt({ card, size = "md" }) {
  const accent = accentOf(card);
  const dims = size === "sm" ? { width: 30, height: 20, borderRadius: 4 } : { width: 46, height: 30, borderRadius: 6 };
  return (
    <div
      className="relative flex-shrink-0 overflow-hidden shadow-sm"
      style={{ ...dims, background: `linear-gradient(135deg, ${shade(accent, 18)} 0%, ${accent} 45%, ${shade(accent, -35)} 100%)` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 40%)" }} />
      {size !== "sm" && (
        <div className="absolute" style={{ left: 6, top: 9, width: 9, height: 7, borderRadius: 2, background: "linear-gradient(135deg,#f3e2a8,#c9a54c)" }} />
      )}
    </div>
  );
}

function ProgressBar({ value, color = "#ffffff", track = "rgba(255,255,255,0.14)", height = 6 }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: track }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black bg-opacity-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex w-full max-w-lg flex-col bg-white shadow-2xl rounded-t-3xl sm:rounded-3xl"
        style={{ maxHeight: "92vh", animation: "cbtSheetIn 260ms cubic-bezier(.2,.8,.2,1)" }}
      >
        <div className="flex justify-center pt-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-gray-100 px-5 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 text-base text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200";

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-xl bg-gray-200 p-1" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {Icon && <Icon size={16} />}
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span className={`rounded-full px-2 text-xs tabular-nums ${active ? "bg-gray-900 text-white" : "bg-gray-300 text-gray-700"}`}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, onChange, min = 1, max = 20 }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 disabled:opacity-40 active:scale-95" aria-label="Weniger">
        <Minus size={18} />
      </button>
      <span className="w-8 text-center text-xl font-semibold tabular-nums text-gray-900">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 disabled:opacity-40 active:scale-95" aria-label="Mehr">
        <Plus size={18} />
      </button>
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

function Hero({ stats, year }) {
  const progress = stats.potential ? stats.collected / stats.potential : 0;
  const breakEven = stats.fees ? stats.collected / stats.fees : 1;
  const netPositive = stats.net >= 0;
  return (
    <section
      className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-6"
      style={{ background: "linear-gradient(145deg, #4a4d53 0%, #2a2c31 38%, #17181b 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px)" }} />
      <div className="pointer-events-none absolute" style={{ top: -120, right: -80, width: 300, height: 300, borderRadius: 9999, background: "radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%)" }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.50)" }}>Verfügbar zum Einlösen</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{money(stats.available)}</p>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.50)" }}>im aktuellen Zeitraum offen</p>
          </div>
          <div className="mt-1 flex h-9 w-12 items-center justify-center rounded-md" style={{ background: "linear-gradient(135deg,#f1e1a6,#bb9440)" }} aria-hidden="true">
            <div className="h-5 w-7 rounded-sm border" style={{ borderColor: "rgba(80,60,10,0.25)" }} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat label={`Eingesammelt ${year}`} value={money(stats.collected)} />
          <Stat label="Jährl. Potenzial" value={money(stats.potential)} />
          <Stat label="Jahresgebühren" value={money(stats.fees)} />
          <Stat label="Netto" value={money(stats.net, { sign: true })} tone={netPositive ? "#7ee2a8" : "#ff9a8f"} />
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.60)" }}>
              <span>Genutzt vom Potenzial</span>
              <span className="tabular-nums">{Math.round(progress * 100)} %</span>
            </div>
            <ProgressBar value={progress} color="linear-gradient(90deg,#d9dde3,#ffffff)" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.60)" }}>
              <span>Gebühren wieder reingeholt</span>
              <span className="tabular-nums">{Math.round(Math.min(breakEven, 9.99) * 100)} %</span>
            </div>
            <ProgressBar value={breakEven} color={breakEven >= 1 ? "linear-gradient(90deg,#5fcf8f,#9bf0bf)" : "linear-gradient(90deg,#e6b85c,#f6d891)"} />
          </div>
        </div>
      </div>
    </section>
  );
}
function Stat({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.50)" }}>{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</p>
    </div>
  );
}

/* ───────────────────────── To-Do-Ansicht ───────────────────────── */

function sectionTitle(cadence, now) {
  const y = now.getFullYear();
  if (cadence === "monthly") return MONTHS_LONG[now.getMonth()];
  if (cadence === "quarterly") return `Q${Math.floor(now.getMonth() / 3) + 1} ${y}`;
  if (cadence === "semiannual") return `${now.getMonth() < 6 ? 1 : 2}. Halbjahr ${y}`;
  return "Jahres-Credits";
}

function TodoView({ cards, usage, now, onToggle, onAddCard }) {
  const [showDone, setShowDone] = useState(false);
  const [settling, setSettling] = useState({}); // gerade abgehakt → kurz in der Liste lassen

  const { open, done } = useMemo(() => {
    const open = [], done = [];
    for (const card of cards) {
      for (const ben of card.benefits) {
        if (ben.cadence === "perk") continue;
        const { periods, current } = cycleFor(card, ben.cadence, now);
        const p = periods[current];
        if (!p) continue;
        const key = usageKey(card.id, ben.id, p.key);
        const item = { key, card, ben, period: p, amount: perPeriod(ben), days: daysLeft(p.end, now), used: !!usage[key]?.v };
        (item.used && !settling[key] ? done : open).push(item);
      }
    }
    open.sort((a, b2) => a.days - b2.days || b2.amount - a.amount);
    return { open, done };
  }, [cards, usage, now, settling]);

  const check = (item) => {
    if (!item.used) {
      setSettling((s) => ({ ...s, [item.key]: true }));
      setTimeout(() => setSettling((s) => { const n = { ...s }; delete n[item.key]; return n; }), 900);
    }
    onToggle(item.key, !item.used);
  };

  const groups = CADENCE_ORDER.map((c) => ({ cadence: c, items: open.filter((i) => i.ben.cadence === c) })).filter((g) => g.items.length);
  const openTotal = open.filter((i) => !i.used).reduce((s, i) => s + i.amount, 0);

  if (!cards.length) {
    return (
      <EmptyState icon={CreditCard} title="Noch keine Karten" text="Füge eure erste Karte hinzu – aus einer Vorlage oder ganz eigen.">
        <button onClick={onAddCard} className="mt-4 flex h-12 items-center gap-2 rounded-full bg-gray-900 px-5 font-semibold text-white active:scale-95">
          <Plus size={18} /> Karte hinzufügen
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {groups.length === 0 ? (
        <EmptyState icon={Check} title="Alles eingelöst" text="Für die aktuellen Zeiträume ist nichts mehr offen. Neue Häkchen erscheinen, sobald der nächste Zeitraum beginnt." />
      ) : (
        <>
          <p className="px-1 text-sm text-gray-500">
            <span className="font-semibold text-gray-900 tabular-nums">{open.filter((i) => !i.used).length} offen</span> · {money(openTotal)} warten aufs Einlösen
          </p>
          {groups.map((g) => {
            const sample = g.items[0];
            const calendarDays = g.cadence !== "annual" ? sample.days : null;
            return (
              <section key={g.cadence}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h3 className="text-xl font-bold tracking-tight text-gray-900">{sectionTitle(g.cadence, now)}</h3>
                  {calendarDays != null && (
                    <span className={`text-sm font-medium tabular-nums ${calendarDays <= 7 ? "text-orange-600" : "text-gray-400"}`}>noch {calendarDays} {calendarDays === 1 ? "Tag" : "Tage"}</span>
                  )}
                </div>
                <ul className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  {g.items.map((item, idx) => (
                    <TodoRow key={item.key} item={item} last={idx === g.items.length - 1} onCheck={() => check(item)} showDays={g.cadence === "annual"} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone((v) => !v)} className="flex h-11 w-full items-center justify-between px-1 text-sm font-semibold text-gray-500">
            <span>Erledigt in diesem Zeitraum ({done.length})</span>
            <ChevronDown size={18} className={`transition-transform ${showDone ? "rotate-180" : ""}`} />
          </button>
          {showDone && (
            <ul className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {done.map((item, idx) => (
                <TodoRow key={item.key} item={item} last={idx === done.length - 1} onCheck={() => check(item)} showDays />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TodoRow({ item, last, onCheck, showDays }) {
  const accent = accentOf(item.card);
  const { card, ben, used } = item;
  return (
    <li className={`flex items-center gap-1 pr-4 ${last ? "" : "border-b border-gray-100"}`}>
      <button onClick={onCheck} className="flex h-16 w-14 flex-shrink-0 items-center justify-center" aria-label={used ? `${ben.name} als offen markieren` : `${ben.name} abhaken`} aria-pressed={used}>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-200"
          style={used ? { background: accent, borderColor: accent, transform: "scale(1.05)" } : { borderColor: "#c7c9cf" }}
        >
          {used && <Check size={16} strokeWidth={3} className="text-white" />}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-3">
        <p className={`truncate text-base font-medium transition-colors ${used ? "text-gray-400 line-through" : "text-gray-900"}`}>{ben.name}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-gray-500">
          <CardArt card={card} size="sm" />
          <span className="truncate">{card.name}{card.nickname ? ` · ${card.nickname}` : ""}</span>
          {showDays && !used && (
            <span className={`flex-shrink-0 tabular-nums ${item.days <= 14 ? "font-semibold text-orange-600" : ""}`}>· {item.days} T.</span>
          )}
        </div>
        {ben.note && !used && <p className="mt-1 truncate text-xs text-gray-400">{ben.note}</p>}
      </div>
      <span className={`flex-shrink-0 text-base font-semibold tabular-nums ${used ? "text-gray-300" : "text-gray-900"}`}>{money(item.amount)}</span>
    </li>
  );
}

function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-500"><Icon size={26} /></div>
      <p className="mt-3 text-lg font-semibold text-gray-900">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">{text}</p>
      {children}
    </div>
  );
}

/* ───────────────────────── Alle Karten ───────────────────────── */

function CardsView({ cards, usage, now, onToggle, onEdit, onAddCard }) {
  const [expanded, setExpanded] = useState({});
  if (!cards.length) {
    return (
      <EmptyState icon={CreditCard} title="Noch keine Karten" text="Füge eure erste Karte hinzu.">
        <button onClick={onAddCard} className="mt-4 flex h-12 items-center gap-2 rounded-full bg-gray-900 px-5 font-semibold text-white active:scale-95">
          <Plus size={18} /> Karte hinzufügen
        </button>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <CardRow key={card.id} card={card} usage={usage} now={now} open={!!expanded[card.id]}
          onToggleOpen={() => setExpanded((e) => ({ ...e, [card.id]: !e[card.id] }))} onToggle={onToggle} onEdit={() => onEdit(card)} />
      ))}
      <button onClick={onAddCard} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 active:scale-95">
        <Plus size={18} /> Karte hinzufügen
      </button>
    </div>
  );
}

function CardRow({ card, usage, now, open, onToggleOpen, onToggle, onEdit }) {
  const accent = accentOf(card);
  const s = useMemo(() => computeStats([card], usage, now), [card, usage, now]);
  const trackable = card.benefits.filter((x) => x.cadence !== "perk");
  const perks = card.benefits.filter((x) => x.cadence === "perk");
  const needsDate = card.resetType === "anniversary" && !parseISODate(card.anniversary);
  const win = anniversaryWindow(card, now);
  const resetText = card.resetType === "anniversary"
    ? (win ? `Reset am ${fmtDay(win.end)}` : "Jahrestag fehlt")
    : "Reset am 1. Jan";

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <CardArt card={card} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-gray-900">{card.name}</p>
            <p className="truncate text-xs text-gray-500">
              {card.nickname ? `${card.nickname} · ` : ""}{money(card.fee)}/Jahr · {resetText}
            </p>
            {s.potential > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1"><ProgressBar value={s.collected / s.potential} color={accent} track="#eef0f3" height={5} /></div>
                <span className="flex-shrink-0 text-xs font-medium tabular-nums text-gray-500">{money(s.collected)} / {money(s.potential)}</span>
              </div>
            )}
            {s.potential === 0 && <p className="mt-1 text-xs text-gray-400">{perks.length} Perks · keine Credits zum Abhaken</p>}
          </div>
          <ChevronDown size={20} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3">
          {needsDate && (
            <button onClick={onEdit} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-3 text-left text-sm text-amber-800">
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span className="flex-1">Jahrestag festlegen, damit jährliche Credits am richtigen Tag zurückgesetzt werden.</span>
              <ArrowRight size={16} />
            </button>
          )}
          <div className="space-y-3">
            {trackable.map((ben) => (
              <PunchCard key={ben.id} card={card} ben={ben} usage={usage} now={now} onToggle={onToggle} accent={accent} />
            ))}
          </div>
          {perks.length > 0 && (
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500"><Gift size={14} /> Perks</p>
              <ul className="space-y-2">
                {perks.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {p.review && <ReviewBadge />}
                    {p.note && <span className="block text-xs text-gray-500">{p.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button onClick={onEdit} className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm active:scale-95">
              <Pencil size={15} /> Bearbeiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewBadge() {
  return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">prüfen</span>;
}

function PunchCard({ card, ben, usage, now, onToggle, accent }) {
  const { periods, current } = cycleFor(card, ben.cadence, now);
  const usedCount = periods.filter((p) => usage[usageKey(card.id, ben.id, p.key)]?.v).length;
  const cols = { 12: "grid-cols-6 sm:grid-cols-12", 4: "grid-cols-4", 2: "grid-cols-2", 1: "grid-cols-1" }[periods.length] || "grid-cols-4";
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {ben.name}
            {ben.review && <ReviewBadge />}
          </p>
          <p className="text-xs text-gray-500">
            {money(ben.value)}/Jahr · {CADENCES[ben.cadence].label}{periods.length > 1 ? ` · ${money(perPeriod(ben))} pro Zeitraum` : ""}
          </p>
          {ben.note && <p className="mt-1 text-xs text-gray-400">{ben.note}</p>}
        </div>
        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold tabular-nums text-gray-700">genutzt {usedCount}/{periods.length}</span>
      </div>
      <div className={`mt-3 grid gap-2 ${cols}`}>
        {periods.map((p, i) => {
          const used = !!usage[usageKey(card.id, ben.id, p.key)]?.v;
          const isCurrent = i === current;
          const future = current >= 0 ? i > current : p.start > now;
          const past = !isCurrent && !future;
          let style, cls = "relative flex h-11 items-center justify-center rounded-xl text-xs font-semibold transition-all active:scale-95";
          if (used) {
            style = { background: accent, color: "#fff" };
          } else if (isCurrent) {
            style = { boxShadow: `inset 0 0 0 2px ${accent}`, color: accent, background: "#fff" };
          } else if (past) {
            cls += " bg-gray-100 text-gray-400";
          } else {
            cls += " border border-dashed border-gray-200 text-gray-300";
          }
          return (
            <button
              key={p.key}
              className={cls}
              style={style}
              disabled={future}
              onClick={() => onToggle(usageKey(card.id, ben.id, p.key), !used)}
              title={`${p.long}${isCurrent ? " (aktuell)" : ""}`}
              aria-label={`${ben.name}, ${p.long}${isCurrent ? ", aktueller Zeitraum" : ""}: ${used ? "genutzt" : "offen"}`}
              aria-pressed={used}
            >
              {used ? <Check size={15} strokeWidth={3} /> : <span className={past ? "line-through" : ""}>{p.label}</span>}
              {isCurrent && (
                <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 6, height: 6, background: used ? "#fff" : accent }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Karte hinzufügen / bearbeiten ───────────────────────── */

function emptyBenefit() {
  return { id: uid(), name: "", value: "", cadence: "annual", note: "" };
}

function BenefitEditor({ benefits, setBenefits }) {
  const upd = (id, patch) => setBenefits(benefits.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {benefits.map((ben) => (
        <div key={ben.id} className={`rounded-2xl p-3 ${ben.review ? "bg-amber-50 ring-1 ring-amber-200" : "bg-gray-50"}`}>
          <div className="flex items-center gap-2">
            <input className={inputCls + " bg-white"} placeholder="Name, z. B. Uber-Credit" value={ben.name} onChange={(e) => upd(ben.id, { name: e.target.value })} aria-label="Benefit-Name" />
            <button type="button" onClick={() => setBenefits(benefits.filter((x) => x.id !== ben.id))} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:text-red-500" aria-label="Benefit entfernen">
              <Trash2 size={18} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">$</span>
              <input
                className={inputCls + " bg-white pl-7 disabled:opacity-40"}
                inputMode="decimal"
                placeholder="Wert/Jahr"
                value={ben.cadence === "perk" ? "" : ben.value}
                disabled={ben.cadence === "perk"}
                onChange={(e) => upd(ben.id, { value: e.target.value.replace(/[^0-9.]/g, "") })}
                aria-label="Jährlicher Wert in Dollar"
              />
            </div>
            <select className={inputCls + " bg-white"} value={ben.cadence} onChange={(e) => upd(ben.id, { cadence: e.target.value })} aria-label="Rhythmus">
              {Object.entries(CADENCES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </div>
          <input className={inputCls + " mt-2 bg-white"} placeholder="Notiz (optional)" value={ben.note} onChange={(e) => upd(ben.id, { note: e.target.value })} aria-label="Notiz" />
          {ben.review && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-xs text-amber-800"><Sparkles size={13} /> Von der KI vorgeschlagen – bitte prüfen</span>
              <button type="button" onClick={() => upd(ben.id, { review: false })} className="h-9 rounded-full bg-white px-3 text-xs font-semibold text-amber-800 shadow-sm">Passt</button>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setBenefits([...benefits, emptyBenefit()])} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
        <Plus size={16} /> Benefit hinzufügen
      </button>
    </div>
  );
}

function ResetFields({ resetType, setResetType, anniversary, setAnniversary }) {
  return (
    <div className="space-y-3">
      <Field label="Reset am">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
          {[["calendar", "Kalenderjahr"], ["anniversary", "Jahrestag"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setResetType(v)}
              className={`h-10 rounded-lg text-sm font-semibold ${resetType === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </Field>
      {resetType === "anniversary" && (
        <Field label="Kartenjahrestag" hint="Jährliche Credits starten an diesem Tag neu. Monatliche, quartalsweise und halbjährliche folgen dem Kalender.">
          <input type="date" className={inputCls} value={anniversary || ""} onChange={(e) => setAnniversary(e.target.value)} />
        </Field>
      )}
      {resetType === "calendar" && <p className="text-xs text-gray-400">Alle Credits starten am 1. Januar neu.</p>}
    </div>
  );
}

function AddCardSheet({ open, onClose, onAdd }) {
  const [tab, setTab] = useState("template");
  const [tpl, setTpl] = useState(null);
  const [qty, setQty] = useState(1);
  const [nickname, setNickname] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [resetType, setResetType] = useState("calendar");
  // eigene Karte
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("American Express");
  const [fee, setFee] = useState("");
  const [benefits, setBenefits] = useState([emptyBenefit()]);
  const [ai, setAi] = useState({ state: "idle", msg: "" });

  useEffect(() => {
    if (open) {
      setTab("template"); setTpl(null); setQty(1); setNickname(""); setAnniversary(""); setResetType("calendar");
      setName(""); setIssuer("American Express"); setFee(""); setBenefits([emptyBenefit()]); setAi({ state: "idle", msg: "" });
    }
  }, [open]);

  const pickTemplate = (t) => { setTpl(t); setResetType(t.resetType); };

  const runAi = async () => {
    if (!name.trim()) { setAi({ state: "error", msg: "Gib zuerst den Kartennamen ein." }); return; }
    setAi({ state: "loading", msg: "" });
    try {
      const found = await researchBenefits(name.trim(), issuer);
      if (!found.length) { setAi({ state: "error", msg: "Keine Benefits gefunden. Prüfe den Kartennamen oder trage sie selbst ein." }); return; }
      setBenefits((prev) => [...prev.filter((x) => x.name.trim()), ...found]);
      setAi({ state: "done", msg: `${found.length} Benefits gefunden – gelb markierte bitte prüfen.` });
    } catch (e) {
      setAi({ state: "error", msg: "Recherche fehlgeschlagen. Versuch es nochmal oder trage die Benefits selbst ein." });
    }
  };

  const valid = tab === "template" ? !!tpl : !!name.trim();
  const submit = () => {
    if (!valid) return;
    const base = Date.now();
    const mk = (i) => {
      const nick = qty > 1 ? `${nickname.trim() || "Karte"} ${i + 1}` : nickname.trim();
      if (tab === "template") {
        return cardFromTemplate(tpl, { nickname: nick, resetType, anniversary: resetType === "anniversary" ? anniversary || null : null, order: base + i, u: base });
      }
      return {
        id: uid(), templateId: null, name: name.trim(), nickname: nick, issuer, fee: Number(fee) || 0, resetType,
        anniversary: resetType === "anniversary" ? anniversary || null : null,
        benefits: benefits.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim(), value: x.cadence === "perk" ? 0 : Number(x.value) || 0 })),
        order: base + i, u: base,
      };
    };
    onAdd(Array.from({ length: qty }, (_, i) => mk(i)));
    onClose();
  };

  const footer = (
    <button onClick={submit} disabled={!valid} className="flex h-12 w-full items-center justify-center rounded-full bg-gray-900 font-semibold text-white disabled:opacity-30 active:scale-95">
      {qty > 1 ? `${qty} Karten hinzufügen` : "Karte hinzufügen"}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Karte hinzufügen" footer={footer}>
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: "template", label: "Vorlage" }, { value: "custom", label: "Eigene Karte" }]} />
      </div>

      {tab === "template" ? (
        <div className="space-y-4">
          <ul className="space-y-2">
            {TEMPLATES.map((t) => {
              const sel = tpl?.tid === t.tid;
              const credits = t.benefits.filter((x) => x.cadence !== "perk");
              const total = credits.reduce((s, x) => s + x.value, 0);
              return (
                <li key={t.tid}>
                  <button onClick={() => pickTemplate(t)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${sel ? "bg-gray-900 text-white" : "bg-gray-50 hover:bg-gray-100"}`}>
                    <CardArt card={t} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className={`truncate text-xs ${sel ? "text-gray-400" : "text-gray-500"}`}>
                        {money(t.fee)}/Jahr · {credits.length ? `${credits.length} Credits · ${money(total)}` : `${t.benefits.length} Perks`}
                      </p>
                    </div>
                    {sel && <Check size={20} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {tpl && (
            <div className="space-y-4 rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Anzahl</p>
                  <p className="text-xs text-gray-500">Jede Karte bekommt eine eigene Checkliste</p>
                </div>
                <Stepper value={qty} onChange={setQty} />
              </div>
              <Field label={qty > 1 ? "Spitzname (wird nummeriert)" : "Spitzname (optional)"}>
                <input className={inputCls + " bg-white"} placeholder="z. B. Anna oder Firma" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </Field>
              <ResetFields resetType={resetType} setResetType={setResetType} anniversary={anniversary} setAnniversary={setAnniversary} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Kartenname">
            <input className={inputCls} placeholder="z. B. Amex Platinum" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Herausgeber">
              <select className={inputCls} value={issuer} onChange={(e) => setIssuer(e.target.value)}>
                {Object.keys(ISSUERS).map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Jahresgebühr">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">$</span>
                <input className={inputCls + " pl-7"} inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-3">
            <div>
              <p className="font-medium text-gray-900">Anzahl</p>
              <p className="text-xs text-gray-500">Mehrere identische Karten</p>
            </div>
            <Stepper value={qty} onChange={setQty} />
          </div>
          <Field label={qty > 1 ? "Spitzname (wird nummeriert)" : "Spitzname (optional)"}>
            <input className={inputCls} placeholder="z. B. Anna" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </Field>
          <ResetFields resetType={resetType} setResetType={setResetType} anniversary={anniversary} setAnniversary={setAnniversary} />

          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Benefits</p>
            </div>
            <button
              type="button"
              onClick={runAi}
              disabled={ai.state === "loading"}
              className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white disabled:opacity-70 active:scale-95"
              style={{ background: "linear-gradient(135deg,#3b3f46,#1b1c20)" }}
            >
              {ai.state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {ai.state === "loading" ? "Recherchiere Benefits…" : "Benefits mit KI recherchieren"}
            </button>
            {ai.msg && (
              <p className={`mb-3 flex items-start gap-2 text-sm ${ai.state === "error" ? "text-red-600" : "text-gray-600"}`}>
                {ai.state === "error" ? <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> : <Info size={16} className="mt-0.5 flex-shrink-0" />}
                {ai.msg}
              </p>
            )}
            <BenefitEditor benefits={benefits} setBenefits={setBenefits} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

function EditCardSheet({ card, onClose, onSave, onDelete }) {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [issuer, setIssuer] = useState("Andere");
  const [fee, setFee] = useState("");
  const [resetType, setResetType] = useState("calendar");
  const [anniversary, setAnniversary] = useState("");
  const [benefits, setBenefits] = useState([]);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!card) return;
    setName(card.name); setNickname(card.nickname || ""); setIssuer(card.issuer); setFee(String(card.fee ?? ""));
    setResetType(card.resetType); setAnniversary(card.anniversary || "");
    setBenefits(card.benefits.map((x) => ({ ...x, value: x.cadence === "perk" ? "" : String(x.value) })));
    setConfirmDel(false);
  }, [card]);

  if (!card) return null;
  const save = () => {
    if (!name.trim()) return;
    onSave({
      ...card, name: name.trim(), nickname: nickname.trim(), issuer, fee: Number(fee) || 0, resetType,
      anniversary: resetType === "anniversary" ? anniversary || null : null,
      benefits: benefits.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim(), value: x.cadence === "perk" ? 0 : Number(x.value) || 0 })),
      u: Date.now(),
    });
    onClose();
  };

  const footer = confirmDel ? (
    <div className="space-y-2">
      <p className="text-center text-sm text-gray-600">„{card.name}{card.nickname ? ` · ${card.nickname}` : ""}" samt allen Häkchen löschen?</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setConfirmDel(false)} className="h-12 rounded-full bg-gray-100 font-semibold text-gray-700">Abbrechen</button>
        <button onClick={() => { onDelete(card); onClose(); }} className="h-12 rounded-full bg-red-600 font-semibold text-white active:scale-95">Löschen</button>
      </div>
    </div>
  ) : (
    <div className="flex gap-2">
      <button onClick={() => setConfirmDel(true)} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600" aria-label="Karte löschen">
        <Trash2 size={18} />
      </button>
      <button onClick={save} disabled={!name.trim()} className="h-12 flex-1 rounded-full bg-gray-900 font-semibold text-white disabled:opacity-30 active:scale-95">Speichern</button>
    </div>
  );

  return (
    <Sheet open={!!card} onClose={onClose} title="Karte bearbeiten" footer={footer}>
      <div className="space-y-4">
        <Field label="Kartenname"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Spitzname"><input className={inputCls} placeholder="optional" value={nickname} onChange={(e) => setNickname(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Herausgeber">
            <select className={inputCls} value={issuer} onChange={(e) => setIssuer(e.target.value)}>
              {Object.keys(ISSUERS).map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Jahresgebühr">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">$</span>
              <input className={inputCls + " pl-7"} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </Field>
        </div>
        <ResetFields resetType={resetType} setResetType={setResetType} anniversary={anniversary} setAnniversary={setAnniversary} />
        <div className="pt-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Benefits</p>
          <BenefitEditor benefits={benefits} setBenefits={setBenefits} />
        </div>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Spaces ───────────────────────── */

function SpaceGate({ open, onCreate, onJoin }) {
  const [mode, setMode] = useState("start");
  const [name, setName] = useState("Unsere Karten");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open) return null;

  const create = async () => { setBusy(true); setErr(""); const e = await onCreate(name.trim() || "Unsere Karten"); setBusy(false); if (e) setErr(e); };
  const join = async () => {
    const c = normalizeCode(code);
    if (c.length !== 6) { setErr("Der Code hat 6 Zeichen, z. B. K7M-Q2P."); return; }
    setBusy(true); setErr("");
    const e = await onJoin(c);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Space einrichten">
      <div className="absolute inset-0 bg-black bg-opacity-40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))", animation: "cbtSheetIn 300ms cubic-bezier(.2,.8,.2,1)" }}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: "linear-gradient(145deg,#4a4d53,#17181b)" }}>
          <Users size={26} />
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-gray-900">Gemeinsam tracken</h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-gray-500">
          Alle Karten und Häkchen gehören zu einem Space. Wer denselben Code nutzt, sieht dieselbe Checkliste.
        </p>

        {mode === "start" && (
          <div className="mt-6 space-y-3">
            <button onClick={() => { setMode("create"); setErr(""); }} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 font-semibold text-white active:scale-95">
              <Plus size={18} /> Neuen Space erstellen
            </button>
            <button onClick={() => { setMode("join"); setErr(""); }} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gray-100 font-semibold text-gray-900 active:scale-95">
              <ArrowRight size={18} /> Mit Code beitreten
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="mt-6 space-y-3">
            <Field label="Name des Space" hint="Nur für dich sichtbar. Ihr startet mit den vorinstallierten Karten.">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <button onClick={create} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 font-semibold text-white disabled:opacity-60 active:scale-95">
              {busy ? <Loader2 size={18} className="animate-spin" /> : null} Space erstellen
            </button>
            <button onClick={() => setMode("start")} className="h-11 w-full text-sm font-semibold text-gray-500">Zurück</button>
          </div>
        )}

        {mode === "join" && (
          <div className="mt-6 space-y-3">
            <Field label="Space-Code">
              <input
                className={inputCls + " text-center text-2xl font-semibold uppercase tracking-widest"}
                placeholder="K7M-Q2P"
                value={prettyCode(normalizeCode(code))}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoFocus
              />
            </Field>
            <button onClick={join} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 font-semibold text-white disabled:opacity-60 active:scale-95">
              {busy ? <Loader2 size={18} className="animate-spin" /> : null} Beitreten
            </button>
            <button onClick={() => setMode("start")} className="h-11 w-full text-sm font-semibold text-gray-500">Zurück</button>
          </div>
        )}

        {err && <p className="mt-3 flex items-start gap-2 text-sm text-red-600"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{err}</p>}
      </div>
    </div>
  );
}

function SharePanel({ open, onClose, profile, onRename, onLeave, sync }) {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const codeRef = useRef(null);
  useEffect(() => { if (open) { setName(profile?.name || ""); setCopied(false); } }, [open, profile]);
  if (!profile) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prettyCode(profile.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      const el = codeRef.current;
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Space teilen">
      <div className="rounded-3xl p-6 text-center text-white" style={{ background: "linear-gradient(145deg,#4a4d53 0%,#2a2c31 40%,#17181b 100%)" }}>
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.50)" }}>Space-Code</p>
        <p ref={codeRef} className="mt-2 select-all text-4xl font-semibold tracking-widest tabular-nums">{prettyCode(profile.code)}</p>
        <button onClick={copy} className="mx-auto mt-4 flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold active:scale-95" style={{ background: "rgba(255,255,255,0.15)" }}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Kopiert" : "Code kopieren"}
        </button>
      </div>

      <ol className="mt-5 space-y-3">
        {["Schick deinem Partner diesen Code.", "Er oder sie öffnet dieses Artifact und wählt „Mit Code beitreten“.", "Code eingeben – ab jetzt teilt ihr Karten und Häkchen. Änderungen erscheinen nach wenigen Sekunden beim anderen."].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">{i + 1}</span>
            <span className="pt-1 text-sm text-gray-700">{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {sync === "error" ? <CloudOff size={16} className="text-orange-500" /> : <Cloud size={16} className="text-green-600" />}
        {sync === "error" ? "Gerade keine Verbindung zum Speicher. Änderungen werden erneut gesendet." : "Synchronisierung aktiv"}
      </div>

      <div className="mt-5">
        <Field label="Name des Space (nur für dich)">
          <div className="flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            <button onClick={() => onRename(name.trim() || "Unsere Karten")} disabled={(name.trim() || "") === profile.name} className="h-12 flex-shrink-0 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-30">Sichern</button>
          </div>
        </Field>
      </div>

      <button onClick={onLeave} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50">
        <LogOut size={16} /> Space wechseln
      </button>
      <p className="mb-2 text-center text-xs text-gray-400">Die Daten bleiben im Space erhalten. Mit dem Code kommst du jederzeit zurück.</p>
    </Sheet>
  );
}

/* ───────────────────────── App ───────────────────────── */

export default function CardBenefitsTracker() {
  const [space, setSpace] = useState(seedSpace);          // sofort rendern mit Seed-Daten
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("loading");           // loading | gate | ready
  const [sync, setSync] = useState("idle");               // idle | saving | synced | error
  const [view, setView] = useState("todo");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const spaceRef = useRef(space);
  const profileRef = useRef(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef(null);
  const savingRef = useRef(false);
  useEffect(() => { spaceRef.current = space; }, [space]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Uhr: einmal pro Minute, damit Zeiträume zur Mitternacht wechseln
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  /* Hydration im Hintergrund */
  useEffect(() => {
    let alive = true;
    (async () => {
      const prof = await storageGet(PROFILE_KEY, false);
      if (!alive) return;
      if (prof.status !== "ok" || !prof.value?.code) { setPhase("gate"); return; }
      setProfile(prof.value);
      setPhase("ready");
      const remote = await storageGet(spaceKey(prof.value.code), true);
      if (!alive) return;
      if (remote.status === "ok") {
        setSpace((local) => (dirtyRef.current ? mergeSpaces(remote.value, local) : remote.value));
        setSync("synced");
      } else if (remote.status === "missing") {
        scheduleSave(0);
      } else {
        setSync("error");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async () => {
    const prof = profileRef.current;
    if (!prof || savingRef.current) return;
    savingRef.current = true;
    setSync("saving");
    const remote = await storageGet(spaceKey(prof.code), true);
    const merged = remote.status === "ok" ? mergeSpaces(remote.value, spaceRef.current) : spaceRef.current;
    const ok = remote.status !== "error" && (await storageSet(spaceKey(prof.code), merged, true));
    savingRef.current = false;
    if (ok) {
      dirtyRef.current = false;
      setSpace((cur) => { const m = mergeSpaces(merged, cur); return spaceSig(m) === spaceSig(cur) ? cur : m; });
      setSync("synced");
    } else {
      setSync("error");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(), 5000);
    }
  }, []);

  const scheduleSave = useCallback((ms = SAVE_DEBOUNCE_MS) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(), ms);
  }, [persist]);

  /* Partner-Änderungen abholen */
  const pull = useCallback(async () => {
    const prof = profileRef.current;
    if (!prof || savingRef.current || dirtyRef.current) return;
    const remote = await storageGet(spaceKey(prof.code), true);
    if (remote.status === "ok") {
      setSpace((cur) => { const m = mergeSpaces(cur, remote.value); return spaceSig(m) === spaceSig(cur) ? cur : m; });
      setSync("synced");
    } else if (remote.status === "error") {
      setSync("error");
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const t = setInterval(pull, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [phase, pull]);

  const mutate = useCallback((fn) => {
    dirtyRef.current = true;
    setSpace((cur) => fn(cur));
    if (profileRef.current) scheduleSave();
  }, [scheduleSave]);

  /* Aktionen */
  const toggle = (key, value) => mutate((s) => ({ ...s, usage: { ...s.usage, [key]: { v: value, t: Date.now() } } }));
  const addCards = (cards) => mutate((s) => ({ ...s, cards: [...s.cards, ...cards] }));
  const saveCard = (card) => mutate((s) => ({ ...s, cards: s.cards.map((c) => (c.id === card.id ? card : c)) }));
  const deleteCard = (card) => mutate((s) => ({ ...s, cards: s.cards.map((c) => (c.id === card.id ? { id: c.id, order: c.order, deleted: true, u: Date.now() } : c)) }));

  const createSpace = async (name) => {
    const code = randomCode();
    const prof = { code, name };
    const data = mergeSpaces(seedSpace(), spaceRef.current);
    const ok = await storageSet(spaceKey(code), data, true);
    await storageSet(PROFILE_KEY, prof, false);
    setProfile(prof); profileRef.current = prof;
    setSpace(data);
    setPhase("ready");
    setSync(ok ? "synced" : "error");
    if (!ok) scheduleSave(3000);
    setShareOpen(true);
    return null;
  };

  const joinSpace = async (code) => {
    const remote = await storageGet(spaceKey(code), true);
    if (remote.status === "missing") return "Unter diesem Code gibt es keinen Space. Prüfe die Schreibweise oder erstelle einen neuen.";
    if (remote.status === "error") return "Der Speicher antwortet gerade nicht. Versuch es in ein paar Sekunden nochmal.";
    const prof = { code, name: "Unsere Karten" };
    await storageSet(PROFILE_KEY, prof, false);
    dirtyRef.current = false;
    setProfile(prof); profileRef.current = prof;
    setSpace(remote.value);
    setPhase("ready");
    setSync("synced");
    return null;
  };

  const renameSpace = async (name) => {
    const prof = { ...profileRef.current, name };
    setProfile(prof);
    await storageSet(PROFILE_KEY, prof, false);
  };

  const leaveSpace = async () => {
    clearTimeout(saveTimer.current);
    if (dirtyRef.current) await persist();
    await storageDelete(PROFILE_KEY, false);
    setShareOpen(false);
    setProfile(null); profileRef.current = null;
    dirtyRef.current = false;
    setSpace(seedSpace());
    setSync("idle");
    setPhase("gate");
  };

  const cards = useMemo(() => space.cards.filter((c) => !c.deleted), [space.cards]);
  const stats = useMemo(() => computeStats(cards, space.usage, now), [cards, space.usage, now]);
  const openCount = useMemo(() => {
    let n = 0;
    for (const card of cards) for (const ben of card.benefits) {
      if (ben.cadence === "perk") continue;
      const { periods, current } = cycleFor(card, ben.cadence, now);
      if (periods[current] && !space.usage[usageKey(card.id, ben.id, periods[current].key)]?.v) n++;
    }
    return n;
  }, [cards, space.usage, now]);

  const syncChip = {
    idle: phase === "loading" ? { icon: Loader2, text: "Lädt…", spin: true, cls: "text-gray-400" } : { icon: Cloud, text: "Lokal", cls: "text-gray-400" },
    saving: { icon: RefreshCw, text: "Speichert…", spin: true, cls: "text-gray-400" },
    synced: { icon: Cloud, text: "Synchron", cls: "text-green-600" },
    error: { icon: CloudOff, text: "Offline", cls: "text-orange-500" },
  }[sync];
  const SyncIcon = syncChip.icon;

  return (
    <div className="min-h-screen w-full text-gray-900" style={{ background: "linear-gradient(180deg, #f4f5f7 0%, #e9ebef 55%, #e2e5ea 100%)", fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @keyframes cbtSheetIn { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
      `}</style>
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:pt-10">
        {/* Kopfzeile */}
        <header className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-gray-400">
              <CalendarDays size={13} /> {now.getDate()}. {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
            </p>
            <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-gray-900">{profile?.name || "Kartenvorteile"}</h1>
            <button onClick={() => profile && setShareOpen(true)} className={`mt-1 flex items-center gap-1 text-xs font-medium ${syncChip.cls}`}>
              <SyncIcon size={13} className={syncChip.spin ? "animate-spin" : ""} />
              {syncChip.text}{profile ? ` · ${prettyCode(profile.code)}` : ""}
            </button>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button onClick={() => (profile ? setShareOpen(true) : setPhase("gate"))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm active:scale-95" aria-label="Space teilen">
              <Users size={19} />
            </button>
            <button onClick={() => setAddOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-white shadow-md active:scale-95" aria-label="Karte hinzufügen">
              <Plus size={21} />
            </button>
          </div>
        </header>

        <Hero stats={stats} year={now.getFullYear()} />

        <div className="mt-6">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "todo", label: "To-Do", icon: ListChecks, badge: openCount },
              { value: "cards", label: "Alle Karten", icon: LayoutGrid },
            ]}
          />
        </div>

        <main className="mt-5">
          {view === "todo" ? (
            <TodoView cards={cards} usage={space.usage} now={now} onToggle={toggle} onAddCard={() => setAddOpen(true)} />
          ) : (
            <CardsView cards={cards} usage={space.usage} now={now} onToggle={toggle} onEdit={setEditing} onAddCard={() => setAddOpen(true)} />
          )}
        </main>

        <p className="mt-10 text-center text-xs text-gray-400">
          {cards.length} {cards.length === 1 ? "Karte" : "Karten"} · Monats-, Quartals- und Halbjahres-Credits folgen dem Kalender
        </p>
      </div>

      <AddCardSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addCards} />
      <EditCardSheet card={editing} onClose={() => setEditing(null)} onSave={saveCard} onDelete={deleteCard} />
      <SharePanel open={shareOpen} onClose={() => setShareOpen(false)} profile={profile} onRename={renameSpace} onLeave={leaveSpace} sync={sync} />
      <SpaceGate open={phase === "gate"} onCreate={createSpace} onJoin={joinSpace} />
    </div>
  );
}
