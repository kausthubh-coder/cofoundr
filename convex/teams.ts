import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { requireAdminPassword, requireUser } from "./lib/auth";
import { getEventConfigOrDefault } from "./lib/event";
import { scoreTeamParticipants } from "./lib/matching";
import { refreshUnit, setUnitTeam } from "./lib/units";

type ReadCtx = QueryCtx | MutationCtx;

async function getParticipantsByIds(
  ctx: ReadCtx,
  participantIds: Id<"participants">[],
) {
  const participants = [];
  for (const participantId of participantIds) {
    const participant = await ctx.db.get(participantId);
    if (participant) {
      participants.push(participant);
    }
  }
  return participants;
}

function summarizeTeamParticipants(
  participants: Awaited<ReturnType<typeof getParticipantsByIds>>,
) {
  const csCount = participants.filter((participant) => participant.major === "cs").length;
  const businessCount = participants.filter(
    (participant) => participant.major === "business",
  ).length;

  return {
    csCount,
    businessCount,
  };
}

function deriveDraftStatus(participants: Awaited<ReturnType<typeof getParticipantsByIds>>) {
  const summary = summarizeTeamParticipants(participants);
  if (participants.length === 4 && summary.csCount === 2 && summary.businessCount === 2) {
    return "draft" as const;
  }
  return "flagged" as const;
}

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", user.clerkUserId))
      .unique();

    const event = await getEventConfigOrDefault(ctx);

    if (!participant) {
      return {
        participant: null,
        unit: null,
        team: null,
        submission: null,
        event,
      };
    }

    const unit = participant.unitId ? await ctx.db.get(participant.unitId) : null;
    const team = participant.teamId ? await ctx.db.get(participant.teamId) : null;
    const teamMembers = [];
    for (const memberId of team?.participantIds ?? []) {
      const member = await ctx.db.get(memberId);
      if (member) {
        teamMembers.push(member);
      }
    }

    const submission = team?._id
      ? await ctx.db
          .query("submissions")
          .withIndex("by_team_id", (q) => q.eq("teamId", team._id))
          .unique()
      : null;

    const memberStatuses = [];
    for (const email of unit?.memberEmails ?? []) {
      const member = await ctx.db
        .query("participants")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      memberStatuses.push({
        email,
        name: member?.name ?? null,
        registered: Boolean(member?.registrationComplete),
      });
    }

    return {
      participant,
      unit: unit
        ? {
            ...unit,
            memberStatuses,
          }
        : null,
      team: team
        ? {
            ...team,
            members: teamMembers,
          }
        : null,
      submission,
      event,
    };
  },
});

export const getAdminDashboard = query({
  args: {
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);

    const [participants, units, teams, event] = await Promise.all([
      ctx.db.query("participants").order("desc").take(512),
      ctx.db.query("registrationUnits").order("desc").take(256),
      ctx.db.query("teams").order("desc").take(256),
      getEventConfigOrDefault(ctx),
    ]);

    const teamMap = new Map(teams.map((team) => [team._id, team]));
    const unitMap = new Map(units.map((unit) => [unit._id, unit]));

    const hydratedTeams = [];
    for (const team of teams) {
      const members = [];
      for (const participantId of team.participantIds) {
        const participant = participants.find((candidate) => candidate._id === participantId);
        if (participant) {
          members.push(participant);
        }
      }
      hydratedTeams.push({
        ...team,
        members,
      });
    }

    const hydratedUnits = [];
    for (const unit of units) {
      const members = [];
      for (const email of unit.memberEmails) {
        const participant = participants.find((candidate) => candidate.email === email);
        members.push({
          email,
          name: participant?.name ?? null,
          participantId: participant?._id ?? null,
          registered: Boolean(participant?.registrationComplete),
        });
      }

      hydratedUnits.push({
        ...unit,
        members,
      });
    }

    return {
      overview: {
        registered: participants.filter((participant) => participant.registrationComplete)
          .length,
        pending: units.filter((unit) => unit.status === "pending_members").length,
        ready: units.filter((unit) => unit.status === "ready").length,
        matched: teams.filter((team) => team.status !== "published").length,
        published: teams.filter((team) => team.status === "published").length,
        conflicts: units.filter((unit) => unit.status === "conflict").length,
      },
      participants: participants.map((participant) => ({
        ...participant,
        unitStatus: participant.unitId ? unitMap.get(participant.unitId)?.status ?? null : null,
        teamStatus: participant.teamId ? teamMap.get(participant.teamId)?.status ?? null : null,
        teamNumber: participant.teamId ? teamMap.get(participant.teamId)?.teamNumber ?? null : null,
      })),
      units: hydratedUnits,
      teams: hydratedTeams,
      event,
    };
  },
});

export const setTeamLocked = mutation({
  args: {
    adminPassword: v.string(),
    teamId: v.id("teams"),
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const members = await getParticipantsByIds(ctx, team.participantIds);

    const status = args.locked ? "locked" : deriveDraftStatus(members);
    await ctx.db.patch(team._id, {
      locked: args.locked,
      status,
    });

    return team._id;
  },
});

export const moveParticipant = mutation({
  args: {
    adminPassword: v.string(),
    participantId: v.id("participants"),
    targetTeamId: v.union(v.id("teams"), v.null()),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const participant = await ctx.db.get(args.participantId);
    if (!participant) {
      throw new Error("Participant not found");
    }

    const sourceTeam = participant.teamId ? await ctx.db.get(participant.teamId) : null;
    let targetTeam = args.targetTeamId ? await ctx.db.get(args.targetTeamId) : null;

    if (!targetTeam) {
      const teamId = await ctx.db.insert("teams", {
        participantIds: [],
        status: "flagged",
        locked: false,
        origin: "manual",
        flags: ["Manual team"],
      });
      targetTeam = await ctx.db.get(teamId);
    }

    if (!targetTeam) {
      throw new Error("Target team not found");
    }

    if (sourceTeam?._id === targetTeam._id) {
      return targetTeam._id;
    }

    if (sourceTeam) {
      const remainingIds = sourceTeam.participantIds.filter((id) => id !== participant._id);
      if (remainingIds.length === 0) {
        await ctx.db.delete(sourceTeam._id);
      } else {
        const remainingParticipants = await getParticipantsByIds(ctx, remainingIds);
        const score = scoreTeamParticipants(remainingParticipants);
        await ctx.db.patch(sourceTeam._id, {
          participantIds: remainingIds,
          status: sourceTeam.locked ? "locked" : deriveDraftStatus(remainingParticipants),
          flags: remainingParticipants.length < 4 ? ["Needs review"] : [],
          matchScore: score.total,
          matchBreakdown: score.breakdown,
        });
      }
    }

    const nextTargetIds = [...new Set([...targetTeam.participantIds, participant._id])];
    const targetParticipants = await getParticipantsByIds(ctx, nextTargetIds);
    const score = scoreTeamParticipants(targetParticipants);
    const status = targetTeam.locked ? "locked" : deriveDraftStatus(targetParticipants);
    const flags =
      status === "flagged"
        ? ["Manual review required"]
        : targetTeam.origin === "manual"
          ? ["Manually curated team"]
          : [];

    await ctx.db.patch(targetTeam._id, {
      participantIds: nextTargetIds,
      status,
      origin: "manual",
      flags,
      matchScore: score.total,
      matchBreakdown: score.breakdown,
    });

    await ctx.db.patch(participant._id, {
      teamId: targetTeam._id,
      excludedFromMatching: false,
    });

    if (participant.unitId) {
      await setUnitTeam(ctx, participant.unitId, targetTeam._id);
    }

    return targetTeam._id;
  },
});

export const mergeTeams = mutation({
  args: {
    adminPassword: v.string(),
    sourceTeamId: v.id("teams"),
    targetTeamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const sourceTeam = await ctx.db.get(args.sourceTeamId);
    const targetTeam = await ctx.db.get(args.targetTeamId);
    if (!sourceTeam || !targetTeam) {
      throw new Error("Team not found");
    }

    const nextParticipantIds = [
      ...new Set([...targetTeam.participantIds, ...sourceTeam.participantIds]),
    ];
    const participants = await getParticipantsByIds(ctx, nextParticipantIds);

    const score = scoreTeamParticipants(participants);
    await ctx.db.patch(targetTeam._id, {
      participantIds: nextParticipantIds,
      status: targetTeam.locked ? "locked" : deriveDraftStatus(participants),
      origin: "manual",
      flags: ["Merged manually"],
      matchScore: score.total,
      matchBreakdown: score.breakdown,
    });

    for (const participantId of sourceTeam.participantIds) {
      const participant = await ctx.db.get(participantId);
      if (participant) {
        await ctx.db.patch(participant._id, {
          teamId: targetTeam._id,
        });
        if (participant.unitId) {
          await setUnitTeam(ctx, participant.unitId, targetTeam._id);
        }
      }
    }

    await ctx.db.delete(sourceTeam._id);
    return targetTeam._id;
  },
});

export const publishAll = mutation({
  args: {
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);

    const draftTeams = [
      ...(await ctx.db
        .query("teams")
        .withIndex("by_status", (q) => q.eq("status", "draft"))
        .take(256)),
      ...(await ctx.db
        .query("teams")
        .withIndex("by_status", (q) => q.eq("status", "flagged"))
        .take(256)),
      ...(await ctx.db
        .query("teams")
        .withIndex("by_status", (q) => q.eq("status", "locked"))
        .take(256)),
    ];

    const publishedTeams = await ctx.db
      .query("teams")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .take(256);
    let nextTeamNumber =
      publishedTeams.reduce(
        (max, team) => Math.max(max, team.teamNumber ?? 0),
        0,
      ) + 1;

    const publishedAt = Date.now();
    for (const team of draftTeams) {
      await ctx.db.patch(team._id, {
        status: "published",
        locked: true,
        publishedAt,
        teamNumber: nextTeamNumber,
      });
      nextTeamNumber += 1;
    }

    const event = await getEventConfigOrDefault(ctx);
    if (event._id) {
      await ctx.db.patch(event._id, {
        phase: "teams_published",
      });    } else {
      await ctx.db.insert("eventConfig", {
        key: "default",
        eventName: event.eventName,
        location: event.location,
        overview: event.overview,
        rules: event.rules,
        rubric: event.rubric,
        faq: event.faq,
        registrationDeadline: event.registrationDeadline,
        publishTime: event.publishTime,
        submissionOpenTime: event.submissionOpenTime,
        submissionCloseTime: event.submissionCloseTime,
        phase: "teams_published",
      });
    }

    return draftTeams.length;
  },
});

export const setParticipantPlaced = mutation({
  args: {
    adminPassword: v.string(),
    participantId: v.id("participants"),
    placed: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    const participant = await ctx.db.get(args.participantId);
    if (!participant) {
      throw new Error("Participant not found");
    }

    if (args.placed && participant.teamId) {
      throw new Error("Participant is already assigned to a team");
    }

    await ctx.db.patch(participant._id, {
      excludedFromMatching: args.placed,
    });

    if (participant.unitId) {
      await refreshUnit(ctx, participant.unitId);
    }

    return participant._id;
  },
});






