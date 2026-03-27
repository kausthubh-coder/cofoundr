import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const skillValidator = v.union(
  v.literal("frontend"),
  v.literal("backend"),
  v.literal("ml_ai"),
  v.literal("mobile"),
  v.literal("data"),
  v.literal("marketing"),
  v.literal("finance"),
  v.literal("sales"),
  v.literal("operations"),
  v.literal("product"),
);

const experienceValidator = v.union(
  v.literal("beginner"),
  v.literal("intermediate"),
  v.literal("advanced"),
);

const workStyleValidator = v.union(
  v.literal("planner"),
  v.literal("executor"),
);

const eventPhaseValidator = v.union(
  v.literal("registration_open"),
  v.literal("matching_review"),
  v.literal("teams_published"),
  v.literal("submissions_open"),
  v.literal("submissions_closed"),
);

export default defineSchema({
  participants: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    major: v.optional(v.union(v.literal("cs"), v.literal("business"))),
    skills: v.optional(v.array(skillValidator)),
    experienceLevel: v.optional(experienceValidator),
    workStyle: v.optional(workStyleValidator),
    teammateCount: v.optional(v.number()),
    requestedTeammateEmails: v.array(v.string()),
    registrationComplete: v.boolean(),
    excludedFromMatching: v.boolean(),
    unitId: v.union(v.id("registrationUnits"), v.null()),
    teamId: v.union(v.id("teams"), v.null()),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_unit_id", ["unitId"])
    .index("by_team_id", ["teamId"]),

  registrationUnits: defineTable({
    memberEmails: v.array(v.string()),
    memberParticipantIds: v.array(v.id("participants")),
    declaredSize: v.number(),
    status: v.union(
      v.literal("pending_members"),
      v.literal("ready"),
      v.literal("placed"),
      v.literal("conflict"),
      v.literal("dropped"),
    ),
    source: v.union(v.literal("solo"), v.literal("self_formed")),
    teamId: v.union(v.id("teams"), v.null()),
    compositionSnapshot: v.object({
      totalMembers: v.number(),
      readyMembers: v.number(),
      csCount: v.number(),
      businessCount: v.number(),
      skillCounts: v.record(v.string(), v.number()),
      experienceCounts: v.record(v.string(), v.number()),
      workStyleCounts: v.record(v.string(), v.number()),
    }),
  })
    .index("by_status", ["status"])
    .index("by_team_id", ["teamId"]),

  unitEmailClaims: defineTable({
    email: v.string(),
    unitId: v.id("registrationUnits"),
  })
    .index("by_email", ["email"])
    .index("by_unit_id", ["unitId"]),

  teams: defineTable({
    participantIds: v.array(v.id("participants")),
    status: v.union(
      v.literal("draft"),
      v.literal("locked"),
      v.literal("flagged"),
      v.literal("published"),
    ),
    locked: v.boolean(),
    origin: v.union(
      v.literal("preformed"),
      v.literal("matched"),
      v.literal("manual"),
    ),
    publishedAt: v.optional(v.number()),
    teamNumber: v.optional(v.number()),
    matchScore: v.optional(v.number()),
    matchBreakdown: v.optional(
      v.object({
        skill: v.number(),
        experience: v.number(),
        workStyle: v.number(),
      }),
    ),
    flags: v.array(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_team_number", ["teamNumber"]),

  submissions: defineTable({
    teamId: v.id("teams"),
    title: v.string(),
    description: v.string(),
    repoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    metadata: v.object({
      deckUrl: v.optional(v.string()),
      notes: v.optional(v.string()),
      techStack: v.optional(v.string()),
    }),
    submittedByParticipantId: v.id("participants"),
    submittedAt: v.number(),
    updatedAt: v.number(),
    judgeScore: v.optional(v.number()),
    judgeFeedbackSummary: v.optional(v.string()),
    judgedAt: v.optional(v.number()),
    resultsReleasedAt: v.optional(v.number()),
    judgedByLabel: v.optional(v.string()),
    resultsReleasedByLabel: v.optional(v.string()),
  }).index("by_team_id", ["teamId"]),

  eventConfig: defineTable({
    key: v.string(),
    eventName: v.string(),
    location: v.string(),
    overview: v.string(),
    rules: v.array(v.string()),
    rubric: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        weight: v.number(),
      }),
    ),
    faq: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
      }),
    ),
    registrationDeadline: v.string(),
    publishTime: v.string(),
    submissionOpenTime: v.string(),
    submissionCloseTime: v.string(),
    phase: eventPhaseValidator,
  }).index("by_key", ["key"]),
});
