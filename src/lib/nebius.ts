// ─────────────────────────────────────────────────────────────
// Track 2 — Nebius Token Factory.
//
// One narrow job: given a person's situation and the resources our
// research turned up, decide which one they should actually go to and
// say why. Not a chatbot - a ranker with a measurable answer.
// ─────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { HelpNeed, RankMeta, RankedResource, Resource } from "./types";
import { describeHours, formatMinutes, mentionsDiet, parseClosingMinutes } from "./gaps";

// Chosen on measured latency, not accuracy: on our 20-scenario set this,
// Llama-3.3-70B and Qwen3-30B all scored 18/20, but p95 latency was
// 2.3s / 38.2s / 5.1s respectively. See /eval.
export const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

export function nebiusConfigured(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY?.trim());
}

export function nebiusModel(): string {
  return process.env.NEBIUS_MODEL?.trim() || DEFAULT_MODEL;
}

/** Token Factory base URL, without a trailing slash so paths concatenate. */
export function nebiusBase(): string {
  return (process.env.NEBIUS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function client(): OpenAI {
  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");
  return new OpenAI({
    apiKey,
    baseURL: nebiusBase(),
    timeout: 60_000,
    maxRetries: 1,
  });
}

const SYSTEM_PROMPT = `You match people in need of food assistance to the community resource that will actually work for them tonight.

You are given the person's situation and a list of candidate resources discovered by web research. Score every resource from 0 to 100 and return them ranked best first.

How to score, in priority order:
1. REACHABILITY. If the person has no car, anything beyond ~1.5 miles on foot is a serious problem and beyond ~3 miles is usually unreachable. If they have transit or a bike, extend that. A resource they cannot physically get to is never the best match, no matter how good it is otherwise.
2. TIMING. If they need food tonight, a resource that closes before they could arrive scores very low. Already closed = near zero.
3. DIETARY FIT. A hard requirement (vegetarian, vegan, halal, kosher, gluten-free) that a resource does not meet is disqualifying, not a minor deduction.
4. ACCESS BARRIERS. Appointment-only, referral-required, or ID-required programs are a poor fit for someone who needs food in the next few hours.
5. CONFIDENCE. Prefer resources whose details were verified. Treat unverified or contradictory information as risk and say so in the concerns.

Return STRICT JSON, no prose, no markdown fences:
{"rankings":[{"resourceId":"...","score":94,"reason":"one short sentence, plain language, addressed to the person","concerns":["short phrase"]}]}

Keep each "reason" under 20 words and each concern under 6 words. Output nothing after the closing brace.

Every candidate must appear exactly once. Scores must be distinct enough to express a real preference. The reason must name the concrete facts that decided it.`;

/** Compact, token-cheap view of a resource for the model. */
function forModel(r: Resource, need: HelpNeed) {
  const closes = parseClosingMinutes(r.hours);
  return {
    resourceId: r.id,
    name: r.name,
    distanceMiles: r.distanceMiles ?? null,
    hours: r.hours || "unknown",
    closesAt: closes === undefined ? "unknown" : describeHours(closes),
    walkIn: r.walkIn === undefined ? "unknown" : r.walkIn ? "yes" : "no (appointment required)",
    eligibility: r.eligibility || "unknown",
    foodTypes: r.foodTypes.length ? r.foodTypes : ["unknown"],
    meetsDietaryNeed:
      need.diet === "any" ? "n/a" : mentionsDiet(r, need.diet) ? "yes" : "not confirmed",
    researchConfidence: Math.round(r.confidence * 100) + "%",
    unresolvedConflicts: r.conflicts
      .filter((c) => c.status === "open")
      .map((c) => `${c.field}: "${c.claimA}" vs "${c.claimB}"`),
  };
}

function userPrompt(need: HelpNeed, resources: Resource[], now: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  // Same rule the heuristic applies: "tonight" means they turn up for
  // dinner, not this minute. Without this a 3pm closer ranks first at 2pm.
  const arrival = new Date(now);
  if (need.urgency === "tonight" && arrival.getHours() * 60 + arrival.getMinutes() < EVENING_MINUTES) {
    arrival.setHours(18, 0, 0, 0);
  }
  return JSON.stringify(
    {
      currentTime: fmt(now),
      assumedArrivalTime: fmt(arrival),
      note: "Judge every resource against assumedArrivalTime, not currentTime. Anything that closes before it is closed.",
      person: {
        need: need.need,
        location: need.locationText,
        dietaryRequirement: need.diet,
        transportation: need.transport,
        howSoon: need.urgency,
        notes: need.notes || "",
      },
      candidates: resources.map((r) => forModel(r, need)),
    },
    null,
    1,
  );
}

/**
 * Read the rankings out of a model reply.
 *
 * A reply that runs into the token ceiling is cut mid-array, so a plain
 * JSON.parse throws and the whole ranking is lost even though most of the
 * entries arrived intact. Rather than discard them, scan for every
 * balanced object and keep the ones that parse: a partial ranking plus
 * heuristic scores for the stragglers beats falling back entirely.
 */
export function extractRankings(text: string): Partial<RankedResource>[] {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { rankings?: Partial<RankedResource>[] };
    if (Array.isArray(parsed?.rankings)) return parsed.rankings;
  } catch {
    /* fall through to salvage */
  }

  const out: Partial<RankedResource>[] = [];
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push(i);
    else if (ch === "}") {
      const start = stack.pop();
      if (start === undefined) continue;
      const chunk = cleaned.slice(start, i + 1);
      if (!chunk.includes('"resourceId"')) continue;
      try {
        out.push(JSON.parse(chunk) as Partial<RankedResource>);
      } catch {
        /* not a ranking object we can use */
      }
    }
  }
  return out;
}

function costOf(promptTokens = 0, completionTokens = 0): number {
  const inPrice = Number(process.env.NEBIUS_PRICE_IN_PER_M ?? 0.13);
  const outPrice = Number(process.env.NEBIUS_PRICE_OUT_PER_M ?? 0.4);
  return (promptTokens / 1e6) * inPrice + (completionTokens / 1e6) * outPrice;
}

export interface RankResult {
  ranking: RankedResource[];
  meta: RankMeta;
}

/**
 * Rank resources with Nebius Token Factory.
 * Falls back to the transparent heuristic ranker if the key is missing
 * or the call fails, so the product never dead-ends on a bad network.
 */
export async function rankResources(
  need: HelpNeed,
  resources: Resource[],
  opts: { now?: Date; forceHeuristic?: boolean } = {},
): Promise<RankResult> {
  const now = opts.now ?? new Date();
  if (!resources.length) {
    return {
      ranking: [],
      meta: { model: "none", latencyMs: 0, source: "heuristic" },
    };
  }
  if (opts.forceHeuristic || !nebiusConfigured()) {
    return heuristicRank(need, resources, now);
  }

  const started = Date.now();
  try {
    const completion = await client().chat.completions.create({
      model: nebiusModel(),
      temperature: 0.2,
      max_tokens: 2400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(need, resources, now) },
      ],
    });

    const latencyMs = Date.now() - started;
    const choice = completion.choices[0];
    const raw = choice?.message?.content ?? "";

    if (choice?.finish_reason === "length") {
      console.warn(
        `[nebius] reply hit max_tokens (${completion.usage?.completion_tokens} completion tokens) — salvaging what parsed`,
      );
    }

    const byId = new Map(resources.map((r) => [r.id, r]));
    const seenIds = new Set<string>();

    const ranking: RankedResource[] = extractRankings(raw)
      .filter((r): r is Partial<RankedResource> & { resourceId: string } => {
        if (typeof r?.resourceId !== "string") return false;
        if (!byId.has(r.resourceId) || seenIds.has(r.resourceId)) return false;
        seenIds.add(r.resourceId);
        return true;
      })
      .map((r) => ({
        resourceId: r.resourceId,
        name: byId.get(r.resourceId)!.name,
        score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
        reason: String(r.reason ?? "").slice(0, 400),
        concerns: Array.isArray(r.concerns) ? r.concerns.slice(0, 4).map(String) : [],
      }));

    // Anything the model dropped — or that was lost to truncation — still
    // has to appear, scored by heuristic.
    for (const r of resources) {
      if (!seenIds.has(r.id)) {
        const h = heuristicScore(need, r, now);
        ranking.push({
          resourceId: r.id,
          name: r.name,
          score: h.score,
          reason: h.reason,
          concerns: h.concerns,
        });
      }
    }
    ranking.sort((a, b) => b.score - a.score);

    if (!ranking.length) throw new Error("Model returned no usable rankings");

    return {
      ranking,
      meta: {
        model: nebiusModel(),
        latencyMs,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        costUsd: costOf(
          completion.usage?.prompt_tokens,
          completion.usage?.completion_tokens,
        ),
        source: "nebius",
      },
    };
  } catch (err) {
    console.error("[nebius] ranking failed, falling back to heuristic:", err);
    const fallback = heuristicRank(need, resources, now);
    fallback.meta.latencyMs = Date.now() - started;
    return fallback;
  }
}

// ── Heuristic ranker ────────────────────────────────────────
//
// The production fallback, and the baseline the eval measures the model
// against. It reads the STRUCTURED fields only — distance, parsed closing
// time, dietary tags, walk-in flag, confidence. It deliberately does not
// try to interpret free-text eligibility rules or the person's own notes:
// that is exactly the ground rules can't cover, and where the model has
// to earn its place. Scoring is a weighted sum of sub-scores in 0..1, so
// scores spread across the range instead of all pinning at the ceiling.

const REACH_MILES: Record<HelpNeed["transport"], number> = {
  walking: 1.5,
  bike: 4,
  transit: 6,
  car: 12,
};

/** 6pm — when someone asking for "dinner tonight" would actually arrive. */
const EVENING_MINUTES = 18 * 60;

const WEIGHTS = {
  reach: 0.3,
  timing: 0.3,
  // A dietary requirement outweighs a shorter walk: arriving at a place
  // with nothing you can eat is a wasted trip, not a partial win.
  diet: 0.24,
  access: 0.1,
  confidence: 0.06,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function heuristicScore(
  need: HelpNeed,
  r: Resource,
  now: Date,
): { score: number; reason: string; concerns: string[] } {
  const concerns: string[] = [];
  const reasons: string[] = [];

  // ── Reachability: how far into their range is it?
  const reach = REACH_MILES[need.transport];
  const d = r.distanceMiles;
  let reachScore: number;
  if (d === undefined) {
    reachScore = 0.55;
    concerns.push("distance unknown");
  } else {
    const ratio = d / reach;
    reachScore = clamp01(1 - (ratio - 0.3) / 1.3);
    if (ratio <= 0.5) reasons.push(`${d} mi away`);
    else if (ratio <= 1) reasons.push(`${d} mi, reachable by ${TRANSPORT_VERB[need.transport]}`);
    else if (ratio <= 1.6) concerns.push(`${d} mi is a stretch ${TRANSPORT_QUALIFIER[need.transport]}`);
    else concerns.push(`${d} mi away — likely unreachable ${TRANSPORT_QUALIFIER[need.transport]}`);
  }

  // ── Timing: will the door still be open when they get there?
  //
  // "Tonight" means dinner time, not this instant. Scoring a 5pm pantry
  // against a 1pm clock would rank it top for someone asking about
  // dinner, so the comparison point moves to the evening.
  const closes = parseClosingMinutes(r.hours);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const arriveBy =
    need.urgency === "tonight" ? Math.max(nowMins, EVENING_MINUTES) : nowMins;
  let timingScore: number;
  if (need.urgency === "this-week") {
    timingScore = closes === undefined ? 0.75 : 0.95;
    if (closes !== undefined) reasons.push(`open ${describeHours(closes)}`);
  } else if (closes === undefined) {
    timingScore = 0.42;
    concerns.push("closing time unverified");
  } else if (closes <= arriveBy) {
    timingScore = 0.02;
    concerns.push(`already closed for today (${formatMinutes(closes)})`);
  } else {
    const minutesLeft = closes - arriveBy;
    // Walking there eats into the window, so short windows are risky.
    if (minutesLeft < 45) {
      timingScore = 0.3;
      concerns.push(`closes soon (${formatMinutes(closes)})`);
    } else if (minutesLeft < 90) {
      timingScore = 0.68;
      reasons.push(`open ${describeHours(closes)}, but not for long`);
    } else {
      timingScore = 1;
      reasons.push(`open ${describeHours(closes)}`);
    }
  }

  // ── Dietary fit: a hard requirement is close to disqualifying.
  let dietScore: number;
  if (need.diet === "any") {
    dietScore = 0.85;
  } else if (mentionsDiet(r, need.diet)) {
    dietScore = 1;
    reasons.push(`${need.diet} options`);
  } else {
    dietScore = 0.12;
    concerns.push(`${need.diet} not confirmed`);
  }

  // ── Access barriers
  let accessScore: number;
  if (r.walkIn === true) {
    accessScore = 1;
    reasons.push("walk-ins accepted");
  } else if (r.walkIn === false) {
    accessScore = 0.15;
    concerns.push("appointment required");
  } else {
    accessScore = 0.5;
  }

  // ── Unresolved conflicts.
  // A contradiction doesn't just lower confidence in general — it means
  // we do not actually know that specific field, so the sub-score it
  // feeds drops back to (or below) the "unknown" level.
  let confidenceScore = r.confidence;
  for (const c of r.conflicts) {
    if (c.status !== "open") continue;
    confidenceScore *= 0.55;
    concerns.push(`sources disagree on ${c.field}`);
    if (c.field === "walkIn") accessScore = Math.min(accessScore, 0.3);
    if (c.field === "hours") timingScore = Math.min(timingScore, 0.45);
  }

  const weighted =
    WEIGHTS.reach * reachScore +
    WEIGHTS.timing * timingScore +
    WEIGHTS.diet * dietScore +
    WEIGHTS.access * accessScore +
    WEIGHTS.confidence * clamp01(confidenceScore);

  // A sub-point nudge on distance so two otherwise identical options
  // still come back in a stable, sensible order rather than tying.
  const tiebreak = d === undefined ? 0 : -Math.min(0.4, d / 50);
  const score = Math.max(1, Math.min(99, Math.round(weighted * 100 + tiebreak)));

  const reason = reasons.length
    ? `${reasons.slice(0, 3).join(", ")}.`
    : "Too little verified detail to recommend this one.";
  return { score, reason: capitalize(reason), concerns: concerns.slice(0, 3) };
}

const TRANSPORT_VERB: Record<HelpNeed["transport"], string> = {
  walking: "foot",
  bike: "bike",
  transit: "bus",
  car: "car",
};

const TRANSPORT_QUALIFIER: Record<HelpNeed["transport"], string> = {
  walking: "on foot",
  bike: "by bike",
  transit: "by transit",
  car: "even by car",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function heuristicRank(
  need: HelpNeed,
  resources: Resource[],
  now: Date = new Date(),
): RankResult {
  const started = Date.now();
  const ranking = resources
    .map((r) => {
      const h = heuristicScore(need, r, now);
      return { resourceId: r.id, name: r.name, ...h };
    })
    .sort((a, b) => b.score - a.score);

  return {
    ranking,
    meta: {
      model: "helploop-heuristic-v1",
      latencyMs: Date.now() - started,
      source: "heuristic",
    },
  };
}
