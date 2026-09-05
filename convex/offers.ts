// ─────────────────────────────────────────────────────────────
// Supply side: a restaurant, kitchen or neighbour with food to share.
//
// One row per offer. `remaining` drops as requests claim meals and the
// pin leaves the map at zero or when `availableUntil` passes. Offers are
// fed into the same ranking as researched pantries, so the person asking
// just sees "best match" — whether it came from the web or from a
// restaurant down the street.
// ─────────────────────────────────────────────────────────────

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("offers").order("desc").take(100);
    return rows
      .filter((o) => o.remaining > 0 && o.availableUntil > now)
      .map(({ phone, ...rest }) => ({ ...rest, hasPhone: Boolean(phone) }));
  },
});

export const create = mutation({
  args: {
    providerName: v.string(),
    foodType: v.string(),
    quantity: v.number(),
    locationText: v.string(),
    lat: v.number(),
    lng: v.number(),
    availableUntil: v.number(),
    dietary: v.array(v.string()),
    instructions: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const qty = Math.max(1, Math.min(500, Math.round(args.quantity)));
    return ctx.db.insert("offers", {
      ...args,
      quantity: qty,
      remaining: qty,
      createdAt: Date.now(),
      claims: 0,
    });
  },
});

/** A request takes `count` meals. Fails cleanly if it ran out first. */
export const claim = mutation({
  args: { id: v.id("offers"), requestId: v.id("requests"), count: v.optional(v.number()) },
  handler: async (ctx, { id, requestId, count }) => {
    const offer = await ctx.db.get(id);
    if (!offer) return { ok: false as const, reason: "gone" };
    const n = Math.max(1, Math.round(count ?? 1));
    if (offer.remaining < n || offer.availableUntil < Date.now()) {
      return { ok: false as const, reason: "ran-out" };
    }
    await ctx.db.patch(id, { remaining: offer.remaining - n, claims: offer.claims + 1 });
    await ctx.db.patch(requestId, { offerId: id });
    return { ok: true as const, remaining: offer.remaining - n };
  },
});

export const close = mutation({
  args: { id: v.id("offers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { remaining: 0 });
  },
});
