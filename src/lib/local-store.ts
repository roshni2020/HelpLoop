"use client";

// ─────────────────────────────────────────────────────────────
// Local realtime shim.
//
// Convex is the real coordination layer. This is the stand-in used when
// NEXT_PUBLIC_CONVEX_URL is not set: localStorage for durability plus a
// BroadcastChannel for push, which gives genuine live sync across two
// browser windows on one machine — enough to rehearse the demo, and it
// disappears the moment Convex is configured.
// ─────────────────────────────────────────────────────────────

import type { HelpRequest, RequestStatus, VolunteerPublic } from "./types";

const KEY = "helploop.state.v1";
const CHANNEL = "helploop.realtime.v1";

/** Same shape the Convex backend serves, so screens don't care which is on. */
export type LocalVolunteer = VolunteerPublic;

interface State {
  requests: HelpRequest[];
  volunteers: LocalVolunteer[];
}

const EMPTY: State = { requests: [], volunteers: [] };

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

class LocalStore {
  private state: State = EMPTY;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.state = this.read();
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = () => {
        this.state = this.read();
        this.emit();
      };
    } catch {
      this.channel = null;
    }
    // Fallback for browsers without BroadcastChannel, and for good measure.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        this.state = this.read();
        this.emit();
      }
    });

    // start() runs from an effect, after the first render has already
    // taken the empty snapshot — so hand React the loaded state.
    this.emit();
  }

  private read(): State {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw) as State;
      return {
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        volunteers: Array.isArray(parsed.volunteers) ? parsed.volunteers : [],
      };
    } catch {
      return EMPTY;
    }
  }

  private write(next: State) {
    this.state = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode — in-memory only, still works in this tab */
    }
    this.channel?.postMessage("update");
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): State => this.state;
  getServerSnapshot = (): State => EMPTY;

  createRequest(
    input: Omit<
      HelpRequest,
      "_id" | "createdAt" | "updatedAt" | "status" | "timeline"
    >,
  ): string {
    const now = Date.now();
    const request: HelpRequest = {
      ...input,
      _id: id("req"),
      createdAt: now,
      updatedAt: now,
      status: "waiting",
      timeline: [{ status: "waiting", at: now, by: input.requesterName }],
    };
    this.write({
      ...this.state,
      requests: [request, ...this.state.requests].slice(0, 100),
    });
    return request._id;
  }

  accept(
    requestId: string,
    volunteerId: string,
    volunteerName: string,
  ): { ok: boolean; reason?: string } {
    // Re-read first: another window may have taken it a moment ago.
    this.state = this.read();
    const request = this.state.requests.find((r) => r._id === requestId);
    if (!request) return { ok: false, reason: "not-found" };
    if (request.status !== "waiting") return { ok: false, reason: "already-taken" };

    const now = Date.now();
    this.patch(requestId, (r) => ({
      ...r,
      status: "assigned" as RequestStatus,
      volunteerId,
      volunteerName,
      updatedAt: now,
      timeline: [...r.timeline, { status: "assigned" as RequestStatus, at: now, by: volunteerName }],
    }));
    return { ok: true };
  }

  advance(requestId: string, status: RequestStatus, by?: string) {
    const now = Date.now();
    this.patch(requestId, (r) => ({
      ...r,
      status,
      updatedAt: now,
      timeline: [...r.timeline, { status, at: now, by }],
    }));
    if (status === "delivered") {
      const request = this.state.requests.find((r) => r._id === requestId);
      if (request?.volunteerName) {
        this.write({
          ...this.state,
          volunteers: this.state.volunteers.map((v) =>
            v.name === request.volunteerName ? { ...v, completed: v.completed + 1 } : v,
          ),
        });
      }
    }
  }

  private patch(requestId: string, fn: (r: HelpRequest) => HelpRequest) {
    this.state = this.read();
    this.write({
      ...this.state,
      requests: this.state.requests.map((r) => (r._id === requestId ? fn(r) : r)),
    });
  }

  checkIn(name: string): string {
    this.state = this.read();
    const existing = this.state.volunteers.find((v) => v.name === name);
    if (existing) {
      this.write({
        ...this.state,
        volunteers: this.state.volunteers.map((v) =>
          v.name === name ? { ...v, available: true, lastSeen: Date.now() } : v,
        ),
      });
      return existing._id;
    }
    const volunteer: LocalVolunteer = {
      _id: id("vol"),
      name,
      available: true,
      isBot: false,
      lastSeen: Date.now(),
      completed: 0,
    };
    this.write({ ...this.state, volunteers: [volunteer, ...this.state.volunteers] });
    return volunteer._id;
  }

  clearAll() {
    this.write({ requests: [], volunteers: this.state.volunteers });
  }
}

export const localStore = new LocalStore();
