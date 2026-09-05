// ─────────────────────────────────────────────────────────────
// Simulated volunteers.
//
// Bots are ordinary rows in `volunteers` with isBot=true. A Convex cron
// (crons.ts) calls `tick` every two seconds: idle bots wander, then pick
// up the oldest waiting request that a human hasn't claimed within a
// grace period; busy bots ride to the pantry, then to the requester,
// advancing the request's status on arrival exactly as a person would.
//
// Because they move by patching their own row, the same privacy-rounded
// tracking query serves both bots and humans — the requester's map can't
// tell the difference, and shouldn't.
// ─────────────────────────────────────────────────────────────

import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { bearing, distanceMeters, moveToward, offsetMeters } from "./geo";

/** Demo-scale scooter: a two-mile leg takes about a minute. */
export const BOT_SPEED_MPS = 45;
export const TICK_SECONDS = 2;
const ARRIVE_METERS = 70;
/** Humans get first refusal on every request. */
const HUMAN_GRACE_MS = 8_000;
const WANDER_METERS = 30;

const BOT_NAMES = [
  "Scooter Sam",
  "Pedal Priya",
  "Courier Kai",
  "Dash Dani",
  "Rider Rosa",
  "Loop Leo",
];

export const count = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("volunteers").withIndex("by_bot", (q) => q.eq("isBot", true)).collect())
      .length,
});

/** Drop N bots around a point, 600–2200 m out in random directions. */
export const seed = mutation({
  args: { lat: v.number(), lng: v.number(), count: v.optional(v.number()) },
  handler: async (ctx, { lat, lng, count }) => {
    const existing = await ctx.db
      .query("volunteers")
      .withIndex("by_bot", (q) => q.eq("isBot", true))
      .collect();
    const want = Math.max(1, Math.min(6, count ?? 4));
    const now = Date.now();
    let created = 0;
    for (let i = existing.length; i < want; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 600 + Math.random() * 1600;
      const p = offsetMeters({ lat, lng }, Math.cos(angle) * radius, Math.sin(angle) * radius);
      await ctx.db.insert("volunteers", {
        name: BOT_NAMES[i % BOT_NAMES.length],
        available: true,
        isBot: true,
        lat: p.lat,
        lng: p.lng,
        heading: Math.random() * 360,
        locationUpdatedAt: now,
        lastSeen: now,
        completed: 0,
      });
      created++;
    }
    return { created, total: existing.length + created };
  },
});

/** Remove every bot; hand any request they were carrying back to the board. */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const bots = await ctx.db
      .query("volunteers")
      .withIndex("by_bot", (q) => q.eq("isBot", true))
      .collect();
    for (const bot of bots) {
      if (bot.activeRequestId) {
        const req = await ctx.db.get(bot.activeRequestId);
        if (req && req.status !== "delivered" && req.status !== "cancelled") {
          await ctx.db.patch(req._id, {
            status: "waiting",
            volunteerId: undefined,
            volunteerName: undefined,
            volunteerDocId: undefined,
            updatedAt: Date.now(),
            timeline: [
              ...req.timeline,
              { status: "waiting", at: Date.now(), note: "simulated volunteer removed" },
            ],
          });
        }
      }
      await ctx.db.delete(bot._id);
    }
    return bots.length;
  },
});

/** One simulation step. Scheduled by crons.ts; not callable from clients. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bots = await ctx.db
      .query("volunteers")
      .withIndex("by_bot", (q) => q.eq("isBot", true))
      .collect();
    if (!bots.length) return;

    const now = Date.now();
    // Convex schedules crons at its own cadence (observed ~10 s, whatever
    // we ask for), so distance per tick is speed × time actually elapsed,
    // capped so a stalled deployment can't teleport a bot on resume.
    const stepFor = (last?: number) =>
      BOT_SPEED_MPS * Math.min(15, Math.max(TICK_SECONDS, (now - (last ?? now)) / 1000));

    const claimable = (
      await ctx.db
        .query("requests")
        .withIndex("by_status", (q) => q.eq("status", "waiting"))
        .collect()
    )
      .filter((r) => now - r.createdAt > HUMAN_GRACE_MS)
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const bot of bots) {
      if (bot.lat === undefined || bot.lng === undefined) continue;
      const here = { lat: bot.lat, lng: bot.lng };

      // ── busy: ride the mission ──────────────────────────
      if (bot.activeRequestId) {
        const req = await ctx.db.get(bot.activeRequestId);
        const stillMine = req && req.volunteerDocId === bot._id;
        if (!req || !stillMine || req.status === "delivered" || req.status === "cancelled") {
          await ctx.db.patch(bot._id, { activeRequestId: undefined, available: true, lastSeen: now });
          continue;
        }

        const pantry = { lat: req.resource.lat ?? req.lat, lng: req.resource.lng ?? req.lng };
        const person = { lat: req.lat, lng: req.lng };
        const target = req.status === "assigned" ? pantry : person;
        const remaining = distanceMeters(here, target);

        if (remaining <= ARRIVE_METERS) {
          if (req.status === "assigned") {
            await advanceRequest(ctx, req, "picked_up", bot.name);
          } else if (req.status === "picked_up") {
            await advanceRequest(ctx, req, "on_the_way", bot.name);
          } else if (req.status === "on_the_way") {
            await advanceRequest(ctx, req, "delivered", bot.name);
            await ctx.db.patch(bot._id, {
              activeRequestId: undefined,
              available: true,
              completed: bot.completed + 1,
              lastSeen: now,
            });
          }
          await ctx.db.patch(bot._id, { lat: target.lat, lng: target.lng, locationUpdatedAt: now });
          continue;
        }

        const next = moveToward(here, target, stepFor(bot.locationUpdatedAt));
        await ctx.db.patch(bot._id, {
          lat: next.lat,
          lng: next.lng,
          heading: bearing(here, target),
          locationUpdatedAt: now,
          lastSeen: now,
        });
        continue;
      }

      // ── idle: claim work, else wander ───────────────────
      const req = claimable.shift();
      if (req) {
        await ctx.db.patch(req._id, {
          status: "assigned",
          volunteerId: `bot:${bot._id}`,
          volunteerName: bot.name,
          volunteerDocId: bot._id,
          updatedAt: now,
          timeline: [...req.timeline, { status: "assigned", at: now, by: bot.name }],
        });
        await ctx.db.patch(bot._id, { activeRequestId: req._id, available: false, lastSeen: now });
        continue;
      }

      const drift = offsetMeters(
        here,
        (Math.random() - 0.5) * 2 * WANDER_METERS,
        (Math.random() - 0.5) * 2 * WANDER_METERS,
      );
      await ctx.db.patch(bot._id, {
        lat: drift.lat,
        lng: drift.lng,
        heading: bearing(here, drift),
        locationUpdatedAt: now,
        lastSeen: now,
      });
    }
  },
});

async function advanceRequest(
  ctx: MutationCtx,
  req: Doc<"requests">,
  status: "picked_up" | "on_the_way" | "delivered",
  by: string,
) {
  const now = Date.now();
  await ctx.db.patch(req._id, {
    status,
    updatedAt: now,
    timeline: [...req.timeline, { status, at: now, by }],
  });
}
