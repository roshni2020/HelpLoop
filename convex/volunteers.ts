import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { fuzz } from "./geo";

/**
 * Everyone on the map — humans and bots — with positions ROUNDED.
 * Exact coordinates never leave this function.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("volunteers").order("desc").take(100);
    return rows.map((r) => {
      const approx =
        r.lat !== undefined && r.lng !== undefined ? fuzz({ lat: r.lat, lng: r.lng }) : null;
      return {
        _id: r._id,
        name: r.name,
        available: r.available,
        isBot: Boolean(r.isBot),
        lat: approx?.lat,
        lng: approx?.lng,
        heading: r.heading,
        activeRequestId: r.activeRequestId,
        completed: r.completed,
        rating: r.ratingCount ? Math.round(((r.ratingSum ?? 0) / r.ratingCount) * 10) / 10 : undefined,
        ratingCount: r.ratingCount ?? 0,
        lastSeen: r.lastSeen,
        locationUpdatedAt: r.locationUpdatedAt,
      };
    });
  },
});

/** Called when a volunteer opens the dashboard; keeps them on the map. */
export const checkIn = mutation({
  args: {
    name: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { name, lat, lng, phone }) => {
    const existing = await ctx.db
      .query("volunteers")
      .filter((q) => q.and(q.eq(q.field("name"), name), q.neq(q.field("isBot"), true)))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        available: true,
        lastSeen: now,
        ...(phone !== undefined ? { phone: phone || undefined } : {}),
        ...(lat !== undefined && lng !== undefined
          ? { lat, lng, locationUpdatedAt: now }
          : {}),
      });
      return existing._id;
    }
    return ctx.db.insert("volunteers", {
      name,
      available: true,
      isBot: false,
      phone: phone || undefined,
      lat,
      lng,
      locationUpdatedAt: lat !== undefined ? now : undefined,
      lastSeen: now,
      completed: 0,
    });
  },
});

/**
 * The live-tracking write. The exact position is stored here and only
 * here; readers get it back rounded via `list` and `tracking.forRequest`.
 */
export const updateLocation = mutation({
  args: { id: v.id("volunteers"), lat: v.number(), lng: v.number(), heading: v.optional(v.number()) },
  handler: async (ctx, { id, lat, lng, heading }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await ctx.db.patch(id, { lat, lng, heading, locationUpdatedAt: Date.now(), lastSeen: Date.now() });
  },
});

export const setAvailable = mutation({
  args: { id: v.id("volunteers"), available: v.boolean() },
  handler: async (ctx, { id, available }) => {
    await ctx.db.patch(id, { available, lastSeen: Date.now() });
  },
});
