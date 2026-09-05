// Supply side: post an offer, then ask for food nearby and confirm the
// offer is ranked, claimable, and its live count drops.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FLAT = "?noterrain=1";
mkdirSync("shots", { recursive: true });
const failures = [];
const check = (ok, l) => { console.log(`   ${ok ? "PASS" : "FAIL"}  ${l}`); if (!ok) failures.push(l); };
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => failures.push("pageerror: " + e.message));
try {
  await p.goto(`${BASE}/offer${FLAT}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Nabila's Kitchen").fill("Nabila's Kitchen");
  await p.getByPlaceholder("Vegetarian biryani, boxed").fill("Vegetarian biryani, boxed");
  await p.getByPlaceholder("1420 Foothill Blvd, Oakland").fill("1420 Foothill Blvd, Oakland, CA");
  await p.locator("form button", { hasText: /^vegetarian$/ }).first().click({ force: true, timeout: 5000 });
  await p.getByRole("button", { name: /Post it to the map/ }).click({ force: true });
  await p.getByText("Live on the map").waitFor({ timeout: 20000 });
  check(true, "offer posted");
  await p.getByText(/20\/20 left/).waitFor({ timeout: 10000 });
  check(true, "offer shows 20/20 left");
  await p.screenshot({ path: "shots/offer-01-posted.png" });

  // Requester side, fresh context: the offer must appear in the ranking.
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const r = await ctx2.newPage();
  r.on("pageerror", (e) => failures.push("requester pageerror: " + e.message));
  await r.goto(BASE + FLAT, { waitUntil: "networkidle" });
  await r.waitForTimeout(1500);
  const offerPins = await r.locator(".hl-marker:has-text('meals')").count();
  check(offerPins >= 1, `offer pin on the requester map (${offerPins})`);
  await r.getByRole("button", { name: "Find help" }).click({ force: true });
  await r.getByText("Best match", { exact: false }).waitFor({ timeout: 150000 });
  const listed = await r.getByText(/Nabila's Kitchen \(\d+ Vegetarian biryani/).count();
  check(listed >= 1, "live offer appears among ranked options");
  await r.screenshot({ path: "shots/offer-02-ranked.png" });

  // Choose the offer (click its row, then its request button) and claim.
  const row = r.locator("div", { hasText: /Nabila's Kitchen/ }).filter({ has: r.locator("h3") }).last();
  await row.click({ force: true });
  const btn = r.getByRole("button", { name: /Need pickup help|Request pickup from here/ }).first();
  await btn.click({ force: true });
  await r.getByText("Looking for a volunteer").waitFor({ timeout: 15000 });
  check(true, "request created against the offer");

  // Back on the provider page the count must have dropped live.
  await p.getByText(/19\/20 left/).waitFor({ timeout: 15000 });
  check(true, "provider sees 19/20 left — count dropped live via Convex");
  await p.screenshot({ path: "shots/offer-03-claimed.png" });
  await ctx2.close();
} catch (e) { failures.push("threw: " + e.message.split("\n")[0]); await p.screenshot({ path: "shots/offer-ERROR.png" }).catch(() => {}); }
finally { await b.close(); }
if (failures.length) { console.log("  FAILURES:"); failures.forEach(f => console.log("   ✗ " + f)); process.exit(1); }
console.log("  Offer flow passed.");
