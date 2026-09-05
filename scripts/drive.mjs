// Drives the full HelpLoop demo in a real browser: request -> research ->
// rank -> volunteer accepts -> live status updates -> delivered.
//
//   node scripts/drive.mjs
//
// When Convex is configured the two windows are SEPARATE browser contexts —
// no shared cookies, storage or BroadcastChannel — so a status update
// crossing between them can only have travelled through Convex. On the
// local shim they must share one context, since that shim syncs through
// localStorage. The driver picks the right mode by asking /api/status.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// Headless software GL cannot keep up with terrain; the app opts out on this flag.
const FLAT = "?noterrain=1";
const SHOTS = "shots";
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log("  ", ...a);
let step = 0;
const shot = async (page, name) => {
  const file = `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file });
  log(`📸 ${file}`);
};

const status = await fetch(`${BASE}/api/status`).then((r) => r.json());
const viaConvex = Boolean(status?.convex?.configured);
console.log(
  `
  realtime: ${viaConvex ? "Convex — testing across two ISOLATED browser contexts" : "local shim — two windows of one context"}`,
);
console.log(
  `  linkup: ${status?.linkup?.configured ? "live" : "demo set"}   nebius: ${
    status?.nebius?.configured ? status.nebius.model : "heuristic"
  }
`,
);

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const viewport = { width: 1440, height: 900 };
const ctx = await browser.newContext({ viewport });
// A second, fully separate profile when Convex is carrying the state.
const ctxB = viaConvex ? await browser.newContext({ viewport }) : ctx;

const failures = [];
const check = (ok, label) => {
  log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

try {
  // ── Window 1: the person who needs help ──────────────────
  const requester = await ctx.newPage();
  requester.on("pageerror", (e) => failures.push(`requester pageerror: ${e.message}`));
  await requester.goto(BASE + FLAT, { waitUntil: "networkidle" });
  await requester.evaluate(() => localStorage.clear());
  await requester.reload({ waitUntil: "networkidle" });
  await requester.waitForTimeout(2500); // let the map settle

  check(
    await requester.getByText("What do you need help with?").isVisible(),
    "requester form renders",
  );
  check(
    await requester.locator("canvas.maplibregl-canvas").count() > 0,
    "3D map canvas mounted",
  );
  await shot(requester, "requester-form");

  // ── Run the research pipeline ────────────────────────────
  log("submitting: dinner tonight, Oakland, vegetarian, walking");
  await requester.getByRole("button", { name: "Find help" }).click({ force: true });

  await requester.getByText("Research trail").waitFor({ timeout: 20000 });
  await requester.waitForTimeout(3500);
  await shot(requester, "research-running");

  await requester
    .getByText("Best match", { exact: false })
    .waitFor({ timeout: 90000 });
  await requester.waitForTimeout(1200);

  const trail = await requester.locator("ol").first().innerText();
  check(/follow-up/i.test(trail), "research trail shows a gap follow-up");
  if (status?.linkup?.configured) {
    // Real sources only conflict when they actually disagree, so this is
    // reported rather than asserted against live data.
    log(
      /Conflicting information/i.test(trail)
        ? "info  live sources disagreed on something and a verification query ran"
        : "info  live sources agreed this time — no conflict to resolve",
    );
  } else {
    check(/Conflicting information/i.test(trail), "research trail shows a conflict");
    check(/Conflict settled/i.test(trail), "conflict was resolved by a follow-up");
  }
  await shot(requester, "research-results");

  const bestName = await requester
    .locator("h3")
    .first()
    .innerText()
    .catch(() => "?");
  log(`best match: ${bestName}`);

  // Switch the trail to the stored-findings view for a screenshot.
  await requester.getByRole("button", { name: "findings" }).click({ force: true });
  await requester.waitForTimeout(600);
  await shot(requester, "stored-findings");

  // ── Create the live request ──────────────────────────────
  await requester.getByRole("button", { name: /Need pickup help/ }).click({ force: true });
  await requester.getByText("Looking for a volunteer").waitFor({ timeout: 15000 });
  check(true, "help request created, requester sees 'Looking for a volunteer'");
  await shot(requester, "requester-waiting");

  // ── Window 2: the volunteer ──────────────────────────────
  const volunteer = await ctxB.newPage();
  volunteer.on("pageerror", (e) => failures.push(`volunteer pageerror: ${e.message}`));
  await volunteer.goto(`${BASE}/volunteer${FLAT}`, { waitUntil: "networkidle" });
  await volunteer.getByPlaceholder("Maya").fill("Maya");
  await volunteer.getByRole("button", { name: /ready to help/ }).click({ force: true });
  await volunteer.waitForTimeout(2500);

  const openCard = volunteer.getByText("Dinner tonight", { exact: false }).first();
  check(await openCard.isVisible(), "volunteer sees the open request appear");
  await shot(volunteer, "volunteer-open-request");

  // ── The Convex moment: accept, and watch window 1 change ──
  log("volunteer clicks 'I can help' — watching the requester window");
  await volunteer.getByRole("button", { name: "I can help" }).first().click({ force: true });

  await requester
    .getByText("Maya is helping you")
    .waitFor({ timeout: 15000 });
  check(
    true,
    viaConvex
      ? "requester updated to 'Maya is helping you' across an ISOLATED browser context, no reload"
      : "requester updated to 'Maya is helping you' WITHOUT a reload",
  );
  await shot(requester, "requester-assigned");
  await requester.waitForTimeout(2000);
  await shot(requester, "mission-route-animating");

  // ── Run the mission ──────────────────────────────────────
  for (const [label, expect] of [
    [/Picked up/, "Food picked up"],
    [/On the way/, "On the way to you"],
    [/Delivered/, "Delivered"],
  ]) {
    await volunteer.getByRole("button", { name: label }).first().click({ force: true });
    await requester.getByText(expect).first().waitFor({ timeout: 15000 });
    check(true, `status '${expect}' propagated live${viaConvex ? " across contexts" : ""}`);
    await requester.waitForTimeout(1400);
  }

  await requester.waitForTimeout(1500);
  check(
    await requester.getByText("🎉 One less problem on the map.").isVisible(),
    "delivery celebration shown",
  );
  await shot(requester, "delivered-requester");
  await shot(volunteer, "delivered-volunteer");

  // ── The eval report ──────────────────────────────────────
  const evalPage = await ctx.newPage();
  await evalPage.goto(`${BASE}/eval${FLAT}`, { waitUntil: "networkidle" });
  await evalPage.waitForTimeout(1200);
  check(
    await evalPage.getByText("Top-1 accuracy").isVisible(),
    "eval report renders",
  );
  await shot(evalPage, "eval-report");
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error("\n  ERROR:", err.message);
} finally {
  await browser.close();
}

console.log("\n  " + "─".repeat(58));
if (failures.length) {
  console.log(`  ${failures.length} FAILURE(S):`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  process.exit(1);
}
console.log("  All checks passed. Screenshots in ./shots\n");
