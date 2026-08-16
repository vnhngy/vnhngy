"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic2 } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/", label: "Start" },
  { href: "/#preise", label: "Preise" },
  { href: "/sing", label: "Mitsingen" },
  { href: "/queue", label: "Warteschlange" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-stage-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-neon-pink to-neon-purple">
            <Mic2 className="h-4 w-4" />
          </span>
          SingNight
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                pathname === link.href
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <Link
          href="/join"
          className="rounded-full bg-gradient-to-r from-neon-pink to-neon-purple px-4 py-2 text-sm font-semibold text-white shadow-glow transition active:scale-95"
        >
          Jetzt singen
        </Link>
      </nav>
    </header>
  );
}
