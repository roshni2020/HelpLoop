"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime, useTracking } from "@/components/RealtimeProvider";
import RequestHelpForm from "@/components/RequestHelpForm";
import ResearchFeed from "@/components/ResearchFeed";
import ResourceResults from "@/components/ResourceResults";
import LiveRequestCard from "@/components/LiveRequestCard";
import { Panel, Button, Empty } from "@/components/ui";
import { useResearch } from "@/hooks/useResearch";
import { scatterAround } from "@/lib/geo";
import type { HelpNeed, RankedResource, Resource } from "@/lib/types";
import type { MissionState } from "@/components/MapCanvas";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-ink-950">
      <span className="text-[13.5px] text-ink-500">Loading map…</span>
    </div>
  ),
});

const MY_REQUEST_KEY = "helploop.myRequestId";

export default function RequesterPage() {
  const realtime = useRealtime();
  const research = useResearch();

  const [need, setNeed] = useState<HelpNeed | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [myRequestId, setMyRequestId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Survive a refresh mid-demo.
  useEffect(() => {
    const stored = window.localStorage.getItem(MY_REQUEST_KEY);
    if (stored) setMyRequestId(stored);
  }, []);

  const myRequest = useMemo(
    () => realtime.requests.find((r) => r._id === myRequestId) ?? null,
    [realtime.requests, myRequestId],
  );

  // The stored id can outlive the request (demo reset, cleared board).
  useEffect(() => {
    if (myRequestId && realtime.ready && !myRequest) {
      window.localStorage.removeItem(MY_REQUEST_KEY);
      setMyRequestId(null);
    }
  }, [myRequestId, myRequest, realtime.ready]);

  // Live, privacy-rounded position of whoever is helping — null until
  // someone accepts, or when running on the local shim.
  const tracking = useTracking(myRequest && myRequest.status !== "waiting" ? myRequest._id : null);

  const bestId = research.ranking[0]?.resourceId ?? null;
  const scores = useMemo(
    () =>
      Object.fromEntries(research.ranking.map((r) => [r.resourceId, r.score])) as Record<
        string,
        number
      >,
    [research.ranking],
  );

  useEffect(() => {
    if (bestId && !selectedId) setSelectedId(bestId);
  }, [bestId, selectedId]);

  const handleSubmit = useCallback(
    (submitted: HelpNeed) => {
      setNeed(submitted);
      setSelectedId(null);
      research.start(submitted);
    },
    [research],
  );

  const handleRequestHelp = useCallback(
    async (resource: Resource, rank: RankedResource | undefined) => {
      if (!need || !research.origin || creating) return;
      setCreating(true);
      try {
        const id = await realtime.createRequest({
          requesterName: "You",
          category: need.category,
          need: need.need,
          locationText: research.origin.label.split(",").slice(0, 2).join(",").trim(),
          lat: research.origin.lat,
          lng: research.origin.lng,
          diet: need.diet,
          transport: need.transport,
          urgency: need.urgency,
          who: need.who,
          matchScore: rank?.score,
          matchReason: rank?.reason,
          resource: {
            id: resource.id,
            name: resource.name,
            address: resource.address || "Address unconfirmed",
            lat: resource.lat,
            lng: resource.lng,
            hours: resource.hours,
            confidence: resource.confidence,
          },
        });
        window.localStorage.setItem(MY_REQUEST_KEY, id);
        setMyRequestId(id);
      } finally {
        setCreating(false);
      }
    },
    [need, research.origin, realtime, creating],
  );

  const handleNewRequest = useCallback(() => {
    window.localStorage.removeItem(MY_REQUEST_KEY);
    setMyRequestId(null);
    setNeed(null);
    setSelectedId(null);
    research.reset();
  }, [research]);

  // The courier on the map. With tracking, it's the live rounded position.
  // Without, a start point synthesised from the request id so both screens
  // still animate the same route.
  const mission = useMemo<MissionState | null>(() => {
    if (!myRequest || myRequest.status === "waiting") return null;
    const res = myRequest.resource;
    if (res.lat === undefined || res.lng === undefined) return null;
    const requester = { lat: myRequest.lat, lng: myRequest.lng };
    const volunteer = tracking
      ? { lat: tracking.approxLat, lng: tracking.approxLng }
      : scatterAround(requester, myRequest._id, 2);
    return {
      requestId: myRequest._id,
      phase: myRequest.status,
      volunteer,
      resource: { lat: res.lat, lng: res.lng, name: res.name },
      requester,
      tracked: Boolean(tracking),
    };
  }, [myRequest, tracking]);

  const center = myRequest
    ? { lat: myRequest.lat, lng: myRequest.lng }
    : research.origin
      ? { lat: research.origin.lat, lng: research.origin.lng }
      : null;

  const running = research.phase === "running";

  return (
    <div className="relative h-full w-full">
      <MapCanvas
        center={center}
        // Once the request exists it carries its own pin at this spot,
        // so a second "You" marker would just sit underneath it.
        origin={myRequest ? null : research.origin}
        resources={myRequest ? [] : research.resources}
        bestResourceId={bestId}
        selectedResourceId={selectedId}
        scores={scores}
        onSelectResource={setSelectedId}
        requests={realtime.requests}
        selfRequestId={myRequestId}
        volunteers={realtime.volunteers}
        mission={mission}
      />

      {/* Left rail: the request, then the ranked results */}
      <div className="absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col gap-3 overflow-y-auto p-3 md:max-w-[440px]">
        <div className="flex shrink-0 flex-col gap-3">
          {myRequest ? (
            <LiveRequestCard request={myRequest} tracking={tracking} onNewRequest={handleNewRequest} />
          ) : research.phase === "idle" ? (
            <RequestHelpForm onSubmit={handleSubmit} busy={running} />
          ) : (
            <>
              {research.ranking.length > 0 ? (
                <ResourceResults
                  resources={research.resources}
                  ranking={research.ranking}
                  meta={research.rankMeta}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRequestHelp={handleRequestHelp}
                  busy={creating}
                  cta={need?.category === "shelter" ? "Need help getting there" : "Need pickup help"}
                />
              ) : (
                <Panel className="hl-rise">
                  {research.phase === "error" ? (
                    <>
                      <Empty
                        icon="⛔"
                        title="Research hit a wall"
                        body={research.error ?? "Something went wrong."}
                      />
                      <div className="px-4 pb-4">
                        <Button variant="ghost" className="w-full" onClick={handleNewRequest}>
                          Try again
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon="🔎"
                      title={`Researching ${need?.locationText ?? "your area"}`}
                      body="Searching, then chasing down whatever the first pass left unanswered."
                    />
                  )}
                </Panel>
              )}
              {research.phase !== "error" && (
                <Button variant="ghost" size="sm" onClick={handleNewRequest}>
                  ← Start over
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right rail: the research trail */}
      {(running || research.findings.length > 0) && !myRequest && (
        <div className="absolute inset-y-0 right-0 hidden w-full max-w-[440px] flex-col p-3 lg:flex">
          <div className="flex min-h-0 flex-1">
            <ResearchFeed log={research.log} findings={research.findings} running={running} />
          </div>
        </div>
      )}

      {/* Idle-state legend so an empty map still explains itself */}
      {research.phase === "idle" && !myRequest && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 lg:block">
          <div className="rounded-full border border-white/10 bg-ink-900/85 px-4 py-2 text-[12.5px] text-mist-400 backdrop-blur-xl">
            🔴 needs help · 🍲 food resource · 🙋 volunteer · 🤖 simulated · ✅ delivered
          </div>
        </div>
      )}
    </div>
  );
}
