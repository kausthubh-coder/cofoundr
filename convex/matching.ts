import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminPassword } from "./lib/auth";
import { runMatching } from "./lib/matching";
import { setUnitTeam } from "./lib/units";

const teamProposalValidator = v.object({
  participantIds: v.array(v.id("participants")),
  unitIds: v.array(v.id("registrationUnits")),
  locked: v.boolean(),
  status: v.union(
    v.literal("draft"),
    v.literal("locked"),
    v.literal("flagged"),
    v.literal("published"),
  ),
  origin: v.union(
    v.literal("preformed"),
    v.literal("matched"),
    v.literal("manual"),
  ),
  flags: v.array(v.string()),
  matchScore: v.union(v.number(), v.null()),
  matchBreakdown: v.union(
    v.object({
      skill: v.number(),
      experience: v.number(),
      workStyle: v.number(),
    }),
    v.null(),
  ),
});

export const getSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const readyUnits = await ctx.db
      .query("registrationUnits")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .take(256);

    const availableUnits = readyUnits.filter((unit) => unit.teamId === null);
    const participantIds = [
      ...new Set(
        availableUnits.flatMap((unit) => unit.memberParticipantIds.map((id) => id)),
      ),
    ];

    const participants = [];
    for (const participantId of participantIds) {
      const participant = await ctx.db.get(participantId);
      if (participant && !participant.excludedFromMatching) {
        participants.push(participant);
      }
    }

    return {
      units: availableUnits,
      participants,
    };
  },
});

export const applyMatchingResult = internalMutation({
  args: {
    proposals: v.array(teamProposalValidator),
  },
  handler: async (ctx, args) => {
    const transientTeams = [
      ...(await ctx.db
        .query("teams")
        .withIndex("by_status", (q) => q.eq("status", "draft"))
        .take(256)),
      ...(await ctx.db
        .query("teams")
        .withIndex("by_status", (q) => q.eq("status", "flagged"))
        .take(256)),
    ];

    const clearedUnitIds = new Set<Id<"registrationUnits">>();

    for (const team of transientTeams) {
      for (const participantId of team.participantIds) {
        const participant = await ctx.db.get(participantId);
        if (participant) {
          await ctx.db.patch(participant._id, {
            teamId: null,
          });
          if (participant.unitId) {
            clearedUnitIds.add(participant.unitId);
          }
        }
      }
      await ctx.db.delete(team._id);
    }

    for (const unitId of clearedUnitIds) {
      await setUnitTeam(ctx, unitId, null);
    }

    const createdTeamIds = [];
    for (const proposal of args.proposals) {
      const teamToInsert: {
        participantIds: typeof proposal.participantIds;
        status: typeof proposal.status;
        locked: typeof proposal.locked;
        origin: typeof proposal.origin;
        flags: typeof proposal.flags;
        matchScore?: number;
        matchBreakdown?: NonNullable<typeof proposal.matchBreakdown>;
      } = {
        participantIds: proposal.participantIds,
        status: proposal.status,
        locked: proposal.locked,
        origin: proposal.origin,
        flags: proposal.flags,
      };
      if (proposal.matchScore !== null) {
        teamToInsert.matchScore = proposal.matchScore;
      }
      if (proposal.matchBreakdown !== null) {
        teamToInsert.matchBreakdown = proposal.matchBreakdown;
      }

      const teamId = await ctx.db.insert("teams", teamToInsert);

      for (const participantId of proposal.participantIds) {
        await ctx.db.patch(participantId, {
          teamId,
        });
      }

      for (const unitId of proposal.unitIds) {
        await setUnitTeam(ctx, unitId, teamId);
      }

      createdTeamIds.push(teamId);
    }

    return createdTeamIds;
  },
});

export const run = action({
  args: {
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const snapshot = await ctx.runQuery(internal.matching.getSnapshot, {});

    const proposals = runMatching(snapshot.units, snapshot.participants);
    await ctx.runMutation(internal.matching.applyMatchingResult, {
      proposals: proposals.map((proposal) => ({
        ...proposal,
        matchScore: proposal.matchScore ?? null,
        matchBreakdown: proposal.matchBreakdown ?? null,
      })),
    });

    return {
      created: proposals.length,
    };
  },
});
