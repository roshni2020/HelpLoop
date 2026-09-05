"use client";

// The requester's live view. Nothing here is polled — the Convex (or
// shim) subscription pushes, and this component just renders whatever
// the shared task state currently says.

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Button, Chip, Panel, PanelHeader, timeAgo } from "./ui";
import {
  STATUS_EMOJI,
  STATUS_FLOW,
  type HelpRequest,
  type RequestStatus,
  type Tracking,
} from "@/lib/types";

const HEADLINE: Record<RequestStatus, { title: string; body: string }> = {
  waiting: {
    title: "Looking for a volunteer",
    body: "Your request is live on the map. Someone nearby will see it.",
  },
  assigned: {
    title: "Volunteer assigned",
    body: "They're on their way there now.",
  },
  picked_up: {
    title: "Picked up",
    body: "It's in hand and on its way to you.",
  },
  on_the_way: {
    title: "On the way to you",
    body: "Keep an eye on the map — you'll see them approaching.",
  },
  delivered: {
    title: "Delivered",
    body: "It arrived. Nothing else to do.",
  },
  cancelled: { title: "Cancelled", body: "This request was closed." },
};

export default function LiveRequestCard({
  request,
  tracking,
  onNewRequest,
}: {
  request: HelpRequest;
  tracking?: Tracking | null;
  onNewRequest: () => void;
}) {
  const celebrated = useRef(false);

  useEffect(() => {
    if (request.status !== "delivered" || celebrated.current) return;
    celebrated.current = true;
    const fire = (ratio: number, opts: confetti.Options) =>
      confetti({
        particleCount: Math.floor(160 * ratio),
        spread: 70,
        origin: { y: 0.62 },
        colors: ["#21e39a", "#a78bfa", "#46b5ff", "#ffb020"],
        disableForReducedMotion: true,
        ...opts,
      });
    fire(0.3, { startVelocity: 52 });
    fire(0.25, { spread: 110, decay: 0.92, scalar: 0.9 });
    fire(0.2, { spread: 130, startVelocity: 28, decay: 0.94, scalar: 1.15 });
  }, [request.status]);

  const head = HEADLINE[request.status];
  const stepIndex = STATUS_FLOW.indexOf(request.status);
  const done = request.status === "delivered";

  return (
    <Panel className={`hl-rise overflow-hidden ${done ? "border-emerald-400/40" : ""}`}>
      <PanelHeader
        title="Your request"
        subtitle={`Created ${timeAgo(request.createdAt)}`}
        right={
          <Chip tone={done ? "good" : request.status === "waiting" ? "bad" : "warn"}>
            {STATUS_EMOJI[request.status]} live
          </Chip>
        }
      />

      <div className="p-4">
        <div
          className={`rounded-2xl border p-4 text-center ${
            done
              ? "border-emerald-400/40 bg-emerald-400/10"
              : request.status === "waiting"
                ? "border-rose-400/30 bg-rose-400/[0.07]"
                : "border-sky-400/30 bg-sky-400/[0.07]"
          }`}
        >
          <div className="hl-pop text-3xl">{STATUS_EMOJI[request.status]}</div>
          <h3 className="mt-1.5 text-[17px] font-bold text-white">
            {request.status === "assigned" && request.volunteerName
              ? `${request.volunteerName} is helping you`
              : head.title}
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-mist-400">{head.body}</p>
          {done && (
            <p className="mt-2 text-[13px] font-bold text-emerald-300">
              🎉 One less problem on the map.
            </p>
          )}
        </div>

        {tracking && !done && (
          <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-400/[0.07] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-white">
                {tracking.isBot ? "🤖" : "🛵"} {tracking.volunteerName}
                {tracking.stale ? " · last seen a while ago" : " · live"}
              </p>
              <span className="rounded-lg bg-white/5 px-2 py-0.5 font-mono text-[11px] text-sky-300">
                ~{tracking.etaMinutes} min
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-mist-400">
              {(tracking.metersToNextStop / 1609).toFixed(1)} mi from{" "}
              {tracking.nextStop === "pantry" ? "the pantry" : "you"}
            </p>
            <p className="mt-1.5 text-[10px] leading-4 text-ink-500">
              🔒 Location shown to the nearest ~¼ mile. A volunteer&apos;s exact position is
              never shared.
            </p>
          </div>
        )}

        <ol className="mt-4 space-y-0">
          {STATUS_FLOW.map((status, i) => {
            const entry = request.timeline.find((t) => t.status === status);
            const reached = i <= stepIndex;
            const current = i === stepIndex;
            return (
              <li key={status} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] transition ${
                      reached
                        ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300"
                        : "border-white/12 bg-white/[0.03] text-ink-500"
                    } ${current ? "ring-2 ring-emerald-400/25" : ""}`}
                  >
                    {reached ? STATUS_EMOJI[status] : "○"}
                  </span>
                  {i < STATUS_FLOW.length - 1 && (
                    <span
                      className={`h-6 w-px ${reached && i < stepIndex ? "bg-emerald-400/40" : "bg-white/10"}`}
                    />
                  )}
                </div>
                <div className="pb-1.5">
                  <p
                    className={`text-[12px] font-semibold ${reached ? "text-white" : "text-ink-500"}`}
                  >
                    {LABELS[status]}
                  </p>
                  {entry && (
                    <p className="text-[10px] text-mist-400">
                      {new Date(entry.at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {entry.by ? ` · ${entry.by}` : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-mist-400">
            {request.category === "shelter" ? "Heading to" : "Picking up from"}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-white">{request.resource.name}</p>
          <p className="text-[11px] text-mist-400">{request.resource.address}</p>
          {request.resource.hours && (
            <p className="mt-0.5 text-[11px] text-mist-400">🕐 {request.resource.hours}</p>
          )}
          {request.matchScore !== undefined && (
            <p className="mt-1.5 text-[11px] text-amber-300">
              ⭐ {request.matchScore}% match · {request.matchReason}
            </p>
          )}
        </div>

        {done && (
          <Button variant="ghost" className="mt-3 w-full" onClick={onNewRequest}>
            Start a new request
          </Button>
        )}
      </div>
    </Panel>
  );
}

const LABELS: Record<RequestStatus, string> = {
  waiting: "Request posted",
  assigned: "Volunteer accepted",
  picked_up: "Picked up from pantry",
  on_the_way: "On the way to you",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
