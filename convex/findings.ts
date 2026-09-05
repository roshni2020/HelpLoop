import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Research findings attached to a request, so the volunteer sees the evidence. */
export const forRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) =>
    ctx.db
      .query("findings")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .take(100),
});

export const saveMany = mutation({
  args: {
    requestId: v.id("requests"),
    findings: v.array(
      v.object({
        resourceId: v.optional(v.string()),
        kind: v.string(),
        query: v.string(),
        finding: v.string(),
        source: v.string(),
        certainty: v.number(),
        needsFollowUp: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { requestId, findings }) => {
    const now = Date.now();
    for (const f of findings) {
      await ctx.db.insert("findings", { ...f, requestId, createdAt: now });
    }
    return findings.length;
  },
});
