import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { normalizeEmail, uniqueEmails } from "../../lib/hackathon";

async function findParticipantByEmail(ctx: MutationCtx, email: string) {
  return await ctx.db
    .query("participants")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .unique();
}

async function listClaimsForEmail(ctx: MutationCtx, email: string) {
  return await ctx.db
    .query("unitEmailClaims")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .take(16);
}

async function listClaimsForUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
) {
  return await ctx.db
    .query("unitEmailClaims")
    .withIndex("by_unit_id", (q) => q.eq("unitId", unitId))
    .take(32);
}

async function deleteClaimsForUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
) {
  while (true) {
    const batch = await ctx.db
      .query("unitEmailClaims")
      .withIndex("by_unit_id", (q) => q.eq("unitId", unitId))
      .take(32);
    if (batch.length === 0) {
      break;
    }
    for (const claim of batch) {
      await ctx.db.delete(claim._id);
    }
  }
}

async function listParticipantsByEmails(
  ctx: MutationCtx,
  emails: string[],
): Promise<Doc<"participants">[]> {
  const participants: Doc<"participants">[] = [];
  for (const email of uniqueEmails(emails)) {
    const participant = await findParticipantByEmail(ctx, email);
    if (participant) {
      participants.push(participant);
    }
  }
  return participants;
}

function buildCompositionSnapshot(participants: Doc<"participants">[]) {
  const skillCounts: Record<string, number> = {};
  const experienceCounts: Record<string, number> = {};
  const workStyleCounts: Record<string, number> = {};

  let csCount = 0;
  let businessCount = 0;

  for (const participant of participants) {
    if (participant.major === "cs") {
      csCount += 1;
    }
    if (participant.major === "business") {
      businessCount += 1;
    }
    for (const skill of participant.skills ?? []) {
      skillCounts[skill] = (skillCounts[skill] ?? 0) + 1;
    }
    if (participant.experienceLevel) {
      experienceCounts[participant.experienceLevel] =
        (experienceCounts[participant.experienceLevel] ?? 0) + 1;
    }
    if (participant.workStyle) {
      workStyleCounts[participant.workStyle] =
        (workStyleCounts[participant.workStyle] ?? 0) + 1;
    }
  }

  return {
    totalMembers: participants.length,
    readyMembers: participants.filter((participant) => participant.registrationComplete)
      .length,
    csCount,
    businessCount,
    skillCounts,
    experienceCounts,
    workStyleCounts,
  };
}

async function hasConflict(ctx: MutationCtx, emails: string[]) {
  for (const email of emails) {
    const claims = await listClaimsForEmail(ctx, email);
    const unitIds = [...new Set(claims.map((claim) => claim.unitId))];
    if (unitIds.length > 1) {
      return true;
    }
  }
  return false;
}

async function syncParticipantUnitLinks(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
  participants: Doc<"participants">[],
) {
  for (const participant of participants) {
    if (participant.unitId !== unitId) {
      await ctx.db.patch(participant._id, {
        unitId,
      });
    }
  }
}

export async function refreshUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
) {
  const unit = await ctx.db.get(unitId);
  if (!unit) {
    return null;
  }

  const participants = await listParticipantsByEmails(ctx, unit.memberEmails);
  await syncParticipantUnitLinks(ctx, unitId, participants);

  const snapshot = buildCompositionSnapshot(participants);

  let status: Doc<"registrationUnits">["status"] = "pending_members";
  if (unit.teamId) {
    status = "placed";
  } else if (participants.some((participant) => participant.excludedFromMatching)) {
    status = "placed";
  } else if (await hasConflict(ctx, unit.memberEmails)) {
    status = "conflict";
  } else if (
    participants.length === unit.memberEmails.length &&
    participants.every((participant) => participant.registrationComplete)
  ) {
    status = "ready";
  }

  await ctx.db.patch(unitId, {
    memberParticipantIds: participants.map((participant) => participant._id),
    declaredSize: unit.memberEmails.length,
    status,
    source: unit.memberEmails.length > 1 ? "self_formed" : "solo",
    compositionSnapshot: snapshot,
  });

  return await ctx.db.get(unitId);
}

export async function rebuildClaimsForUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
  emails: string[],
) {
  await deleteClaimsForUnit(ctx, unitId);
  for (const email of uniqueEmails(emails)) {
    await ctx.db.insert("unitEmailClaims", {
      email,
      unitId,
    });
  }
}

export async function refreshUnitsForEmails(
  ctx: MutationCtx,
  emails: string[],
) {
  const unitIds = new Set<Id<"registrationUnits">>();
  for (const email of uniqueEmails(emails)) {
    const claims = await listClaimsForEmail(ctx, email);
    for (const claim of claims) {
      unitIds.add(claim.unitId);
    }
  }

  for (const unitId of unitIds) {
    await refreshUnit(ctx, unitId);
  }
}

export async function findOrCreateUnitForParticipant(
  ctx: MutationCtx,
  participantId: Id<"participants">,
  selfEmail: string,
  requestedTeammateEmails: string[],
) {
  const participant = await ctx.db.get(participantId);
  if (!participant) {
    throw new Error("Participant not found");
  }

  const desiredEmails = uniqueEmails([selfEmail, ...requestedTeammateEmails]);
  const existingUnit = participant.unitId ? await ctx.db.get(participant.unitId) : null;

  let unitId = existingUnit?._id;

  if (!unitId) {
    const claims = await listClaimsForEmail(ctx, selfEmail);
    unitId = claims[0]?.unitId;
  }

  if (!unitId) {
    unitId = await ctx.db.insert("registrationUnits", {
      memberEmails: desiredEmails,
      memberParticipantIds: [participantId],
      declaredSize: desiredEmails.length,
      status: "pending_members",
      source: desiredEmails.length > 1 ? "self_formed" : "solo",
      teamId: null,
      compositionSnapshot: {
        totalMembers: 1,
        readyMembers: participant.registrationComplete ? 1 : 0,
        csCount: participant.major === "cs" ? 1 : 0,
        businessCount: participant.major === "business" ? 1 : 0,
        skillCounts: Object.fromEntries(
          (participant.skills ?? []).map((skill) => [skill, 1]),
        ),
        experienceCounts: participant.experienceLevel
          ? { [participant.experienceLevel]: 1 }
          : {},
        workStyleCounts: participant.workStyle ? { [participant.workStyle]: 1 } : {},
      },
    });
  }

  const unit = await ctx.db.get(unitId);
  if (!unit) {
    throw new Error("Registration unit missing");
  }

  const nextEmails = uniqueEmails([...unit.memberEmails, ...desiredEmails]);
  await ctx.db.patch(unitId, {
    memberEmails: nextEmails,
    declaredSize: nextEmails.length,
    source: nextEmails.length > 1 ? "self_formed" : "solo",
  });

  await ctx.db.patch(participantId, {
    unitId,
  });

  await rebuildClaimsForUnit(ctx, unitId, nextEmails);
  await refreshUnitsForEmails(ctx, nextEmails);

  return unitId;
}

export async function removeEmailFromUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
  email: string,
) {
  const unit = await ctx.db.get(unitId);
  if (!unit) {
    throw new Error("Registration unit not found");
  }

  const normalized = normalizeEmail(email);
  const nextEmails = unit.memberEmails.filter((member) => member !== normalized);
  if (nextEmails.length === 0) {
    throw new Error("Cannot remove the final member from a unit");
  }

  await ctx.db.patch(unitId, {
    memberEmails: nextEmails,
    declaredSize: nextEmails.length,
    source: nextEmails.length > 1 ? "self_formed" : "solo",
  });

  const participant = await findParticipantByEmail(ctx, normalized);
  if (participant?.unitId === unitId && participant.teamId === null) {
    await ctx.db.patch(participant._id, {
      unitId: null,
    });
  }

  await rebuildClaimsForUnit(ctx, unitId, nextEmails);
  await refreshUnitsForEmails(ctx, [...unit.memberEmails, ...nextEmails]);
}

export async function setUnitTeam(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
  teamId: Id<"teams"> | null,
) {
  const unit = await ctx.db.get(unitId);
  if (!unit) {
    return;
  }
  await ctx.db.patch(unitId, { teamId });
  await refreshUnit(ctx, unitId);
}

export async function listClaimsByUnit(
  ctx: MutationCtx,
  unitId: Id<"registrationUnits">,
) {
  return await listClaimsForUnit(ctx, unitId);
}


