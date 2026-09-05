"use client";

// ─────────────────────────────────────────────────────────────
// Track 3 — the realtime coordination layer.
//
// One context, two interchangeable backends. Convex when it is
// configured; the local cross-tab shim otherwise. Every screen in the
// app talks only to useRealtime() / useTracking(), so nothing above this
// file knows or cares which one is running.
//
// Bots and live tracking are Convex-only: the shim reports them as
// absent and the map falls back to its synthesised courier animation.
// ─────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { localStore } from "@/lib/local-store";
import type { Contact, HelpRequest, Offer, RequestStatus, Tracking, VolunteerPublic } from "@/lib/types";

// Untyped function references: they resolve at runtime against whatever
// `npx convex dev` deployed, so the app compiles before codegen has run.
const api = anyApi as unknown as {
  requests: Record<string, never>;
  volunteers: Record<string, never>;
  bots: Record<string, never>;
  tracking: Record<string, never>;
  offers: Record<string, never>;
};

export type RealtimeMode = "convex" | "local";

export interface RealtimeApi {
  mode: RealtimeMode;
  ready: boolean;
  requests: HelpRequest[];
  volunteers: VolunteerPublic[];
  /** Live food offers with meals still remaining. */
  offers: Offer[];
  createOffer(
    input: Omit<Offer, "_id" | "remaining" | "claims" | "createdAt" | "hasPhone"> & { phone?: string },
  ): Promise<string>;
  claimOffer(offerId: string, requestId: string): Promise<{ ok: boolean; reason?: string }>;
  closeOffer(offerId: string): Promise<void>;
  /** Simulated volunteers are a Convex feature; false on the local shim. */
  botsSupported: boolean;
  botCount: number;
  createRequest(
    input: Omit<HelpRequest, "_id" | "createdAt" | "updatedAt" | "status" | "timeline">,
  ): Promise<string>;
  accept(
    requestId: string,
    volunteerId: string,
    volunteerName: string,
    volunteerDocId?: string,
  ): Promise<{ ok: boolean; reason?: string }>;
  advance(requestId: string, status: RequestStatus, by?: string): Promise<void>;
  rate(requestId: string, stars: number): Promise<void>;
  /** Returns the volunteer's row id, needed for accept() and updateLocation(). */
  checkIn(
    name: string,
    position?: { lat: number; lng: number },
    phone?: string,
  ): Promise<string | undefined>;
  updateLocation(volunteerDocId: string, lat: number, lng: number, heading?: number): Promise<void>;
  seedBots(center: { lat: number; lng: number }, count?: number): Promise<void>;
  clearBots(): Promise<void>;
  clearAll(): Promise<void>;
}

const RealtimeContext = createContext<RealtimeApi | null>(null);

export function useRealtime(): RealtimeApi {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
// Created once per browser session, outside React, as Convex expects.
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  // The backend choice is fixed by an env var at build time, so the two
  // branches never swap during a session and hook order stays stable.
  if (convexClient) {
    return (
      <ConvexProvider client={convexClient}>
        <ConvexRealtime>{children}</ConvexRealtime>
      </ConvexProvider>
    );
  }
  return <LocalRealtime>{children}</LocalRealtime>;
}

/**
 * Privacy-rounded live position of the volunteer on a request, or null
 * when nobody is on it yet / tracking isn't available. Safe to call with
 * a null id. The branch below is decided by a module constant, so hook
 * order is stable across renders.
 */
export function useTracking(requestId: string | null | undefined): Tracking | null {
  if (convexClient) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexTracking(requestId);
  }
  return null;
}

/** The other party's phone number, once matched; null otherwise. */
export function useContact(requestId: string | null | undefined, asVolunteerId?: string): Contact | null {
  if (convexClient) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useConvexContact(requestId, asVolunteerId);
  }
  return null;
}

function useConvexContact(requestId: string | null | undefined, asVolunteerId?: string): Contact | null {
  const result = useQuery(
    api.requests.contact as never,
    (requestId ? { id: requestId, asVolunteerId } : "skip") as never,
  ) as Contact | null | undefined;
  return result ?? null;
}

function useConvexTracking(requestId: string | null | undefined): Tracking | null {
  const result = useQuery(
    api.tracking.forRequest as never,
    (requestId ? { requestId } : "skip") as never,
  ) as Tracking | null | undefined;
  return result ?? null;
}

// ── Convex backend ──────────────────────────────────────────

function ConvexRealtime({ children }: { children: ReactNode }) {
  const requests = useQuery(api.requests.list as never, {}) as HelpRequest[] | undefined;
  const volunteers = useQuery(api.volunteers.list as never, {}) as VolunteerPublic[] | undefined;
  const botCount = useQuery(api.bots.count as never, {}) as number | undefined;
  const offers = useQuery(api.offers.listActive as never, {}) as Offer[] | undefined;

  const createMutation = useMutation(api.requests.create as never);
  const acceptMutation = useMutation(api.requests.accept as never);
  const advanceMutation = useMutation(api.requests.advance as never);
  const rateMutation = useMutation(api.requests.rate as never);
  const clearMutation = useMutation(api.requests.clearAll as never);
  const checkInMutation = useMutation(api.volunteers.checkIn as never);
  const updateLocationMutation = useMutation(api.volunteers.updateLocation as never);
  const seedBotsMutation = useMutation(api.bots.seed as never);
  const clearBotsMutation = useMutation(api.bots.clear as never);
  const createOfferMutation = useMutation(api.offers.create as never);
  const claimOfferMutation = useMutation(api.offers.claim as never);
  const closeOfferMutation = useMutation(api.offers.close as never);

  const value = useMemo<RealtimeApi>(
    () => ({
      mode: "convex",
      ready: requests !== undefined,
      requests: requests ?? [],
      volunteers: volunteers ?? [],
      botsSupported: true,
      botCount: botCount ?? 0,
      offers: offers ?? [],
      async createOffer(input) {
        return String(await createOfferMutation(input as never));
      },
      async claimOffer(offerId, requestId) {
        const res = (await claimOfferMutation({ id: offerId, requestId } as never)) as
          | { ok: boolean; reason?: string }
          | undefined;
        return res ?? { ok: true };
      },
      async closeOffer(offerId) {
        await closeOfferMutation({ id: offerId } as never);
      },
      async createRequest(input) {
        const { resource, ...rest } = input;
        const result = await createMutation({
          ...rest,
          resource: {
            id: resource.id,
            name: resource.name,
            address: resource.address,
            lat: resource.lat,
            lng: resource.lng,
            hours: resource.hours,
            confidence: resource.confidence,
          },
        } as never);
        return String(result);
      },
      async accept(requestId, volunteerId, volunteerName, volunteerDocId) {
        const res = (await acceptMutation({
          id: requestId,
          volunteerId,
          volunteerName,
          volunteerDocId,
        } as never)) as { ok: boolean; reason?: string } | undefined;
        return res ?? { ok: true };
      },
      async advance(requestId, status, by) {
        await advanceMutation({ id: requestId, status, by } as never);
      },
      async rate(requestId, stars) {
        await rateMutation({ id: requestId, stars } as never);
      },
      async checkIn(name, position, phone) {
        const id = await checkInMutation({ name, lat: position?.lat, lng: position?.lng, phone } as never);
        return id ? String(id) : undefined;
      },
      async updateLocation(volunteerDocId, lat, lng, heading) {
        await updateLocationMutation({ id: volunteerDocId, lat, lng, heading } as never);
      },
      async seedBots(center, count) {
        await seedBotsMutation({ lat: center.lat, lng: center.lng, count } as never);
      },
      async clearBots() {
        await clearBotsMutation({} as never);
      },
      async clearAll() {
        await clearMutation({} as never);
      },
    }),
    [
      requests,
      volunteers,
      botCount,
      offers,
      createMutation,
      createOfferMutation,
      claimOfferMutation,
      closeOfferMutation,
      acceptMutation,
      advanceMutation,
      rateMutation,
      clearMutation,
      checkInMutation,
      updateLocationMutation,
      seedBotsMutation,
      clearBotsMutation,
    ],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

// ── Local backend ───────────────────────────────────────────

function LocalRealtime({ children }: { children: ReactNode }) {
  useEffect(() => {
    localStore.start();
  }, []);

  const snapshot = useSyncExternalStore(
    localStore.subscribe,
    localStore.getSnapshot,
    localStore.getServerSnapshot,
  );

  const createRequest = useCallback<RealtimeApi["createRequest"]>(
    async (input) => localStore.createRequest(input),
    [],
  );
  const accept = useCallback<RealtimeApi["accept"]>(
    async (requestId, volunteerId, volunteerName) =>
      localStore.accept(requestId, volunteerId, volunteerName),
    [],
  );
  const advance = useCallback<RealtimeApi["advance"]>(async (requestId, status, by) => {
    localStore.advance(requestId, status, by);
  }, []);
  const checkIn = useCallback<RealtimeApi["checkIn"]>(async (name) => localStore.checkIn(name), []);
  const noop = useCallback(async () => {}, []);
  const clearAll = useCallback<RealtimeApi["clearAll"]>(async () => {
    localStore.clearAll();
  }, []);

  const value = useMemo<RealtimeApi>(
    () => ({
      mode: "local",
      ready: true,
      requests: snapshot.requests,
      volunteers: snapshot.volunteers,
      botsSupported: false,
      botCount: 0,
      offers: [],
      createOffer: async () => {
        throw new Error("Offers need Convex");
      },
      claimOffer: async () => ({ ok: true }),
      closeOffer: noop,
      createRequest,
      accept,
      advance,
      rate: noop,
      checkIn,
      updateLocation: noop,
      seedBots: noop,
      clearBots: noop,
      clearAll,
    }),
    [snapshot, createRequest, accept, advance, checkIn, noop, clearAll],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
