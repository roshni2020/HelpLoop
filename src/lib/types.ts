// ─────────────────────────────────────────────────────────────
// HelpLoop domain types — shared by the research pipeline,
// the ranking model, the realtime layer and the map.
// ─────────────────────────────────────────────────────────────

export type Diet =
  | "any"
  | "vegetarian"
  | "vegan"
  | "halal"
  | "kosher"
  | "gluten-free";

export type Transport = "walking" | "transit" | "bike" | "car";

export type Urgency = "tonight" | "today" | "this-week";

/** What the person needing help told us. */
export interface HelpNeed {
  need: string;
  locationText: string;
  lat: number;
  lng: number;
  diet: Diet;
  transport: Transport;
  urgency: Urgency;
  notes?: string;
}

/** One community resource discovered (and verified) by Linkup. */
export interface Resource {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  distanceMiles?: number;
  hours?: string;
  /** Parsed closing time in 24h minutes-from-midnight, when known. */
  closesAtMinutes?: number;
  eligibility?: string;
  foodTypes: string[];
  walkIn?: boolean;
  phone?: string;
  website?: string;
  /** URLs Linkup cited for this resource. */
  sources: string[];
  /** 0..1 — how much of the record is verified vs. assumed. */
  confidence: number;
  /** Fields we know we don't know yet. */
  gaps: string[];
  /** Unresolved contradictions between sources. */
  conflicts: ResourceConflict[];
  /** True when a follow-up Linkup query filled a gap or settled a conflict. */
  verified: boolean;
}

export interface ResourceConflict {
  field: string;
  claimA: string;
  claimB: string;
  resolution?: string;
  resolvedBy?: string;
  status: "open" | "resolved";
}

/**
 * A single stored research finding. This is the Linkup track's core
 * artifact: we don't just search, we keep what we learned, notice what
 * is missing or contradictory, and use that to decide what to ask next.
 */
export interface ResearchFinding {
  id: string;
  /** "seed" | "gap" | "conflict" — why this query was run. */
  kind: "seed" | "gap" | "conflict";
  query: string;
  finding: string;
  source: string;
  sources: string[];
  certainty: number;
  needsFollowUp: boolean;
  /** id of the finding that triggered this one. */
  parentId?: string;
  resourceId?: string;
  createdAt: number;
}

/** One line in the live research console the user watches. */
export type ResearchEvent =
  | { type: "status"; message: string; icon?: string }
  | { type: "geocoded"; lat: number; lng: number; label: string }
  | { type: "finding"; finding: ResearchFinding }
  | { type: "resource"; resource: Resource }
  | { type: "gap"; resourceId: string; field: string; query: string }
  | { type: "conflict"; resourceId: string; conflict: ResourceConflict }
  | { type: "resolved"; resourceId: string; field: string; value: string }
  | { type: "ranking"; ranking: RankedResource[]; meta: RankMeta }
  | { type: "done"; resources: Resource[]; findings: ResearchFinding[] }
  | { type: "error"; message: string };

export interface RankedResource {
  resourceId: string;
  name: string;
  score: number;
  reason: string;
  concerns?: string[];
}

export interface RankMeta {
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  source: "nebius" | "heuristic";
}

// ── Realtime (Convex) shapes ────────────────────────────────

export type RequestStatus =
  | "waiting"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export const STATUS_FLOW: RequestStatus[] = [
  "waiting",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
];

export interface HelpRequest {
  _id: string;
  createdAt: number;
  updatedAt: number;
  requesterName: string;
  need: string;
  locationText: string;
  lat: number;
  lng: number;
  diet: Diet;
  transport: Transport;
  urgency: Urgency;
  status: RequestStatus;
  volunteerId?: string;
  volunteerName?: string;
  /** The volunteer's row in the `volunteers` table, when known. */
  volunteerDocId?: string;
  matchScore?: number;
  matchReason?: string;
  resource: {
    id: string;
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    hours?: string;
    confidence: number;
  };
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  status: RequestStatus;
  at: number;
  by?: string;
  note?: string;
}

/**
 * A volunteer as OTHER users are allowed to see them. `lat`/`lng` here are
 * already rounded to ~440 m by the server; the exact position is never
 * sent to a client that isn't the volunteer themself.
 */
export interface VolunteerPublic {
  _id: string;
  name: string;
  available: boolean;
  isBot: boolean;
  lat?: number;
  lng?: number;
  /** Direction of travel, degrees from north — lets the avatar face the way it's going. */
  heading?: number;
  activeRequestId?: string;
  completed: number;
  lastSeen: number;
  locationUpdatedAt?: number;
}

/** Live position of the volunteer on a request, privacy-rounded. */
export interface Tracking {
  approxLat: number;
  approxLng: number;
  phase: RequestStatus;
  nextStop: "pantry" | "you";
  metersToNextStop: number;
  etaMinutes: number;
  isBot: boolean;
  stale: boolean;
  updatedAt: number;
  volunteerName: string;
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  waiting: "Waiting for volunteer",
  assigned: "Volunteer assigned",
  picked_up: "Food picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const STATUS_EMOJI: Record<RequestStatus, string> = {
  waiting: "🆘",
  assigned: "🙋",
  picked_up: "🍱",
  on_the_way: "🚲",
  delivered: "✅",
  cancelled: "⚪",
};
