// ─────────────────────────────────────────────────────────────
// Gap + conflict analysis.
//
// This is the part of the Linkup track that makes it research rather
// than search: every stored finding is inspected for what it does NOT
// say, and for where it disagrees with another source. Each of those
// becomes the next query.
// ─────────────────────────────────────────────────────────────

import type { HelpNeed, Resource, ResourceConflict } from "./types";

export interface Gap {
  field: string;
  /** Shown in the live console, e.g. "Checking closing time…" */
  label: string;
  /** The follow-up question we send back to Linkup. */
  query: (r: Resource, need: HelpNeed) => string;
  /** Gaps are filled highest-weight first when we have a query budget. */
  weight: number;
}

const DIET_WORDS: Record<string, string[]> = {
  vegetarian: ["vegetarian", "veggie", "meatless", "plant-based", "vegan"],
  vegan: ["vegan", "plant-based"],
  halal: ["halal"],
  kosher: ["kosher"],
  "gluten-free": ["gluten-free", "gluten free", "celiac"],
};

export const GAP_TYPES: Gap[] = [
  {
    field: "hours",
    label: "Checking opening hours",
    weight: 100,
    query: (r) =>
      `${r.name} ${cityOf(r)} food distribution hours today - what time does it open and close?`,
  },
  {
    field: "walkIn",
    label: "Checking whether walk-ins are accepted",
    weight: 80,
    query: (r) =>
      `Does ${r.name} ${cityOf(r)} accept walk-ins for food, or is an appointment or referral required?`,
  },
  {
    field: "diet",
    label: "Checking dietary options",
    weight: 70,
    query: (r, need) =>
      `Does ${r.name} ${cityOf(r)} offer ${
        need.diet === "any" ? "hot meals or groceries" : need.diet + " food"
      }?`,
  },
  {
    field: "eligibility",
    label: "Checking eligibility requirements",
    weight: 60,
    query: (r) =>
      `Who is eligible to receive food from ${r.name} ${cityOf(r)}? Is ID, proof of address or a referral required?`,
  },
  {
    field: "availability",
    label: "Checking whether beds are available tonight",
    weight: 95,
    query: (r) =>
      `Does ${r.name} ${cityOf(r)} have shelter beds available tonight, and what is the check-in or intake process?`,
  },
  {
    field: "address",
    label: "Checking street address",
    weight: 90,
    query: (r) => `What is the street address of ${r.name} food program?`,
  },
];

function cityOf(r: Resource): string {
  const parts = (r.address ?? "").split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

const MISSING_RE = /unknown|n\/?a|not (stated|listed|specified|available)/i;

function missing(v?: string): boolean {
  return !v || v.trim().length < 3 || MISSING_RE.test(v);
}

/** Which fields of this resource are still unknown, most important first. */
export function detectGaps(r: Resource, need: HelpNeed): Gap[] {
  const gaps: Gap[] = [];

  if (missing(r.hours) || parseClosingMinutes(r.hours) === undefined) {
    gaps.push(GAP_TYPES[0]);
  }
  if (r.walkIn === undefined) gaps.push(GAP_TYPES[1]);
  if (need.category === "food" && need.diet !== "any" && !mentionsDiet(r, need.diet)) gaps.push(GAP_TYPES[2]);
  if (missing(r.eligibility)) gaps.push(GAP_TYPES[3]);
  if (need.category === "shelter" && missing(r.availability)) gaps.push(GAP_TYPES[4]);
  if (missing(r.address)) gaps.push(GAP_TYPES[5]);

  return gaps.sort((a, b) => b.weight - a.weight);
}

export function mentionsDiet(r: Resource, diet: string): boolean {
  const words = DIET_WORDS[diet];
  if (!words) return true;
  const hay = [r.foodTypes.join(" "), r.eligibility ?? "", r.name]
    .join(" ")
    .toLowerCase();
  return words.some((w) => hay.includes(w));
}

/**
 * Parse a closing time out of free-text hours.
 * Returns minutes from midnight, or undefined if the text never says
 * when the doors shut - which is itself a research gap.
 */
export function parseClosingMinutes(hours?: string): number | undefined {
  if (!hours) return undefined;
  const text = hours.toLowerCase();
  if (/24\s*hours|always open/.test(text)) return 24 * 60;

  // Prefer the right-hand side of a range: "9am - 8pm", "9:00-20:00".
  const range =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|til|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(
      text,
    );
  if (range) {
    return toMinutes(range[4], range[5], range[6] ?? range[3]);
  }
  const closes =
    /(?:closes?|until|til|till|through)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(
      text,
    );
  if (closes) return toMinutes(closes[1], closes[2], closes[3]);
  return undefined;
}

function toMinutes(h: string, m?: string, ampm?: string): number {
  let hour = Number(h);
  const min = Number(m ?? 0);
  const suffix = ampm?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  // A bare "5" with no am/pm in a food-program context means the evening.
  if (!suffix && hour <= 11) hour += 12;
  return hour * 60 + min;
}

export function formatMinutes(mins?: number): string {
  if (mins === undefined) return "unknown";
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
}

const APPOINTMENT_RE =
  /\b(appointment|referral|registration|reservation|pre-?register|intake)\b[^.]{0,30}?\b(required|needed|necessary)\b|by appointment only|must (register|call ahead|book)|requires? an appointment/i;

const WALKIN_RE =
  /\b(accept(?:s|ing|ed)?|welcom(?:e|es|ing)|allow(?:s|ing|ed)?|serves?)\s+(?:all\s+)?walk[-\s]?ins?|walk[-\s]?ins?\s*(?:are\s*)?(?:welcome|accepted|ok|okay|allowed)|open to (?:all|the public|anyone)|drop[-\s]?in/i;

/**
 * "No appointment is needed" is a walk-in policy, not a requirement.
 * Without this the requirement pattern reads a double negative backwards
 * and every welcoming pantry looks like it contradicts itself.
 */
const NO_REQUIREMENT_RE =
  /\b(?:no|without)\s+(?:appointment|referral|registration|reservation|intake|documentation|paperwork|id\b)|\b(?:do(?:es)?\s+not|don'?t|doesn'?t|never)\s+(?:need|require)/i;

/** The sentence in `text` that carries a given claim, for showing the user. */
function sentenceMatching(text: string, re: RegExp): string | undefined {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => re.test(s));
  if (!hit) return undefined;
  const clean = hit.trim().replace(/\s+/g, " ");
  return clean.length <= 150 ? clean : clean.slice(0, 149) + "…";
}

/** Human phrasing for a closing time, including the always-open case. */
export function describeHours(mins?: number): string {
  if (mins === undefined) return "hours unverified";
  if (mins >= 24 * 60) return "24 hours";
  return `until ${formatMinutes(mins)}`;
}

export function parseWalkIn(text?: string): boolean | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const waived = NO_REQUIREMENT_RE.test(t);
  const no = !waived && APPOINTMENT_RE.test(t);
  const yes = waived || WALKIN_RE.test(t);
  if (yes && !no) return true;
  if (no && !yes) return false;
  if (yes && no) return undefined; // genuinely contradictory - caller flags it
  if (/^\s*(yes|y|true)\s*$/.test(t)) return true;
  if (/^\s*(no|n|false)\s*$/.test(t)) return false;
  return undefined;
}

/**
 * Compare what we already believed against what the follow-up said.
 * A real disagreement becomes an open conflict the UI surfaces with a
 * warning, and the pipeline then tries to settle it with one more query.
 */
export function findConflict(
  field: string,
  existing: string | undefined,
  incoming: string,
): ResourceConflict | undefined {
  if (field === "walkIn") {
    const b = parseWalkIn(incoming);

    // A single answer that cites two sources saying opposite things is a
    // conflict on its own — there is nothing prior to compare it against.
    if (b === undefined) {
      const appointment = sentenceMatching(incoming, APPOINTMENT_RE);
      const walkIn = sentenceMatching(incoming, WALKIN_RE);
      if (appointment && walkIn) {
        return { field, claimA: appointment, claimB: walkIn, status: "open" };
      }
      return undefined;
    }

    const a = parseWalkIn(existing);
    if (a !== undefined && a !== b) {
      return {
        field,
        claimA: a ? "Walk-ins accepted" : "Appointment required",
        claimB: b ? "Walk-ins accepted" : "Appointment required",
        status: "open",
      };
    }
    return undefined;
  }

  if (!existing || existing.trim().length < 3) return undefined;

  if (field === "hours") {
    const a = parseClosingMinutes(existing);
    const b = parseClosingMinutes(incoming);
    if (a !== undefined && b !== undefined && Math.abs(a - b) >= 60) {
      return {
        field,
        claimA: `Closes ${formatMinutes(a)}`,
        claimB: `Closes ${formatMinutes(b)}`,
        status: "open",
      };
    }
    return undefined;
  }

  return undefined;
}

/**
 * Confidence is the share of the fields that matter to this person which
 * we actually verified, penalised for anything still contradictory.
 */
export function scoreConfidence(r: Resource, need: HelpNeed): number {
  let have = 0;
  let total = 0;
  const count = (ok: boolean, weight = 1) => {
    total += weight;
    if (ok) have += weight;
  };

  count(Boolean(r.address && r.address.length > 5), 2);
  count(parseClosingMinutes(r.hours) !== undefined, 3);
  count(r.walkIn !== undefined, 2);
  count(Boolean(r.eligibility && r.eligibility.length > 5), 1);
  count(need.category !== "food" || need.diet === "any" || mentionsDiet(r, need.diet), 2);
  if (need.category === "shelter") count(Boolean(r.availability), 3);
  count(r.sources.length > 0, 1);
  count(r.sources.length > 1, 1);

  const base = total === 0 ? 0 : have / total;
  const penalty = r.conflicts.filter((c) => c.status === "open").length * 0.18;
  return Math.max(0.05, Math.min(1, base - penalty));
}
