import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdminPassword, requireUser } from "./lib/auth";
import { getEventConfigOrDefault } from "./lib/event";

function validateJudgeScore(judgeScore: number) {
  if (!Number.isFinite(judgeScore) || judgeScore < 0 || judgeScore > 100) {
    throw new Error("Judge score must be a number between 0 and 100");
  }
}

function normalizeFeedbackSummary(judgeFeedbackSummary: string) {
  const trimmed = judgeFeedbackSummary.trim();
  if (!trimmed) {
    throw new Error("Feedback summary is required");
  }
  return trimmed;
}

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

export const saveJudging = mutation({
  args: {
    adminPassword: v.string(),
    submissionId: v.id("submissions"),
    judgeScore: v.number(),
    judgeFeedbackSummary: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    validateJudgeScore(args.judgeScore);
    const judgeFeedbackSummary = normalizeFeedbackSummary(args.judgeFeedbackSummary);

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new Error("Submission not found");
    }

    const judgedAt = Date.now();
    await ctx.db.patch(submission._id, {
      judgeScore: args.judgeScore,
      judgeFeedbackSummary,
      judgedAt,
      judgedByLabel: "Admin",
    });

    return submission._id;
  },
});

export const setResultsReleased = mutation({
  args: {
    adminPassword: v.string(),
    submissionId: v.id("submissions"),
    released: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new Error("Submission not found");
    }

    if (args.released) {
      if (
        typeof submission.judgeScore !== "number" ||
        !Number.isFinite(submission.judgeScore) ||
        !submission.judgeFeedbackSummary?.trim()
      ) {
        throw new Error("Save a score and feedback summary before releasing results");
      }

      await ctx.db.patch(submission._id, {
        resultsReleasedAt: Date.now(),
        resultsReleasedByLabel: "Admin",
      });
      return submission._id;
    }

    await ctx.db.replace(submission._id, {
      teamId: submission.teamId,
      title: submission.title,
      description: submission.description,
      repoUrl: submission.repoUrl,
      demoUrl: submission.demoUrl,
      metadata: submission.metadata,
      submittedByParticipantId: submission.submittedByParticipantId,
      submittedAt: submission.submittedAt,
      updatedAt: submission.updatedAt,
      judgeScore: submission.judgeScore,
      judgeFeedbackSummary: submission.judgeFeedbackSummary,
      judgedAt: submission.judgedAt,
      judgedByLabel: submission.judgedByLabel,
    });

    return submission._id;
  },
});
