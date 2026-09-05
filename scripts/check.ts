// Pre-demo preflight: prints exactly which of the four tracks are live
// and which are running on their fallback, and verifies each key works.
//
//   npm run check

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { nebiusBase } from "../src/lib/nebius";

const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let hardFailure = false;

function ok(track: string, detail: string) {
  console.log(`  ${GREEN}●${RESET} ${track.padEnd(9)} ${detail}`);
}
function warn(track: string, detail: string, hint: string) {
  console.log(`  ${AMBER}●${RESET} ${track.padEnd(9)} ${detail}`);
  console.log(`    ${DIM}${hint}${RESET}`);
}
function fail(track: string, detail: string, hint: string) {
  hardFailure = true;
  console.log(`  ${RED}●${RESET} ${track.padEnd(9)} ${detail}`);
  console.log(`    ${DIM}${hint}${RESET}`);
}

async function checkLinkup() {
  const key = process.env.LINKUP_API_KEY?.trim();
  if (!key) {
    return warn(
      "Linkup",
      "not configured — research runs on the built-in demo set",
      "Set LINKUP_API_KEY in .env.local to research real resources.",
    );
  }
  try {
    const res = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: "food pantry Oakland California opening hours",
        depth: "standard",
        outputType: "sourcedAnswer",
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail("Linkup", `HTTP ${res.status}`, body.slice(0, 200));
    }
    const json = (await res.json()) as { sources?: unknown[] };
    ok("Linkup", `live · ${json.sources?.length ?? 0} sources on a test query`);
  } catch (err) {
    fail("Linkup", "request failed", String(err));
  }
}

async function checkNebius() {
  const key = process.env.NEBIUS_API_KEY?.trim();
  const model = process.env.NEBIUS_MODEL?.trim() || "meta-llama/Llama-3.3-70B-Instruct";
  if (!key) {
    return warn(
      "Nebius",
      "not configured — ranking runs on the built-in heuristic",
      "Set NEBIUS_API_KEY in .env.local to rank with a model.",
    );
  }
  const base = nebiusBase();
  try {
    const started = Date.now();
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 12,
        messages: [{ role: "user", content: 'Reply with the word "ready".' }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail("Nebius", `HTTP ${res.status}`, body.slice(0, 250));
    }
    ok("Nebius", `live · ${model} responded in ${Date.now() - started} ms`);
  } catch (err) {
    fail("Nebius", "request failed", String(err));
  }
}

function checkConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    return warn(
      "Convex",
      "not configured — realtime uses the local cross-tab shim",
      "Run `npx convex dev` once; it writes NEXT_PUBLIC_CONVEX_URL for you.",
    );
  }
  if (!/^https:\/\/.+\.convex\.cloud\/?$/.test(url)) {
    return fail("Convex", `URL looks wrong: ${url}`, "Expected https://<name>.convex.cloud");
  }
  ok("Convex", `live · ${url}`);
}

async function checkGeocoder() {
  try {
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?q=Oakland&format=json&limit=1",
      { headers: { "User-Agent": "HelpLoop/1.0 preflight" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ok("Geocoder", "live · OpenStreetMap Nominatim reachable");
  } catch {
    warn(
      "Geocoder",
      "unreachable — falls back to a table of known cities",
      "Only affects address-level precision on the map.",
    );
  }
}

async function main() {
  console.log(`\n  HelpLoop preflight\n  ${"─".repeat(56)}`);
  await checkLinkup();
  await checkNebius();
  checkConvex();
  await checkGeocoder();
  console.log(`  ${"─".repeat(56)}`);
  console.log(
    hardFailure
      ? `  ${RED}A configured integration is failing — fix it before demoing.${RESET}\n`
      : `  ${GREEN}Ready.${RESET} Amber entries run on fallbacks; the demo still works end to end.\n`,
  );
  process.exit(hardFailure ? 1 : 0);
}

main();
