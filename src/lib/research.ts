// ─────────────────────────────────────────────────────────────
// The research pipeline.
//
//   seed search  ->  store findings  ->  detect gaps & conflicts
//        ^                                        |
//        |                                        v
//        +--------  follow-up searches  <---------+
//                            |
//                            v
//                     Nebius ranking
//
// Implemented as an async generator so the UI can watch it think.
// ─────────────────────────────────────────────────────────────

import { distanceMiles, geocode, scatterAround } from "./geo";
import {
  detectGaps,
  findConflict,
  describeHours,
  parseClosingMinutes,
  parseWalkIn,
  scoreConfidence,
} from "./gaps";
import {
  RESOURCE_SEARCH_SCHEMA,
  linkupConfigured,
  linkupSourcedAnswer,
  linkupStructured,
  type RawResource,
} from "./linkup";
import { DEMO_NOTICE, demoSeed, type DemoResource } from "./demo-data";
import { rankResources } from "./nebius";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type {
  HelpNeed,
  ResearchEvent,
  ResearchFinding,
  Resource,
} from "./types";

/**
 * Live food offers near the person, shaped as resources. Provider-posted,
 * so they arrive already verified: hours, walk-in and location are facts
 * the provider typed, not things we had to research.
 */
async function liveOffers(need: HelpNeed, origin: { lat: number; lng: number }): Promise<Resource[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url || need.category !== "food") return [];
  try {
    const client = new ConvexHttpClient(url);
    const api = anyApi as unknown as { offers: { listActive: never } };
    const rows = (await client.query(api.offers.listActive, {})) as Array<{
      _id: string; providerName: string; foodType: string; remaining: number; quantity: number;
      locationText: string; lat: number; lng: number; availableUntil: number; dietary: string[];
      instructions?: string;
    }>;
    return rows
      .map((o) => ({ o, d: distanceMiles(origin, o) }))
      .filter(({ d }) => d <= 10)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ o, d }) => {
        const until = new Date(o.availableUntil);
        const closes = until.getHours() * 60 + until.getMinutes();
        return {
          id: `offer-${o._id}`,
          name: `${o.providerName} (${o.remaining} ${o.foodType} left)`,
          address: o.locationText,
          lat: o.lat,
          lng: o.lng,
          distanceMiles: d,
          hours: `Today until ${formatMinutesLocal(closes)}`,
          closesAtMinutes: closes,
          eligibility: "Open to anyone - food offered by a local provider" + (o.instructions ? `. ${o.instructions}` : ""),
          foodTypes: [o.foodType.toLowerCase(), ...o.dietary],
          walkIn: true,
          sources: ["provider-posted"],
          confidence: 1,
          gaps: [],
          conflicts: [],
          verified: true,
        } satisfies Resource;
      });
  } catch (err) {
    console.warn("[research] could not load live offers:", err);
    return [];
  }
}

function formatMinutesLocal(mins: number): string {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "PM" : "AM"}`;
}

/** How many follow-up searches one request is allowed to spend. */
const FOLLOWUP_BUDGET = 8;
const CONFLICT_BUDGET = 2;
const MAX_RESOURCES = 5;

let findingCounter = 0;
function newFinding(f: Omit<ResearchFinding, "id" | "createdAt">): ResearchFinding {
  return { ...f, id: `f${++findingCounter}_${Date.now().toString(36)}`, createdAt: Date.now() };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** The seed query. Deliberately specific — vague queries return blog posts. */
export function seedQuery(need: HelpNeed): string {
  const when =
    need.urgency === "tonight" ? "open tonight" : need.urgency === "today" ? "open today" : "open this week";
  if (need.category === "shelter") {
    return `emergency shelter and places to sleep tonight near ${need.locationText}${SHELTER_WHO[need.who ?? ""] ?? ""}: homeless shelters, warming centers, safe parking and transitional housing intake ${when}. Prefer official sources: the local 211 directory, county homelessness services and city shelter lists. Include name, street address, intake or check-in hours, who is eligible (gender, families, age, sobriety), whether beds are available without a referral, and a phone number.`;
  }
  if (need.category === "clothing") {
    return `free clothing near ${need.locationText}: clothing closets, free stores, church and nonprofit clothing banks ${when}. Prefer official sources: the local 211 directory and nonprofit listings. Include name, street address, hours, what they provide (coats, shoes, work clothes, children's sizes), eligibility, and whether walk-ins are accepted.`;
  }
  const diet = need.diet === "any" ? "" : `${need.diet} `;
  const who: Record<string, string> = {
    student: " including campus and student food pantries,",
    parent: " including family and children's meal programs,",
    senior: " including senior meal and congregate dining programs,",
    veteran: " including veteran food and meal services,",
    unhoused: " that require no address or ID,",
  };
  // Prefer the sources cities actually point residents to — food-bank
  // pantry locators (e.g. FoodNow.net), 211 directories, city service
  // lists — over aggregator blog posts, which are where stale hours live.
  return `free ${diet}food assistance near ${need.locationText}: food pantries, community kitchens and free meal programs${who[need.who ?? ""] ?? ""} ${when}. Prefer official sources: the regional food bank's pantry directory, the local 211 resource directory, and city government food-assistance pages. Include name, street address, hours of operation, eligibility requirements and whether walk-ins are accepted.`;
}

function toResource(raw: RawResource, index: number): Resource {
  const walkIn = parseWalkIn(raw.walkIn);
  return {
    id: `${slug(raw.name) || "resource"}-${index}`,
    name: raw.name.trim(),
    address: (raw.address ?? "").trim(),
    hours: (raw.hours ?? "").trim(),
    closesAtMinutes: parseClosingMinutes(raw.hours),
    eligibility: (raw.eligibility ?? "").trim(),
    availability: (raw.availability ?? "").trim() || undefined,
    foodTypes: (raw.foodTypes ?? []).map((f) => String(f).toLowerCase().trim()).filter(Boolean),
    walkIn,
    phone: raw.phone?.trim(),
    website: raw.website?.trim(),
    sources: raw.website?.trim() ? [raw.website.trim()] : [],
    confidence: 0.2,
    gaps: [],
    conflicts: [],
    verified: false,
  };
}

// ── Backends ────────────────────────────────────────────────
// Same pipeline, two sources of truth: the live Linkup API, or the
// scripted demo set when no key is present.

interface Backend {
  live: boolean;
  seed(need: HelpNeed): Promise<{ raws: RawResource[]; sources: string[] }>;
  followUp(
    resource: Resource,
    field: string,
    query: string,
  ): Promise<{ answer: string; sources: string[] }>;
}

function linkupBackend(): Backend {
  return {
    live: true,
    async seed(need) {
      const out = await linkupStructured<{ resources?: RawResource[] }>(
        seedQuery(need),
        RESOURCE_SEARCH_SCHEMA,
      );
      const raws = (out.resources ?? []).filter((r) => r?.name?.trim());
      return { raws, sources: [] };
    },
    async followUp(_resource, _field, query) {
      const res = await linkupSourcedAnswer(query);
      return {
        answer: res.answer ?? "",
        sources: (res.sources ?? []).map((s) => s.url).filter(Boolean).slice(0, 4),
      };
    },
  };
}

function demoBackend(): Backend {
  let script: DemoResource[] = [];
  return {
    live: false,
    async seed(need) {
      script = demoSeed(need);
      await pause(700);
      return { raws: script.map(({ followUps, offsetMiles, bearing, ...r }) => r), sources: [] };
    },
    async followUp(resource, field) {
      await pause(450);
      const entry = script.find((s) => slug(s.name) === resource.id.replace(/-\d+$/, ""));
      const hit = entry?.followUps[field];
      if (hit) return hit;
      return {
        answer: `No additional public information was found about ${field} for ${resource.name}.`,
        sources: [],
      };
    },
  };
}

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Pipeline ────────────────────────────────────────────────

export async function* runResearch(
  need: HelpNeed,
): AsyncGenerator<ResearchEvent> {
  const backend = linkupConfigured() ? linkupBackend() : demoBackend();
  const findings: ResearchFinding[] = [];

  const record = (f: Omit<ResearchFinding, "id" | "createdAt">) => {
    const finding = newFinding(f);
    findings.push(finding);
    return finding;
  };

  try {
    if (!backend.live) {
      yield { type: "status", message: DEMO_NOTICE, icon: "🧪" };
    }

    // ── Step 1: where are they ────────────────────────────
    yield { type: "status", message: `Locating ${need.locationText}`, icon: "📍" };
    const origin = await geocode(need.locationText);
    yield {
      type: "geocoded",
      lat: origin.lat,
      lng: origin.lng,
      label: origin.label,
    };

    // ── Step 2: seed search ───────────────────────────────
    const query = seedQuery(need);
    yield {
      type: "status",
      message: backend.live
        ? "Searching the open web for nearby food resources"
        : "Loading the demo resource set",
      icon: "🔎",
    };

    const { raws } = await backend.seed(need);
    if (!raws.length) {
      yield {
        type: "error",
        message: `No community food resources were found near ${need.locationText}. Try a nearby city or a broader area.`,
      };
      return;
    }

    const seedFinding = record({
      kind: "seed",
      query,
      finding: `Found ${raws.length} candidate resources: ${raws
        .map((r) => r.name)
        .join(", ")}.`,
      source: backend.live ? "Linkup deep search" : "HelpLoop demo set",
      sources: [],
      certainty: 0.6,
      needsFollowUp: true,
    });
    yield { type: "finding", finding: seedFinding };

    // ── Step 3: shape and place the candidates ────────────
    const resources: Resource[] = [];

    // Live offers first: someone nearby has food right now.
    for (const offer of await liveOffers(need, origin)) {
      resources.push(offer);
      yield { type: "status", message: `Live offer nearby: ${offer.name}`, icon: "🍱" };
      yield { type: "resource", resource: { ...offer } };
    }
    const demoScript = backend.live ? [] : demoSeed(need);

    for (const [i, raw] of raws.slice(0, MAX_RESOURCES).entries()) {
      const r = toResource(raw, i);

      const demo = demoScript.find((d) => d.name === raw.name);
      if (demo) {
        const angle = (demo.bearing * Math.PI) / 180;
        r.lat = origin.lat + (demo.offsetMiles / 69) * Math.cos(angle);
        r.lng =
          origin.lng +
          (demo.offsetMiles / (69 * Math.cos((origin.lat * Math.PI) / 180))) *
            Math.sin(angle);
      } else if (r.address) {
        const geo = await geocode(`${r.address}, ${need.locationText}`);
        // A city-table fallback lands exactly on the requester's own pin and
        // reads as "0 mi away" — a lie. Scatter it instead and let the
        // missing precision show up as lower confidence, not false proximity.
        const unusable = geo.fallback || distanceMiles(origin, geo) > 25;
        const point = unusable ? scatterAround(origin, r.id) : geo;
        r.lat = point.lat;
        r.lng = point.lng;
        if (unusable) r.gaps.push("address");
      } else {
        const point = scatterAround(origin, r.id);
        r.lat = point.lat;
        r.lng = point.lng;
      }

      r.distanceMiles = distanceMiles(origin, { lat: r.lat!, lng: r.lng! });
      r.gaps = detectGaps(r, need).map((g) => g.field);
      r.confidence = scoreConfidence(r, need);
      resources.push(r);
      yield { type: "resource", resource: { ...r } };
    }

    // ── Step 4: fill the gaps ─────────────────────────────
    // Findings drive the next query: we ask about what is missing,
    // most decision-relevant field first, across all candidates.
    let budget = FOLLOWUP_BUDGET;
    const queue: { resource: Resource; field: string; label: string; query: string }[] = [];

    for (const r of resources) {
      for (const gap of detectGaps(r, need)) {
        queue.push({
          resource: r,
          field: gap.field,
          label: gap.label,
          query: gap.query(r, need),
        });
      }
    }
    // Highest-value gaps across the whole candidate set go first.
    queue.sort((a, b) => rankOfField(a.field) - rankOfField(b.field));

    const conflicts: { resource: Resource; field: string }[] = [];

    for (const item of queue) {
      if (budget <= 0) break;
      budget--;

      yield {
        type: "gap",
        resourceId: item.resource.id,
        field: item.field,
        query: item.query,
      };
      yield {
        type: "status",
        message: `${item.label} for ${item.resource.name}`,
        icon: "🔎",
      };

      const { answer, sources } = await backend.followUp(
        item.resource,
        item.field,
        item.query,
      );
      if (!answer) continue;

      // "The provided information does not specify…" is a search that came
      // back empty, not a fact. Store it as a low-certainty finding, leave
      // the gap open, and say so — never present it as confirmed.
      if (NO_INFO_RE.test(answer)) {
        const empty = record({
          kind: "gap",
          query: item.query,
          finding: answer,
          source: sources[0] ?? (backend.live ? "Linkup" : "HelpLoop demo set"),
          sources,
          certainty: 0.15,
          needsFollowUp: true,
          parentId: seedFinding.id,
          resourceId: item.resource.id,
        });
        yield { type: "finding", finding: empty };
        yield {
          type: "status",
          message: `No public information found on ${humanFieldName(item.field)} for ${item.resource.name} — left as unverified`,
          icon: "❔",
        };
        continue;
      }

      // Does the new answer contradict what we already had?
      const existing = existingClaim(item.resource, item.field);
      const conflict = findConflict(item.field, existing, answer);

      const finding = record({
        kind: "gap",
        query: item.query,
        finding: answer,
        source: sources[0] ?? (backend.live ? "Linkup" : "HelpLoop demo set"),
        sources,
        certainty: conflict ? 0.4 : 0.85,
        needsFollowUp: Boolean(conflict),
        parentId: seedFinding.id,
        resourceId: item.resource.id,
      });
      yield { type: "finding", finding };

      applyAnswer(item.resource, item.field, answer, sources);

      if (conflict) {
        item.resource.conflicts.push(conflict);
        conflicts.push({ resource: item.resource, field: item.field });
        yield { type: "conflict", resourceId: item.resource.id, conflict };
      } else {
        const value = displayValue(item.resource, item.field);
        if (value) {
          yield {
            type: "resolved",
            resourceId: item.resource.id,
            field: item.field,
            value,
          };
        }
      }

      item.resource.verified = true;
      item.resource.gaps = detectGaps(item.resource, need).map((g) => g.field);
      item.resource.confidence = scoreConfidence(item.resource, need);
      yield { type: "resource", resource: { ...item.resource } };
    }

    // ── Step 5: settle the conflicts ──────────────────────
    let conflictBudget = CONFLICT_BUDGET;
    for (const { resource, field } of conflicts) {
      if (conflictBudget <= 0) break;
      conflictBudget--;

      const open = resource.conflicts.find(
        (c) => c.field === field && c.status === "open",
      );
      if (!open) continue;

      const verifyQuery = `Verify directly from ${resource.name}: ${
        field === "walkIn"
          ? "are walk-ins accepted for the free meal, or is an appointment required?"
          : "what time does it actually close today?"
      } Sources disagree: one says "${open.claimA}", another says "${open.claimB}".`;

      yield {
        type: "status",
        message: `Conflicting information about ${resource.name} - verifying`,
        icon: "⚠️",
      };

      const { answer, sources } = await backend.followUp(
        resource,
        `${field}:resolve`,
        verifyQuery,
      );

      const finding = record({
        kind: "conflict",
        query: verifyQuery,
        finding: answer,
        source: sources[0] ?? (backend.live ? "Linkup" : "HelpLoop demo set"),
        sources,
        certainty: 0.9,
        needsFollowUp: false,
        resourceId: resource.id,
      });
      yield { type: "finding", finding };

      const settled = applyAnswer(resource, field, answer, sources);
      if (settled) {
        open.status = "resolved";
        open.resolution = truncate(answer, 200);
        open.resolvedBy = sources[0] ?? "follow-up search";
        yield { type: "conflict", resourceId: resource.id, conflict: { ...open } };
        yield {
          type: "resolved",
          resourceId: resource.id,
          field,
          value: displayValue(resource, field) ?? truncate(answer, 80),
        };
      }

      resource.confidence = scoreConfidence(resource, need);
      yield { type: "resource", resource: { ...resource } };
    }

    // ── Step 6: rank with Nebius ──────────────────────────
    yield {
      type: "status",
      message: "Ranking options against your situation",
      icon: "🧠",
    };
    const { ranking, meta } = await rankResources(need, resources);
    yield { type: "ranking", ranking, meta };

    yield { type: "done", resources, findings };
  } catch (err) {
    console.error("[research] pipeline failed:", err);
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "Research failed",
    };
  }
}

const SHELTER_WHO: Record<string, string> = {
  parent: " for families with children",
  senior: " for older adults",
  veteran: " for veterans",
};

/** Phrasings a search engine uses to say it found nothing. */
export const NO_INFO_RE =
  /\b(?:does not|doesn't|do not|don't)\s+(?:contain|specify|provide|mention|include|state|list|indicate)|\bno\s+(?:\w+\s+){0,2}(?:information|details?|mention|data)\b|\bnot\s+(?:specified|stated|mentioned|available|found|provided|listed|publicly)|\b(?:could|can)\s*not\s+(?:find|locate|determine|verify|confirm)|\bunable to\s+(?:find|determine|verify|confirm)|\bthere is no\s+(?:information|mention|detail)|\bno results?\b/i;

const FIELD_NAMES: Record<string, string> = {
  hours: "opening hours",
  walkIn: "walk-in policy",
  diet: "dietary options",
  eligibility: "eligibility",
  address: "street address",
};
function humanFieldName(field: string): string {
  return FIELD_NAMES[field.split(":")[0]] ?? field;
}

const FIELD_RANK: Record<string, number> = {
  hours: 0,
  address: 1,
  walkIn: 2,
  diet: 3,
  eligibility: 4,
};
function rankOfField(field: string): number {
  return FIELD_RANK[field] ?? 9;
}

function existingClaim(r: Resource, field: string): string | undefined {
  switch (field) {
    case "hours":
      return r.hours;
    case "walkIn":
      return r.walkIn === undefined ? undefined : r.walkIn ? "walk-ins accepted" : "appointment required";
    case "eligibility":
      return r.eligibility;
    default:
      return undefined;
  }
}

/** Fold a follow-up answer back into the resource. Returns true if it changed. */
function applyAnswer(
  r: Resource,
  field: string,
  answer: string,
  sources: string[],
): boolean {
  for (const s of sources) if (!r.sources.includes(s)) r.sources.push(s);
  const base = field.split(":")[0];
  let changed = false;

  if (base === "hours") {
    const mins = parseClosingMinutes(answer);
    if (mins !== undefined) {
      r.closesAtMinutes = mins;
      r.hours = truncate(answer, 160);
      changed = true;
    }
  } else if (base === "walkIn") {
    const w = parseWalkIn(answer);
    if (w !== undefined) {
      r.walkIn = w;
      changed = true;
    }
  } else if (base === "eligibility") {
    if (answer.length > 5) {
      r.eligibility = truncate(answer, 200);
      changed = true;
    }
  } else if (base === "diet") {
    const lower = answer.toLowerCase();
    for (const diet of ["vegetarian", "vegan", "halal", "kosher", "gluten-free"]) {
      const denied = new RegExp(
        `(no|not|cannot|can't|does not|doesn't|isn't)[^.]{0,40}${diet}`,
        "i",
      ).test(answer);
      if (lower.includes(diet) && !denied && !r.foodTypes.includes(diet)) {
        r.foodTypes.push(diet);
        changed = true;
      }
    }
  } else if (base === "availability") {
    if (answer.length > 5) {
      r.availability = truncate(answer, 160);
      changed = true;
    }
  } else if (base === "address") {
    const m = /\d+\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}/.exec(answer);
    if (m && !r.address) {
      r.address = m[0];
      changed = true;
    }
  }
  return changed;
}

function displayValue(r: Resource, field: string): string | undefined {
  const base = field.split(":")[0];
  switch (base) {
    case "hours":
      return r.closesAtMinutes !== undefined
        ? `Open ${describeHours(r.closesAtMinutes)}`
        : undefined;
    case "walkIn":
      return r.walkIn === undefined
        ? undefined
        : r.walkIn
          ? "Walk-ins accepted"
          : "Appointment required";
    case "eligibility":
      return r.eligibility ? truncate(r.eligibility, 90) : undefined;
    case "diet":
      return r.foodTypes.length ? r.foodTypes.join(", ") : undefined;
    case "address":
      return r.address || undefined;
    case "availability":
      return r.availability ? truncate(r.availability, 90) : undefined;
    default:
      return undefined;
  }
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}
