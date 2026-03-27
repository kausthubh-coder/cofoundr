import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAdminPasswordStatus, requireAdminPassword } from "./lib/auth";
import { getEventConfigOrDefault } from "./lib/event";

const rubricItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  weight: v.number(),
});

const faqItemValidator = v.object({
  question: v.string(),
  answer: v.string(),
});

const phaseValidator = v.union(
  v.literal("registration_open"),
  v.literal("matching_review"),
  v.literal("teams_published"),
  v.literal("submissions_open"),
  v.literal("submissions_closed"),
);

export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    return await getEventConfigOrDefault(ctx);
  },
});

export const getAdmin = query({
  args: {
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    return await getEventConfigOrDefault(ctx);
  },
});

export const validateAdminPassword = query({
  args: {
    adminPassword: v.string(),
  },
  handler: async (_ctx, args) => {
    return getAdminPasswordStatus(args.adminPassword);
  },
});

export const save = mutation({
  args: {
    adminPassword: v.string(),
    eventName: v.string(),
    location: v.string(),
    overview: v.string(),
    rules: v.array(v.string()),
    rubric: v.array(rubricItemValidator),
    faq: v.array(faqItemValidator),
    registrationDeadline: v.string(),
    publishTime: v.string(),
    submissionOpenTime: v.string(),
    submissionCloseTime: v.string(),
    phase: phaseValidator,
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);

    const existing = await ctx.db
      .query("eventConfig")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        eventName: args.eventName,
        location: args.location,
        overview: args.overview,
        rules: args.rules,
        rubric: args.rubric,
        faq: args.faq,
        registrationDeadline: args.registrationDeadline,
        publishTime: args.publishTime,
        submissionOpenTime: args.submissionOpenTime,
        submissionCloseTime: args.submissionCloseTime,
        phase: args.phase,
      });
      return existing._id;
    }

    return await ctx.db.insert("eventConfig", {
      key: "default",
      eventName: args.eventName,
      location: args.location,
      overview: args.overview,
      rules: args.rules,
      rubric: args.rubric,
      faq: args.faq,
      registrationDeadline: args.registrationDeadline,
      publishTime: args.publishTime,
      submissionOpenTime: args.submissionOpenTime,
      submissionCloseTime: args.submissionCloseTime,
      phase: args.phase,
    });
  },
});

export const setPhase = mutation({
  args: {
    adminPassword: v.string(),
    phase: phaseValidator,
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const current = await getEventConfigOrDefault(ctx);
    if (current._id) {
      await ctx.db.patch(current._id, {
        phase: args.phase,
      });
      return current._id;
    }

    return await ctx.db.insert("eventConfig", {
      key: "default",
      eventName: current.eventName,
      location: current.location,
      overview: current.overview,
      rules: current.rules,
      rubric: current.rubric,
      faq: current.faq,
      registrationDeadline: current.registrationDeadline,
      publishTime: current.publishTime,
      submissionOpenTime: current.submissionOpenTime,
      submissionCloseTime: current.submissionCloseTime,
      phase: args.phase,
    });
  },
});
