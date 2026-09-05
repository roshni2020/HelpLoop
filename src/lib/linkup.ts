// ─────────────────────────────────────────────────────────────
// Track 1 — Linkup client.
//
// Two call shapes are used by the pipeline:
//   • structured()    — the seed search that returns candidate resources
//   • sourcedAnswer() — the follow-up searches that close a gap or settle
//                       a conflict, and come back with citations attached
// ─────────────────────────────────────────────────────────────

const LINKUP_URL = "https://api.linkup.so/v1/search";

export type LinkupDepth = "standard" | "deep";

export interface SourcedAnswer {
  answer: string;
  sources: { name: string; url: string; snippet?: string }[];
}

export function linkupConfigured(): boolean {
  return Boolean(process.env.LINKUP_API_KEY?.trim());
}

function depth(): LinkupDepth {
  return process.env.LINKUP_DEPTH === "deep" ? "deep" : "standard";
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const key = process.env.LINKUP_API_KEY?.trim();
  if (!key) throw new Error("LINKUP_API_KEY is not set");

  const res = await fetch(LINKUP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ depth: depth(), includeImages: false, ...body }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Linkup ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Ask Linkup for a JSON object matching `schema`. */
export function linkupStructured<T>(
  q: string,
  schema: Record<string, unknown>,
): Promise<T> {
  return call<T>({
    q,
    outputType: "structured",
    structuredOutputSchema: JSON.stringify(schema),
  });
}

/** Ask Linkup a plain question and get an answer plus its sources. */
export function linkupSourcedAnswer(q: string): Promise<SourcedAnswer> {
  return call<SourcedAnswer>({ q, outputType: "sourcedAnswer" });
}

/** JSON schema for the seed search: a list of real community food resources. */
export const RESOURCE_SEARCH_SCHEMA = {
  type: "object",
  required: ["resources"],
  properties: {
    resources: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Organization or program name" },
          address: { type: "string", description: "Full street address" },
          hours: {
            type: "string",
            description:
              "Days and times the program distributes food, e.g. 'Mon-Fri 9am-5pm'. Empty string if not stated.",
          },
          eligibility: {
            type: "string",
            description:
              "Who may receive food and what is required (ID, appointment, residency). Empty string if not stated.",
          },
          foodTypes: {
            type: "array",
            items: { type: "string" },
            description:
              "Dietary options offered, e.g. vegetarian, vegan, halal, hot meals, groceries.",
          },
          walkIn: {
            type: "string",
            description:
              "'yes' if walk-ins are accepted, 'no' if an appointment or referral is required, '' if not stated.",
          },
          phone: { type: "string" },
          website: { type: "string" },
        },
      },
    },
  },
} as const;

export interface RawResource {
  name: string;
  address?: string;
  hours?: string;
  eligibility?: string;
  foodTypes?: string[];
  walkIn?: string;
  phone?: string;
  website?: string;
}
