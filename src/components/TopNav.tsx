"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRealtime } from "./RealtimeProvider";
import { useTheme } from "./ThemeProvider";

interface StatusPayload {
  linkup: { configured: boolean };
  nebius: { configured: boolean; model: string };
  convex: { configured: boolean };
}

const LINKS = [
  { href: "/", label: "Need help" },
  { href: "/volunteer", label: "Volunteer" },
  { href: "/eval", label: "Model eval" },
];

const DEFAULT_CENTER = { lat: 37.8044, lng: -122.2712 };

export default function TopNav() {
  const pathname = usePathname();
  const { mode, requests, botsSupported, botCount, seedBots, clearBots, clearAll } = useRealtime();
  const { theme, toggle } = useTheme();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState<"bots" | "reset" | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const openCount = requests.filter((r) => r.status === "waiting").length;

  const handleBots = async () => {
    setBusy("bots");
    try {
      if (botCount > 0) {
        await clearBots();
      } else {
        // Drop them around the most recent request, or the default city.
        const anchor = requests[0] ? { lat: requests[0].lat, lng: requests[0].lng } : DEFAULT_CENTER;
        await seedBots(anchor, 4);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Clear all ${requests.length} requests from the board?`)) return;
    setBusy("reset");
    try {
      await clearAll();
      window.localStorage.removeItem("helploop.myRequestId");
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="z-30 flex shrink-0 items-center gap-4 border-b border-white/10 bg-ink-950/90 px-4 py-2.5 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-[17px] shadow-[0_8px_24px_-8px_rgba(139,92,246,0.9)]">
          🔁
        </span>
        <span className="leading-none">
          <span className="block text-[17px] font-bold tracking-tight text-white">HelpLoop</span>
          <span className="hidden text-[11.5px] text-mist-400 sm:block">
            Find help. Match help. Move help.
          </span>
        </span>
      </Link>

      <nav className="flex items-center gap-1">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold transition ${
                active ? "bg-white/10 text-white" : "text-mist-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {link.label}
              {link.href === "/volunteer" && openCount > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-px font-mono text-[10px] text-[#fff]">
                  {openCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Demo controls */}
        {botsSupported && (
          <button
            onClick={handleBots}
            disabled={busy !== null}
            title={
              botCount > 0
                ? `${botCount} simulated volunteers on the map — click to remove`
                : "Add simulated volunteers that accept requests and ride the route"
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition disabled:opacity-50 ${
              botCount > 0
                ? "border-sky-400/40 bg-sky-400/10 text-sky-300 hover:border-rose-400/40 hover:text-rose-300"
                : "border-white/10 bg-white/5 text-mist-400 hover:border-sky-400/40 hover:text-sky-300"
            }`}
          >
            🤖 {botCount > 0 ? `${botCount} bots` : "Add bots"}
          </button>
        )}
        {requests.length > 0 && (
          <button
            onClick={handleReset}
            disabled={busy !== null}
            title="Clear the board between demo run-throughs"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11.5px] font-semibold text-mist-400 transition hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
          >
            Reset board
          </button>
        )}

        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/5 text-[15px] transition hover:border-white/25"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        <span className="mx-1 hidden h-4 w-px bg-white/10 md:block" />

        <Track label="Linkup" live={status?.linkup.configured} fallback="demo set" />
        <Track label="Nebius" live={status?.nebius.configured} fallback="heuristic" />
        <Track label="Convex" live={mode === "convex"} fallback="local sync" />
      </div>
    </header>
  );
}

/** Honest status pips — a demo that hides its fallbacks is a demo that lies. */
function Track({ label, live, fallback }: { label: string; live?: boolean; fallback: string }) {
  return (
    <span
      title={live ? `${label}: live` : `${label}: not configured — using ${fallback}`}
      className={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold md:inline-flex ${
        live
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-ink-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-ink-500"}`} />
      {label}
    </span>
  );
}
