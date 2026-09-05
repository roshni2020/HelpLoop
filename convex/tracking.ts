// ─────────────────────────────────────────────────────────────
// Live tracking, with the volunteer's real position kept private.
//
// The requester subscribes to this query. It returns a position rounded
// to a ~440 m grid plus distance-to-next-stop and an ETA — enough to
// watch help approach, not enough to learn where a volunteer lives or
// which street they are on. Exact coordinates stay in the database.
// ─────────────────────────────────────────────────────────────

import { query } from "./_generated/server";
import { v } from "convex/values";
import { distanceMeters, fuzz } from "./geo";
import { BOT_SPEED_MPS } from "./bots";

/** A person on a bike or scooter, for the ETA of a human volunteer. */
const HUMAN_SPEED_MPS = 4.5;
/** After this long without an update a human's dot is shown as stale. */
const STALE_MS = 45_000;

const LIVE_PHASES = new Set(["assigned", "picked_up", "on_the_way"]);

export const forRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.db.get(requestId);
    if (!req || !LIVE_PHASES.has(req.status)) return null;

    let vol = req.volunteerDocId ? await ctx.db.get(req.volunteerDocId) : null;
    if (!vol && req.volunteerName) {
      vol = await ctx.db
        .query("volunteers")
        .filter((q) => q.eq(q.field("name"), req.volunteerName))
        .first();
    }
    if (!vol || vol.lat === undefined || vol.lng === undefined) return null;

    const exact = { lat: vol.lat, lng: vol.lng };
    const pantry = { lat: req.resource.lat ?? req.lat, lng: req.resource.lng ?? req.lng };
    const person = { lat: req.lat, lng: req.lng };
    const nextStop = req.status === "assigned" ? pantry : person;

    const meters = distanceMeters(exact, nextStop);
    const speed = vol.isBot ? BOT_SPEED_MPS : HUMAN_SPEED_MPS;
    const approx = fuzz(exact);
    const updatedAt = vol.locationUpdatedAt ?? vol.lastSeen;

    return {
      // Rounded on purpose. Never return `exact`.
      approxLat: approx.lat,
      approxLng: approx.lng,
      phase: req.status,
      nextStop: req.status === "assigned" ? ("pantry" as const) : ("you" as const),
      metersToNextStop: Math.round(meters),
      etaMinutes: Math.max(1, Math.round(meters / speed / 60)),
      isBot: Boolean(vol.isBot),
      stale: !vol.isBot && Date.now() - updatedAt > STALE_MS,
      updatedAt,
      volunteerName: vol.name,
      rating: vol.ratingCount ? Math.round(((vol.ratingSum ?? 0) / vol.ratingCount) * 10) / 10 : undefined,
      ratingCount: vol.ratingCount ?? 0,
    };
  },
});
