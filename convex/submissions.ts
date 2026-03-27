import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { getEventConfigOrDefault } from "./lib/event";

export const upsert = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    repoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    metadata: v.object({
      deckUrl: v.optional(v.string()),
      notes: v.optional(v.string()),
      techStack: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", user.clerkUserId))
      .unique();

    if (!participant?.teamId) {
      throw new Error("You need a published team before submitting");
    }

    const event = await getEventConfigOrDefault(ctx);
    if (event.phase !== "submissions_open") {
      throw new Error("Submissions are not open");
    }

    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_team_id", (q) => q.eq("teamId", participant.teamId!))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        repoUrl: args.repoUrl,
        demoUrl: args.demoUrl,
        metadata: args.metadata,
        submittedByParticipantId: participant._id,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("submissions", {
      teamId: participant.teamId,
      title: args.title,
      description: args.description,
      repoUrl: args.repoUrl,
      demoUrl: args.demoUrl,
      metadata: args.metadata,
      submittedByParticipantId: participant._id,
      submittedAt: now,
      updatedAt: now,
    });
  },
});
