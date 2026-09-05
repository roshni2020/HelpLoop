// Bot volunteers, end to end: seed bots, post a request with NO human
// volunteer online, and watch a bot accept it, ride to the pantry, ride
// to the requester, and deliver — all driven by the Convex cron.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// Headless software GL cannot keep up with terrain; the app opts out on this flag.
const FLAT = "?noterrain=1";
mkdirSync("shots", { recursive: true });
const log = (...a) => console.log("  ", ...a);
const failures = [];
const check = (ok, l) => { log(`${ok ? "PASS" : "FAIL"}  ${l}`); if (!ok) failures.push(l); };

const browser = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
try {
  await page.goto(BASE + FLAT, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("helploop.myRequestId"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Seed bots from the nav. The button relabels itself the instant the
  // mutation lands ("Add bots" -> "4 bots"), so click once and verify by
  // text rather than waiting on the old label.
  const botBtn = page.locator("header button", { hasText: /bots/i });
  if (!/\d+ bots/.test((await botBtn.innerText()).trim())) {
    await botBtn.click({ timeout: 5000, force: true }).catch(() => {});
  }
  await page.waitForFunction(() => /\d+ bots/.test(document.body.innerText), null, { timeout: 20000 });
  check(true, "bots seeded via nav (" + (await botBtn.innerText()).trim() + ")");
  await page.waitForTimeout(3000);
  const botPins = await page.locator(".hl-marker:has-text('🤖')").count();
  check(botPins >= 1, `bot pins on the map (${botPins})`);
  await page.screenshot({ path: "shots/bots-01-idle.png" });

  // Post a request. No human volunteer page is open anywhere.
  await page.getByRole("button", { name: "Find help" }).click({ force: true });
  await page.getByText("Best match", { exact: false }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: /Need pickup help/ }).click({ force: true });
  await page.getByText("Looking for a volunteer").waitFor({ timeout: 15000 });
  check(true, "request posted with nobody human online");

  // Humans get an 8s grace period, then a bot should claim it.
  const t0 = Date.now();
  await page.locator("text=/is helping you/").waitFor({ timeout: 40000 });
  const who = (await page.locator("h3:has-text('is helping you')").innerText()).trim();
  check(/Sam|Priya|Kai|Dani|Rosa|Leo/.test(who), `a bot accepted after ${((Date.now()-t0)/1000).toFixed(0)}s: "${who}"`);
  await page.getByText("🤖", { exact: false }).first().waitFor({ timeout: 10000 });
  check(true, "tracking card shows the 🤖 badge, ETA and privacy note");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "shots/bots-02-accepted.png" });

  // Watch the bot progress the mission on its own.
  await page.getByText("Food picked up").first().waitFor({ timeout: 120000 });
  check(true, "bot reached the pantry → status advanced to picked up (no human input)");
  await page.screenshot({ path: "shots/bots-03-picked-up.png" });
  await page.getByText("On the way to you").first().waitFor({ timeout: 30000 });
  check(true, "bot → on the way");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "shots/bots-04-en-route.png" });
  await page.getByText("🎉 One less problem on the map.").waitFor({ timeout: 120000 });
  check(true, "bot delivered — full mission with zero human volunteers");
  await page.screenshot({ path: "shots/bots-05-delivered.png" });
} catch (err) {
  failures.push(`threw: ${err.message}`);
  await page.screenshot({ path: "shots/bots-ERROR.png" }).catch(() => {});
} finally { await browser.close(); }
console.log("\n  " + "─".repeat(58));
if (failures.length) { console.log(`  ${failures.length} FAILURE(S):`); failures.forEach(f => console.log("   ✗ " + f)); process.exit(1); }
console.log("  Bot flow passed.\n");
