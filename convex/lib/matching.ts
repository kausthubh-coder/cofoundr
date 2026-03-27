import { Doc, Id } from "../_generated/dataModel";

export type MatchingParticipant = Pick<
  Doc<"participants">,
  | "_id"
  | "email"
  | "name"
  | "major"
  | "skills"
  | "experienceLevel"
  | "workStyle"
  | "unitId"
  | "excludedFromMatching"
>;

export type MatchingUnit = Pick<
  Doc<"registrationUnits">,
  "_id" | "memberParticipantIds" | "memberEmails" | "status" | "teamId"
>;

export type ProposedTeam = {
  participantIds: Id<"participants">[];
  unitIds: Id<"registrationUnits">[];
  locked: boolean;
  status: Doc<"teams">["status"];
  origin: Doc<"teams">["origin"];
  flags: string[];
  matchScore: number | null;
  matchBreakdown: { skill: number; experience: number; workStyle: number } | null;
};

type Candidate = {
  unitIndexes: number[];
  participantIds: Id<"participants">[];
  unitIds: Id<"registrationUnits">[];
  score: number;
  breakdown: {
    skill: number;
    experience: number;
    workStyle: number;
  };
};

export function scoreTeamParticipants(participants: MatchingParticipant[]) {
  const uniqueSkills = new Set(
    participants.flatMap((participant) => participant.skills ?? []),
  ).size;
  const experienceSet = new Set(
    participants
      .map((participant) => participant.experienceLevel)
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  ).size;

  const plannerCount = participants.filter(
    (participant) => participant.workStyle === "planner",
  ).length;
  const executorCount = participants.filter(
    (participant) => participant.workStyle === "executor",
  ).length;

  const skill = Math.round(Math.min(uniqueSkills / 4, 1) * 100);
  const experience = experienceSet === 1 ? 40 : experienceSet === 2 ? 85 : 100;
  const workStyle = Math.round(
    50 +
      50 *
        (1 -
          Math.abs(plannerCount - executorCount) / Math.max(participants.length, 1)),
  );

  const total = Math.round(skill * 0.4 + experience * 0.35 + workStyle * 0.25);

  return {
    total,
    breakdown: {
      skill,
      experience,
      workStyle,
    },
  };
}

function getParticipantsForUnit(
  unit: MatchingUnit,
  participantsById: Map<Id<"participants">, MatchingParticipant>,
) {
  return unit.memberParticipantIds
    .map((id) => participantsById.get(id))
    .filter((participant): participant is MatchingParticipant => Boolean(participant));
}

function countMajors(participants: MatchingParticipant[]) {
  return participants.reduce(
    (acc, participant) => {
      if (participant.major === "cs") {
        acc.cs += 1;
      } else if (participant.major === "business") {
        acc.business += 1;
      }
      return acc;
    },
    { cs: 0, business: 0 },
  );
}

function buildCandidates(
  units: MatchingUnit[],
  participantsById: Map<Id<"participants">, MatchingParticipant>,
) {
  const candidates: Candidate[] = [];

  const visit = (startIndex: number, currentIndexes: number[]) => {
    const selectedUnits = currentIndexes.map((index) => units[index]);
    const selectedParticipants = selectedUnits.flatMap((unit) =>
      getParticipantsForUnit(unit, participantsById),
    );
    const totalMembers = selectedParticipants.length;
    const majorCounts = countMajors(selectedParticipants);

    if (totalMembers > 4 || majorCounts.cs > 2 || majorCounts.business > 2) {
      return;
    }

    if (totalMembers === 4 && majorCounts.cs === 2 && majorCounts.business === 2) {
      const score = scoreTeamParticipants(selectedParticipants);
      candidates.push({
        unitIndexes: [...currentIndexes],
        participantIds: selectedParticipants.map((participant) => participant._id),
        unitIds: selectedUnits.map((unit) => unit._id),
        score: score.total,
        breakdown: score.breakdown,
      });
      return;
    }

    for (let index = startIndex; index < units.length; index += 1) {
      visit(index + 1, [...currentIndexes, index]);
    }
  };

  for (let index = 0; index < units.length; index += 1) {
    visit(index + 1, [index]);
  }

  return candidates;
}

function chooseBestCandidates(candidates: Candidate[]) {
  const best = {
    count: 0,
    score: 0,
    chosen: [] as Candidate[],
  };

  const search = (startIndex: number, usedUnits: Set<number>, chosen: Candidate[]) => {
    const count = chosen.length;
    const score = chosen.reduce((total, candidate) => total + candidate.score, 0);

    if (
      count > best.count ||
      (count === best.count && score > best.score)
    ) {
      best.count = count;
      best.score = score;
      best.chosen = [...chosen];
    }

    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate.unitIndexes.some((unitIndex) => usedUnits.has(unitIndex))) {
        continue;
      }

      candidate.unitIndexes.forEach((unitIndex) => usedUnits.add(unitIndex));
      chosen.push(candidate);
      search(index + 1, usedUnits, chosen);
      chosen.pop();
      candidate.unitIndexes.forEach((unitIndex) => usedUnits.delete(unitIndex));
    }
  };

  search(0, new Set(), []);
  return best.chosen;
}

function buildFallbackTeams(
  units: MatchingUnit[],
  participantsById: Map<Id<"participants">, MatchingParticipant>,
) {
  const remaining = [...units];
  const teams: ProposedTeam[] = [];

  while (remaining.length > 0) {
    let bestGroup: MatchingUnit[] = [remaining[0]];
    let bestScore = -1;

    for (let size = Math.min(4, remaining.length); size >= 1; size -= 1) {
      const combinations = collectCombinations(remaining, size);
      for (const group of combinations) {
        const participants = group.flatMap((unit) =>
          getParticipantsForUnit(unit, participantsById),
        );
        if (participants.length > 4 || participants.length < 3) {
          continue;
        }
        const score = scoreTeamParticipants(participants).total;
        if (
          participants.length > bestGroup.flatMap((unit) =>
            getParticipantsForUnit(unit, participantsById),
          ).length ||
          (participants.length ===
            bestGroup.flatMap((unit) => getParticipantsForUnit(unit, participantsById))
              .length &&
            score > bestScore)
        ) {
          bestGroup = group;
          bestScore = score;
        }
      }
      if (bestGroup.length > 0) {
        const currentCount = bestGroup.flatMap((unit) =>
          getParticipantsForUnit(unit, participantsById),
        ).length;
        if (currentCount >= 3) {
          break;
        }
      }
    }

    const participants = bestGroup.flatMap((unit) =>
      getParticipantsForUnit(unit, participantsById),
    );
    const score = scoreTeamParticipants(participants);
    const majors = countMajors(participants);
    const flags = [];
    if (participants.length < 4) {
      flags.push(`Leftover ${participants.length}-person team`);
    }
    if (majors.cs === 0 || majors.business === 0) {
      flags.push("Single-major fallback team");
    } else if (!(majors.cs === 2 && majors.business === 2)) {
      flags.push("Uneven cross-discipline fallback");
    }

    teams.push({
      participantIds: participants.map((participant) => participant._id),
      unitIds: bestGroup.map((unit) => unit._id),
      locked: false,
      status: "flagged",
      origin: "matched",
      flags,
      matchScore: score.total,
      matchBreakdown: score.breakdown,
    });

    for (const unit of bestGroup) {
      const index = remaining.findIndex((candidate) => candidate._id === unit._id);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }
  }

  return teams;
}

function collectCombinations<T>(items: T[], size: number) {
  const results: T[][] = [];

  const search = (start: number, current: T[]) => {
    if (current.length === size) {
      results.push([...current]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      search(index + 1, current);
      current.pop();
    }
  };

  search(0, []);
  return results;
}

export function runMatching(
  units: MatchingUnit[],
  participants: MatchingParticipant[],
) {
  const participantsById = new Map(participants.map((participant) => [participant._id, participant]));
  const unmatchedUnits: MatchingUnit[] = [];
  const proposedTeams: ProposedTeam[] = [];

  for (const unit of units) {
    const unitParticipants = getParticipantsForUnit(unit, participantsById);
    if (unitParticipants.length === 4) {
      const score = scoreTeamParticipants(unitParticipants);
      proposedTeams.push({
        participantIds: unitParticipants.map((participant) => participant._id),
        unitIds: [unit._id],
        locked: true,
        status: "locked",
        origin: "preformed",
        flags: [],
        matchScore: score.total,
        matchBreakdown: score.breakdown,
      });
    } else {
      unmatchedUnits.push(unit);
    }
  }

  const cleanCandidates = buildCandidates(unmatchedUnits, participantsById);
  const selectedCandidates = chooseBestCandidates(cleanCandidates);
  const usedUnitIds = new Set<Id<"registrationUnits">>();

  for (const candidate of selectedCandidates) {
    candidate.unitIds.forEach((unitId) => usedUnitIds.add(unitId));
    proposedTeams.push({
      participantIds: candidate.participantIds,
      unitIds: candidate.unitIds,
      locked: false,
      status: "draft",
      origin: "matched",
      flags: [],
      matchScore: candidate.score,
      matchBreakdown: candidate.breakdown,
    });
  }

  const leftovers = unmatchedUnits.filter((unit) => !usedUnitIds.has(unit._id));
  proposedTeams.push(...buildFallbackTeams(leftovers, participantsById));

  return proposedTeams;
}
