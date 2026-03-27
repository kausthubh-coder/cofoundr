import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { findOrCreateUnitForParticipant } from "./lib/units";
import { normalizeEmail, uniqueEmails } from "../lib/hackathon";

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

function assertRegistrationShape(args: {
  major: "cs" | "business";
  skills: string[];
  teammateCount: number;
  requestedTeammateEmails: string[];
}) {
  if (args.skills.length === 0 || args.skills.length > 2) {
    throw new Error("Select one or two skills");
  }

  const validSkills =
    args.major === "cs"
      ? new Set(["frontend", "backend", "ml_ai", "mobile", "data"])
      : new Set(["marketing", "finance", "sales", "operations", "product"]);

  for (const skill of args.skills) {
    if (!validSkills.has(skill)) {
      throw new Error("Selected skills do not match the chosen major");
    }
  }

  if (args.teammateCount !== args.requestedTeammateEmails.length) {
    throw new Error("Teammate count does not match the number of emails");
  }
}

export const getRegistrationState = query({
  args: {
    emailHint: v.optional(v.string()),
    nameHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", user.clerkUserId))
      .unique();

    const unit =
      participant?.unitId !== null && participant?.unitId !== undefined
        ? await ctx.db.get(participant.unitId)
        : null;

    const memberStatuses = [];
    for (const email of unit?.memberEmails ?? []) {
      const member = await ctx.db
        .query("participants")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      memberStatuses.push({
        email,
        registered: Boolean(member?.registrationComplete),
        name: member?.name ?? null,
      });
    }

    return {
      participant: participant ?? {
        name: args.nameHint ?? user.name,
        email: args.emailHint ?? user.email ?? "",
        major: null,
        skills: [],
        experienceLevel: null,
        workStyle: null,
        teammateCount: 0,
        requestedTeammateEmails: [],
        registrationComplete: false,
        excludedFromMatching: false,
        unitId: null,
        teamId: null,
      },
      unit: unit
        ? {
            ...unit,
            memberStatuses,
          }
        : null,
    };
  },
});

export const searchTeammates = query({
  args: {
    search: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const needle = args.search.trim().toLowerCase();
    const participants = await ctx.db
      .query("participants")
      .order("desc")
      .take(needle ? 160 : 48);

    return participants
      .filter((participant) => {
        if (!participant.registrationComplete) {
          return false;
        }
        if (participant.clerkUserId === user.clerkUserId) {
          return false;
        }
        if (participant.teamId !== null) {
          return false;
        }
        if (!needle) {
          return true;
        }
        return (
          participant.name.toLowerCase().includes(needle) ||
          participant.email.toLowerCase().includes(needle)
        );
      })
      .slice(0, 12)
      .map((participant) => ({
        _id: participant._id,
        name: participant.name,
        email: participant.email,
        major: participant.major ?? null,
      }));
  },
});

export const saveRegistration = mutation({
  args: {
    emailHint: v.string(),
    name: v.string(),
    major: v.union(v.literal("cs"), v.literal("business")),
    skills: v.array(skillValidator),
    experienceLevel: experienceValidator,
    workStyle: workStyleValidator,
    teammateCount: v.number(),
    requestedTeammateEmails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const resolvedEmail = user.email ?? normalizeEmail(args.emailHint);
    if (!resolvedEmail) {
      throw new Error("Missing email address for registration");
    }

    const requestedTeammateEmails = uniqueEmails(
      args.requestedTeammateEmails.filter((email) => normalizeEmail(email) !== resolvedEmail),
    );

    assertRegistrationShape({
      major: args.major,
      skills: args.skills,
      teammateCount: args.teammateCount,
      requestedTeammateEmails,
    });

    const existing = await ctx.db
      .query("participants")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", user.clerkUserId))
      .unique();

    if (existing?.teamId) {
      throw new Error("Registration is locked after you are placed on a team");
    }

    let participantId = existing?._id;
    if (participantId) {
      await ctx.db.patch(participantId, {
        email: resolvedEmail,
        name: args.name,
        major: args.major,
        skills: args.skills,
        experienceLevel: args.experienceLevel,
        workStyle: args.workStyle,
        teammateCount: args.teammateCount,
        requestedTeammateEmails,
        registrationComplete: true,
      });
    } else {
      participantId = await ctx.db.insert("participants", {
        clerkUserId: user.clerkUserId,
        email: resolvedEmail,
        name: args.name,
        major: args.major,
        skills: args.skills,
        experienceLevel: args.experienceLevel,
        workStyle: args.workStyle,
        teammateCount: args.teammateCount,
        requestedTeammateEmails,
        registrationComplete: true,
        excludedFromMatching: false,
        unitId: null,
        teamId: null,
      });
    }

    const unitId = await findOrCreateUnitForParticipant(
      ctx,
      participantId,
      resolvedEmail,
      requestedTeammateEmails,
    );

    return {
      participantId,
      unitId,
    };
  },
});
