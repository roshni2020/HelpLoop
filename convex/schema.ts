import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const statusValidator = v.union(
  v.literal("waiting"),
  v.literal("assigned"),
  v.literal("picked_up"),
  v.literal("on_the_way"),
  v.literal("delivered"),
  v.literal("cancelled"),
);

export default defineSchema({
  // The shared task state. This single row is what the requester screen
  // and the volunteer screen both subscribe to — that shared subscription
  // is the whole multiplayer story.
  requests: defineTable({
    createdAt: v.number(),
    updatedAt: v.number(),
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
    status: statusValidator,
    volunteerId: v.optional(v.string()),
    volunteerName: v.optional(v.string()),
    /** The volunteer's row, so tracking can find their position. */
    volunteerDocId: v.optional(v.id("volunteers")),
    matchScore: v.optional(v.number()),
    matchReason: v.optional(v.string()),
    /** 1-5, given by the requester after delivery. */
    rating: v.optional(v.number()),
    /** Optional. Served to the assigned volunteer only (see requests.list). */
    requesterPhone: v.optional(v.string()),
    resource: v.object({
      id: v.string(),
      name: v.string(),
      address: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      hours: v.optional(v.string()),
      confidence: v.number(),
    }),
    timeline: v.array(
      v.object({
        status: statusValidator,
        at: v.number(),
        by: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  })
    .index("by_status", ["status"])
    .index("by_volunteer", ["volunteerId"]),

  // Volunteers, human and simulated. `lat`/`lng` here is the EXACT
  // position and it never leaves the database as-is: every query that
  // serves other users rounds it first (see tracking.ts / volunteers.ts).
  volunteers: defineTable({
    name: v.string(),
    available: v.boolean(),
    isBot: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    heading: v.optional(v.number()),
    activeRequestId: v.optional(v.id("requests")),
    locationUpdatedAt: v.optional(v.number()),
    lastSeen: v.number(),
    completed: v.number(),
    ratingSum: v.optional(v.number()),
    ratingCount: v.optional(v.number()),
    /** Optional. Served to the requester they are helping only. */
    phone: v.optional(v.string()),
  })
    .index("by_available", ["available"])
    .index("by_bot", ["isBot"]),

  // Research findings kept alongside the request, so a volunteer can see
  // exactly what was verified about the place they are being sent to.
  findings: defineTable({
    requestId: v.optional(v.id("requests")),
    resourceId: v.optional(v.string()),
    kind: v.string(),
    query: v.string(),
    finding: v.string(),
    source: v.string(),
    certainty: v.number(),
    needsFollowUp: v.boolean(),
    createdAt: v.number(),
  }).index("by_request", ["requestId"]),
});
