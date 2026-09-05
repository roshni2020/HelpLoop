import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { statusValidator } from "./schema";

const resourceValidator = v.object({
  id: v.string(),
  name: v.string(),
  address: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  hours: v.optional(v.string()),
  confidence: v.number(),
});

/**
 * Everything currently on the map, newest first. The requester's phone is
 * stripped here; it is only ever served through `contact`, to the one
 * volunteer on the request.
 */
export const list = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("requests").order("desc").take(100)).map(
      ({ requesterPhone, ...rest }) => ({ ...rest, hasPhone: Boolean(requesterPhone) }),
    ),
});

/**
 * Contact details for a matched pair, and nobody else: the volunteer on
 * the request may see the requester's number, and vice versa.
 */
export const contact = query({
  args: { id: v.id("requests"), asVolunteerId: v.optional(v.string()) },
  handler: async (ctx, { id, asVolunteerId }) => {
    const req = await ctx.db.get(id);
    if (!req || req.status === "waiting" || req.status === "cancelled") return null;
    const vol = req.volunteerDocId ? await ctx.db.get(req.volunteerDocId) : null;
    const isTheVolunteer = Boolean(asVolunteerId && req.volunteerId === asVolunteerId);
    return {
      requesterPhone: isTheVolunteer ? (req.requesterPhone ?? null) : null,
      volunteerPhone: isTheVolunteer ? null : (vol?.phone ?? null),
    };
  },
});

export const get = query({
  args: { id: v.id("requests") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Open work for the volunteer dashboard. */
export const open = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("requests")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .order("desc")
      .take(50),
});

export const create = mutation({
  args: {
    requesterName: v.string(),
    category: v.optional(v.string()),
    need: v.string(),
    locationText: v.string(),
    lat: v.number(),
    lng: v.number(),
    diet: v.string(),
    transport: v.string(),
    urgency: v.string(),
    who: v.optional(v.string()),
    requesterPhone: v.optional(v.string()),
    matchScore: v.optional(v.number()),
    matchReason: v.optional(v.string()),
    resource: resourceValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("requests", {
      ...args,
      createdAt: now,
      updatedAt: now,
      status: "waiting",
      timeline: [{ status: "waiting", at: now, by: args.requesterName }],
    });
  },
});

/** A volunteer takes the job. Guarded so two volunteers can't both win. */
export const accept = mutation({
  args: {
    id: v.id("requests"),
    volunteerId: v.string(),
    volunteerName: v.string(),
    volunteerDocId: v.optional(v.id("volunteers")),
  },
  handler: async (ctx, { id, volunteerId, volunteerName, volunteerDocId }) => {
    const request = await ctx.db.get(id);
    if (!request) throw new Error("Request not found");
    if (request.status !== "waiting") {
      // Someone else got there first — a normal race, not an error state.
      return { ok: false as const, reason: "already-taken" };
    }
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "assigned",
      volunteerId,
      volunteerName,
      volunteerDocId,
      updatedAt: now,
      timeline: [...request.timeline, { status: "assigned", at: now, by: volunteerName }],
    });
    if (volunteerDocId) {
      await ctx.db.patch(volunteerDocId, { activeRequestId: id, available: false, lastSeen: now });
    }
    return { ok: true as const };
  },
});

export const advance = mutation({
  args: {
    id: v.id("requests"),
    status: statusValidator,
    by: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, by, note }) => {
    const request = await ctx.db.get(id);
    if (!request) throw new Error("Request not found");
    const now = Date.now();
    await ctx.db.patch(id, {
      status,
      updatedAt: now,
      timeline: [...request.timeline, { status, at: now, by, note }],
    });

    if ((status === "delivered" || status === "cancelled") && request.volunteerDocId) {
      const volunteer = await ctx.db.get(request.volunteerDocId);
      if (volunteer) {
        await ctx.db.patch(volunteer._id, {
          activeRequestId: undefined,
          available: true,
          completed: status === "delivered" ? volunteer.completed + 1 : volunteer.completed,
          lastSeen: now,
        });
      }
    }
    return { ok: true as const };
  },
});

/** The requester rates the delivery; the volunteer's average updates live. */
export const rate = mutation({
  args: { id: v.id("requests"), stars: v.number() },
  handler: async (ctx, { id, stars }) => {
    const request = await ctx.db.get(id);
    if (!request || request.status !== "delivered") return { ok: false as const };
    const clamped = Math.max(1, Math.min(5, Math.round(stars)));
    const previous = request.rating;
    await ctx.db.patch(id, { rating: clamped, updatedAt: Date.now() });
    if (request.volunteerDocId) {
      const vol = await ctx.db.get(request.volunteerDocId);
      if (vol) {
        // Re-rating replaces, it does not double count.
        const sum = (vol.ratingSum ?? 0) - (previous ?? 0) + clamped;
        const count = (vol.ratingCount ?? 0) + (previous ? 0 : 1);
        await ctx.db.patch(vol._id, { ratingSum: sum, ratingCount: count });
      }
    }
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: { id: v.id("requests") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

/** Demo reset: clears the board and frees every volunteer. */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("requests").take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    const vols = await ctx.db.query("volunteers").take(200);
    for (const vol of vols) {
      if (vol.activeRequestId) {
        await ctx.db.patch(vol._id, { activeRequestId: undefined, available: true });
      }
    }
    return rows.length;
  },
});
