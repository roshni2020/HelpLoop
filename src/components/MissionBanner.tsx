"use client";

// The NERDCONF moment: a full-width flash when the shared request state
// crosses a milestone. Driven purely by the status Convex pushes, so both
// screens fire it at the same instant.

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import type { RequestStatus } from "@/lib/types";

const MOMENTS: Partial<Record<RequestStatus, { title: string; sub: string; tone: string; confetti?: boolean }>> = {
  assigned: {
    title: "MISSION ACCEPTED 🚲",
    sub: "A volunteer is on the way to the pantry.",
    tone: "from-sky-500 to-violet-500",
  },
  picked_up: {
    title: "PICKED UP 🍱",
    sub: "Food in hand. Heading to you.",
    tone: "from-amber-400 to-orange-500",
  },
  delivered: {
    title: "HELP DELIVERED 🎉",
    sub: "One less problem on the map.",
    tone: "from-emerald-400 to-teal-400",
    confetti: true,
  },
};

export default function MissionBanner({ status }: { status: RequestStatus | null | undefined }) {
  const [shown, setShown] = useState<RequestStatus | null>(null);
  const last = useRef<RequestStatus | null | undefined>(undefined);

  useEffect(() => {
    // Only fire on a transition we watched happen, not on first paint.
    const prev = last.current;
    last.current = status;
    if (prev === undefined || !status || prev === status) return;
    const moment = MOMENTS[status];
    if (!moment) return;
    setShown(status);
    if (moment.confetti) {
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.55 },
        colors: ["#21e39a", "#a78bfa", "#46b5ff", "#ffb020"],
        disableForReducedMotion: true,
      });
    }
    const t = setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(t);
  }, [status]);

  if (!shown) return null;
  const m = MOMENTS[shown]!;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
      <div
        className={`hl-pop rounded-3xl bg-gradient-to-r ${m.tone} px-10 py-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]`}
      >
        <p className="text-4xl font-black tracking-tight text-[#fff] drop-shadow">{m.title}</p>
        <p className="mt-1.5 text-[15px] font-semibold text-[#fff]/90">{m.sub}</p>
      </div>
    </div>
  );
}
