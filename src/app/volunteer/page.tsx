"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useRealtime } from "@/components/RealtimeProvider";
import MissionBanner from "@/components/MissionBanner";
import { Button, Chip, Empty, Panel, PanelHeader, TextInput, timeAgo } from "@/components/ui";
import { distanceMiles, scatterAround } from "@/lib/geo";
import {
  STATUS_EMOJI,
  STATUS_LABEL,
  type HelpRequest,
  type RequestStatus,
} from "@/lib/types";
import type { MissionState } from "@/components/MapCanvas";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-ink-950">
      <span className="text-[13.5px] text-ink-500">Loading map…</span>
    </div>
  ),
});

const NAME_KEY = "helploop.volunteerName";
const VOL_ID_KEY = "helploop.volunteerId";
const DOC_ID_KEY = "helploop.volunteerDocId";

/** How often a position is pushed while sharing. */
const SHARE_INTERVAL_MS = 2000;
/** Demo-scale speed of the simulated driver, matches the bots. */
const SIM_SPEED_MPS = 45;

const NEXT_STEP: Partial<Record<RequestStatus, { next: RequestStatus; label: string }>> = {
  assigned: { next: "picked_up", label: "🍱 Picked up" },
  picked_up: { next: "on_the_way", label: "🚲 On the way" },
  on_the_way: { next: "delivered", label: "🎉 Delivered" },
};

type LocationSource = "gps" | "simulated" | "off";

export default function VolunteerPage() {
  const realtime = useRealtime();
  const [name, setName] = useState("");
  const [volunteerId, setVolunteerId] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>("off");

  useEffect(() => {
    const storedName = window.localStorage.getItem(NAME_KEY);
    let id = window.localStorage.getItem(VOL_ID_KEY);
    if (!id) {
      id = `vol_${Math.random().toString(36).slice(2, 9)}`;
      window.localStorage.setItem(VOL_ID_KEY, id);
    }
    setVolunteerId(id);
    const storedDoc = window.localStorage.getItem(DOC_ID_KEY);
    if (storedDoc) setDocId(storedDoc);
    if (storedName) {
      setName(storedName);
      setJoined(true);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const openRequests = realtime.requests.filter((r) => r.status === "waiting");
  const myJobs = realtime.requests.filter(
    (r) => r.volunteerId === volunteerId && r.status !== "delivered" && r.status !== "cancelled",
  );
  const myDone = realtime.requests.filter(
    (r) => r.volunteerId === volunteerId && r.status === "delivered",
  );
  const activeJob = myJobs.find((j) => j._id === focusId) ?? myJobs[0] ?? null;

  // A starting point when the device gives us nothing: fixed per volunteer.
  const fallbackPosition = useMemo(() => {
    const anchor = realtime.requests[0];
    const base = anchor ? { lat: anchor.lat, lng: anchor.lng } : { lat: 37.8044, lng: -122.2712 };
    return scatterAround(base, volunteerId || "vol", 2);
  }, [realtime.requests, volunteerId]);

  const myPosition = position ?? fallbackPosition;

  // ── check in (and get our row id) ───────────────────────
  useEffect(() => {
    if (!joined || !name) return;
    realtime
      .checkIn(name, myPosition)
      .then((id) => {
        if (id) {
          setDocId(id);
          window.localStorage.setItem(DOC_ID_KEY, id);
        }
      })
      .catch(() => {});
    // Only on join: position updates go through updateLocation below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, name]);

  // ── location: real GPS if the device grants it ──────────
  useEffect(() => {
    if (!joined || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (joined) setLocationSource("simulated");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationSource("gps");
      },
      () => setLocationSource((s) => (s === "gps" ? s : "simulated")),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [joined]);

  // ── location: simulated driver when there is no GPS ─────
  // Moves toward the current target at bot speed so a laptop demo still
  // shows a courier actually travelling. It is labelled as simulated.
  const simRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (locationSource !== "simulated" || !joined) return;
    simRef.current = simRef.current ?? fallbackPosition;
    const timer = setInterval(() => {
      const here = simRef.current!;
      const job = activeJob;
      let next = here;
      if (job) {
        const target =
          job.status === "assigned"
            ? { lat: job.resource.lat ?? job.lat, lng: job.resource.lng ?? job.lng }
            : { lat: job.lat, lng: job.lng };
        next = stepToward(here, target, (SIM_SPEED_MPS * SHARE_INTERVAL_MS) / 1000);
      }
      simRef.current = next;
      setPosition(next);
    }, SHARE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [locationSource, joined, activeJob, fallbackPosition]);

  // ── push whatever we have to Convex (throttled) ─────────
  const lastPushRef = useRef(0);
  useEffect(() => {
    if (!docId || !position || locationSource === "off") return;
    const now = Date.now();
    if (now - lastPushRef.current < SHARE_INTERVAL_MS - 200) return;
    lastPushRef.current = now;
    realtime.updateLocation(docId, position.lat, position.lng).catch(() => {});
  }, [docId, position, locationSource, realtime]);

  const mission = useMemo<MissionState | null>(() => {
    if (!activeJob) return null;
    const res = activeJob.resource;
    if (res.lat === undefined || res.lng === undefined) return null;
    return {
      requestId: activeJob._id,
      phase: activeJob.status,
      volunteer: myPosition,
      resource: { lat: res.lat, lng: res.lng, name: res.name },
      requester: { lat: activeJob.lat, lng: activeJob.lng },
      // Our own position is exact on our own screen — that's fine, it's ours.
      tracked: locationSource !== "off",
    };
  }, [activeJob, myPosition, locationSource]);

  const handleAccept = useCallback(
    async (request: HelpRequest) => {
      const result = await realtime.accept(
        request._id,
        volunteerId,
        name || "A volunteer",
        docId ?? undefined,
      );
      if (!result.ok) {
        setToast(
          result.reason === "already-taken"
            ? "Another volunteer got there first."
            : "Could not accept that one.",
        );
        return;
      }
      setFocusId(request._id);
      setToast("🚲 Mission accepted!");
    },
    [realtime, volunteerId, name, docId],
  );

  const handleAdvance = useCallback(
    async (request: HelpRequest, next: RequestStatus) => {
      await realtime.advance(request._id, next, name || "A volunteer");
      if (next === "delivered") {
        confetti({
          particleCount: 130,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#21e39a", "#46b5ff", "#a78bfa"],
          disableForReducedMotion: true,
        });
        setToast("🎉 Help delivered. One less problem on the map.");
      }
    },
    [realtime, name],
  );

  const center = activeJob
    ? { lat: activeJob.lat, lng: activeJob.lng }
    : openRequests[0]
      ? { lat: openRequests[0].lat, lng: openRequests[0].lng }
      : null;

  if (!joined) {
    return (
      <div className="grid h-full place-items-center p-6">
        <Panel className="hl-rise w-full max-w-sm overflow-hidden">
          <PanelHeader
            title="Join as a volunteer"
            subtitle="No account. Pick a name so the person you help knows who is coming."
          />
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              window.localStorage.setItem(NAME_KEY, trimmed);
              setName(trimmed);
              setJoined(true);
            }}
          >
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maya"
              maxLength={24}
            />
            <Button type="submit" size="lg" className="w-full" disabled={!name.trim()}>
              I&apos;m ready to help
            </Button>
            <p className="text-center text-[11.5px] leading-4 text-ink-500">
              🔒 Requesters see your position rounded to about a quarter mile — never your
              exact location.
            </p>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapCanvas
        center={center}
        origin={{ ...myPosition, label: `${name} (you)` }}
        requests={realtime.requests}
        onSelectRequest={setFocusId}
        volunteers={realtime.volunteers}
        selfVolunteerId={docId}
        mission={mission}
      />

      <MissionBanner status={activeJob?.status ?? null} />

      <div className="absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col gap-3 overflow-y-auto p-3 md:max-w-[440px]">
        <div className="flex shrink-0 flex-col gap-3">
          <Panel className="hl-rise overflow-hidden">
            <PanelHeader
              title={`Hi ${name} 👋`}
              subtitle={`${myDone.length} ${myDone.length === 1 ? "delivery" : "deliveries"} completed`}
              right={
                <Chip tone={realtime.mode === "convex" ? "good" : "neutral"}>
                  {realtime.mode === "convex" ? "Convex live" : "local sync"}
                </Chip>
              }
            />
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-[12.5px]">
              <span className="text-mist-400">
                {locationSource === "gps" && "📍 Sharing GPS position"}
                {locationSource === "simulated" && "📍 Sharing a simulated position (no GPS here)"}
                {locationSource === "off" && "📍 Location off"}
              </span>
              <span className="text-[11.5px] text-ink-500">rounded to ~¼ mi for others</span>
            </div>
          </Panel>

          {myJobs.length > 0 && (
            <Panel className="hl-rise overflow-hidden border-sky-400/30">
              <PanelHeader
                title="🚲 Your mission"
                subtitle="Tap the next step as you go — the requester sees it instantly."
              />
              <div className="space-y-3 p-3">
                {myJobs.map((job) => (
                  <MissionCard
                    key={job._id}
                    job={job}
                    active={job._id === activeJob?._id}
                    onFocus={() => setFocusId(job._id)}
                    onAdvance={handleAdvance}
                  />
                ))}
              </div>
            </Panel>
          )}

          <Panel className="hl-rise overflow-hidden">
            <PanelHeader
              title={`${openRequests.length} open request${openRequests.length === 1 ? "" : "s"}`}
              subtitle="People near you waiting for a pickup right now."
              right={openRequests.length > 0 ? <Chip tone="bad">🆘 live</Chip> : undefined}
            />
            <div className="space-y-2.5 p-3">
              {openRequests.map((request) => (
                <OpenRequestCard
                  key={request._id}
                  request={request}
                  from={myPosition}
                  onAccept={() => handleAccept(request)}
                  onHover={() => setFocusId(request._id)}
                />
              ))}
              {!openRequests.length && (
                <Empty
                  icon="🌙"
                  title="Nothing waiting right now"
                  body="Open the requester view in another window and post a request — it appears here the moment it's created."
                />
              )}
            </div>
          </Panel>

          {myDone.length > 0 && (
            <Panel className="hl-rise overflow-hidden">
              <PanelHeader title="Completed" subtitle="Nice work." />
              <ul className="divide-y divide-white/5">
                {myDone.slice(0, 5).map((job) => (
                  <li key={job._id} className="flex items-center gap-2 px-4 py-2.5">
                    <span>✅</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-mist-200">
                      {job.resource.name}
                    </span>
                    <span className="text-[11.5px] text-ink-500">{timeAgo(job.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {toast && (
        <div className="hl-pop pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="rounded-full border border-white/15 bg-ink-900/95 px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function stepToward(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  meters: number,
): { lat: number; lng: number } {
  const total = distanceMiles(a, b) * 1609.34;
  if (total <= meters || total === 0) return b;
  const t = meters / total;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function OpenRequestCard({
  request,
  from,
  onAccept,
  onHover,
}: {
  request: HelpRequest;
  from: { lat: number; lng: number } | null;
  onAccept: () => void;
  onHover: () => void;
}) {
  const away = from ? distanceMiles(from, { lat: request.lat, lng: request.lng }) : null;
  return (
    <div
      onMouseEnter={onHover}
      className="hl-rise rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-3 transition hover:border-rose-400/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-white">
            {request.category === "shelter" ? "🛏️" : request.category === "clothing" ? "🧥" : "🍲"} {request.need}
          </p>
          <p className="mt-0.5 text-[12.5px] text-mist-400">
            {request.category === "shelter" ? "Get them to" : "Pick up from"}{" "}
            <span className="text-mist-200">{request.resource.name}</span>
          </p>
          <p className="text-[12px] text-ink-500">{request.resource.address}</p>
        </div>
        {away !== null && (
          <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 font-mono text-[12.5px] text-mist-200">
            {away} mi
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {request.who && request.who !== "anyone" && <Chip tone="brand">{request.who}</Chip>}
        {request.diet !== "any" && <Chip tone="brand">{request.diet}</Chip>}
        <Chip>{TRANSPORT_LABEL[request.transport] ?? request.transport}</Chip>
        <Chip tone={request.urgency === "tonight" ? "bad" : "neutral"}>{request.urgency}</Chip>
        <Chip>posted {timeAgo(request.createdAt)}</Chip>
      </div>

      {request.matchScore !== undefined && (
        <p className="mt-2 text-[12px] leading-4 text-amber-300/90">
          ⭐ {request.matchScore}% match · {request.matchReason}
        </p>
      )}

      <Button variant="danger" size="md" className="mt-2.5 w-full" onClick={onAccept}>
        I can help
      </Button>
    </div>
  );
}

function MissionCard({
  job,
  active,
  onFocus,
  onAdvance,
}: {
  job: HelpRequest;
  active: boolean;
  onFocus: () => void;
  onAdvance: (job: HelpRequest, next: RequestStatus) => void;
}) {
  const step = NEXT_STEP[job.status];
  return (
    <div
      onClick={onFocus}
      className={`rounded-xl border p-3 transition ${
        active ? "border-sky-400/50 bg-sky-400/[0.08]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{STATUS_EMOJI[job.status]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{job.resource.name}</p>
          <p className="text-[12.5px] text-mist-400">{STATUS_LABEL[job.status]}</p>
        </div>
      </div>

      <div className="mt-2 space-y-1 rounded-lg border border-white/8 bg-black/20 p-2 font-mono text-[12px] leading-5 text-mist-400">
        <p>🙋 you</p>
        <p className="pl-1 text-ink-500">↓</p>
        <p>🍲 {job.resource.name}</p>
        <p className="pl-1 text-ink-500">↓</p>
        <p>📍 {job.locationText}</p>
      </div>

      {step && (
        <Button
          variant={step.next === "delivered" ? "success" : "primary"}
          className="mt-2.5 w-full"
          onClick={() => onAdvance(job, step.next)}
        >
          {step.label}
        </Button>
      )}
    </div>
  );
}

const TRANSPORT_LABEL: Record<string, string> = {
  walking: "🚶 no car",
  transit: "🚌 transit",
  bike: "🚲 bike",
  car: "🚗 has car",
};
