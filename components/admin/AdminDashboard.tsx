"use client";

import { FormEvent, useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  EVENT_PHASES,
  EXPERIENCE_LABELS,
  MAJOR_LABELS,
  PHASE_LABELS,
  SKILL_LABELS,
  WORK_STYLE_LABELS,
  formatDateTime,
} from "@/lib/hackathon";

type EventFormState = {
  eventName: string;
  location: string;
  overview: string;
  registrationDeadline: string;
  publishTime: string;
  submissionOpenTime: string;
  submissionCloseTime: string;
  phase: (typeof EVENT_PHASES)[number];
  rulesText: string;
  rubricText: string;
  faqText: string;
};

type SubmissionJudgingDraft = {
  judgeScore: string;
  judgeFeedbackSummary: string;
};

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}

function buildEventForm(event: {
  eventName: string;
  location: string;
  overview: string;
  registrationDeadline: string;
  publishTime: string;
  submissionOpenTime: string;
  submissionCloseTime: string;
  phase: (typeof EVENT_PHASES)[number];
  rules: string[];
  rubric: { name: string; weight: number; description: string }[];
  faq: { question: string; answer: string }[];
}): EventFormState {
  return {
    eventName: event.eventName,
    location: event.location,
    overview: event.overview,
    registrationDeadline: toLocalDateTime(event.registrationDeadline),
    publishTime: toLocalDateTime(event.publishTime),
    submissionOpenTime: toLocalDateTime(event.submissionOpenTime),
    submissionCloseTime: toLocalDateTime(event.submissionCloseTime),
    phase: event.phase,
    rulesText: event.rules.join("\n"),
    rubricText: event.rubric
      .map((item) => `${item.name}|${item.weight}|${item.description}`)
      .join("\n"),
    faqText: event.faq.map((item) => `${item.question}|${item.answer}`).join("\n"),
  };
}

const UNIT_STATUS_LABELS: Record<
  "pending_members" | "ready" | "placed" | "conflict" | "dropped",
  string
> = {
  pending_members: "Pending members",
  ready: "Ready to match",
  placed: "Placed in a team",
  conflict: "Conflict",
  dropped: "Dropped",
};

const UNIT_STATUS_HELP: Record<
  "pending_members" | "ready" | "placed" | "conflict" | "dropped",
  string
> = {
  pending_members: "Not everyone in this group has finished registration yet.",
  ready: "Everyone in this group is registered; the matcher can keep them together.",
  placed: "This group is already tied to a draft or published team.",
  conflict:
    "At least one email is listed on more than one group. Remove the duplicate from one side.",
  dropped: "This registration group is no longer active.",
};

function describeOtherUnit(
  unitId: Id<"registrationUnits">,
  allUnits: Array<{ _id: Id<"registrationUnits">; source: "solo" | "self_formed" }>,
) {
  const u = allUnits.find((candidate) => candidate._id === unitId);
  const kind = u?.source === "solo" ? "Solo" : "Friend group";
  return `${kind} …${unitId.slice(-6)}`;
}

function formatParticipantSummary(participant: {
  major?: "cs" | "business" | null;
  skills?: string[];
  experienceLevel?: "beginner" | "intermediate" | "advanced" | null;
  workStyle?: "planner" | "executor" | null;
}) {
  const parts = [];
  if (participant.major) {
    parts.push(MAJOR_LABELS[participant.major]);
  }
  if (participant.skills?.length) {
    parts.push(
      participant.skills
        .map((skill) => SKILL_LABELS[skill as keyof typeof SKILL_LABELS])
        .join(", "),
    );
  }
  if (participant.experienceLevel) {
    parts.push(EXPERIENCE_LABELS[participant.experienceLevel]);
  }
  if (participant.workStyle) {
    parts.push(WORK_STYLE_LABELS[participant.workStyle]);
  }
  return parts.join(" • ");
}

export default function AdminDashboard() {
  const convex = useConvex();
  const [passwordInput, setPasswordInput] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draggedParticipantId, setDraggedParticipantId] = useState<Id<"participants"> | null>(null);
  const [eventDraft, setEventDraft] = useState<EventFormState | null>(null);
  const [judgingDrafts, setJudgingDrafts] = useState<Record<string, SubmissionJudgingDraft>>({});

  const dashboard = useQuery(
    api.teams.getAdminDashboard,
    adminPassword ? { adminPassword } : "skip",
  );
  const runMatching = useAction(api.matching.run);
  const setTeamLocked = useMutation(api.teams.setTeamLocked);
  const moveParticipant = useMutation(api.teams.moveParticipant);
  const mergeTeams = useMutation(api.teams.mergeTeams);
  const publishAll = useMutation(api.teams.publishAll);
  const setParticipantPlaced = useMutation(api.teams.setParticipantPlaced);
  const removeReservedMember = useMutation(api.units.removeReservedMember);
  const saveJudging = useMutation(api.submissions.saveJudging);
  const setResultsReleased = useMutation(api.submissions.setResultsReleased);
  const saveEvent = useMutation(api.eventConfig.save);
  const setPhase = useMutation(api.eventConfig.setPhase);

  const handleAdminError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "Action failed";
    if (
      message.includes("admin password") ||
      message.includes("ADMIN_PASSWORD") ||
      message.includes("Invalid admin password")
    ) {
      setAdminPassword("");
      setPasswordInput("");
      setAuthMessage(message);
      return message;
    }
    return message;
  };

  if (!adminPassword) {
    return (
      <section className="panel stack-panel">
        <div className="section-heading">
          <h1>Admin access</h1>
          <StatusBadge label="Password required" tone="warning" />
        </div>
        <p>Enter the admin password to open the control room. This route no longer uses Clerk auth.</p>
        <form
          className="stack-list"
          onSubmit={async (eventObject) => {
            eventObject.preventDefault();
            setAuthMessage(null);
            const status = await convex.query(api.eventConfig.validateAdminPassword, {
              adminPassword: passwordInput,
            });

            if (!status.configured) {
              setAuthMessage("Set ADMIN_PASSWORD in your environment before using the admin dashboard.");
              return;
            }

            if (!status.valid) {
              setAuthMessage("Incorrect admin password.");
              return;
            }

            setAdminPassword(passwordInput);
          }}
        >
          <label className="field">
            <span>Admin password</span>
            <input
              type="password"
              value={passwordInput}
              onChange={(eventObject) => setPasswordInput(eventObject.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Open admin
          </button>
          {authMessage ? <p className="helper-text">{authMessage}</p> : null}
        </form>
      </section>
    );
  }

  if (!dashboard) {
    return <div className="panel">Loading admin dashboard...</div>;
  }

  const eventForm = eventDraft ?? buildEventForm(dashboard.event);

  const filteredParticipants = dashboard.participants.filter((participant) => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return (
      participant.name.toLowerCase().includes(needle) ||
      participant.email.toLowerCase().includes(needle)
    );
  });

  const handleAsync = async (callback: () => Promise<unknown>, success: string) => {
    setStatusMessage(null);
    try {
      await callback();
      setStatusMessage(success);
    } catch (error) {
      setStatusMessage(handleAdminError(error));
    }
  };

  const handleSaveEvent = async (eventObject: FormEvent<HTMLFormElement>) => {
    eventObject.preventDefault();
    await handleAsync(async () => {
      await saveEvent({
        adminPassword,
        eventName: eventForm.eventName,
        location: eventForm.location,
        overview: eventForm.overview,
        registrationDeadline: fromLocalDateTime(eventForm.registrationDeadline),
        publishTime: fromLocalDateTime(eventForm.publishTime),
        submissionOpenTime: fromLocalDateTime(eventForm.submissionOpenTime),
        submissionCloseTime: fromLocalDateTime(eventForm.submissionCloseTime),
        phase: eventForm.phase,
        rules: eventForm.rulesText.split("\n").map((line) => line.trim()).filter(Boolean),
        rubric: eventForm.rubricText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, weight, description] = line.split("|");
            return {
              name: name?.trim() ?? "Untitled",
              weight: Number(weight?.trim() ?? 0),
              description: description?.trim() ?? "",
            };
          }),
        faq: eventForm.faqText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [question, answer] = line.split("|");
            return {
              question: question?.trim() ?? "Question",
              answer: answer?.trim() ?? "",
            };
          }),
      });
    }, "Event settings saved.");
  };

  const getSubmissionJudgingDraft = (submission: {
    _id: Id<"submissions">;
    judgeScore?: number;
    judgeFeedbackSummary?: string;
  }) =>
    judgingDrafts[submission._id] ?? {
      judgeScore:
        typeof submission.judgeScore === "number" ? String(submission.judgeScore) : "",
      judgeFeedbackSummary: submission.judgeFeedbackSummary ?? "",
    };

  const setSubmissionJudgingDraft = (
    submission: {
      _id: Id<"submissions">;
      judgeScore?: number;
      judgeFeedbackSummary?: string;
    },
    patch: Partial<SubmissionJudgingDraft>,
  ) => {
    setJudgingDrafts((current) => ({
      ...current,
      [submission._id]: {
        ...(current[submission._id] ?? {
          judgeScore:
            typeof submission.judgeScore === "number" ? String(submission.judgeScore) : "",
          judgeFeedbackSummary: submission.judgeFeedbackSummary ?? "",
        }),
        ...patch,
      },
    }));
  };

  const handleSaveJudging = async (submission: {
    _id: Id<"submissions">;
    judgeScore?: number;
    judgeFeedbackSummary?: string;
  }) => {
    const draft = getSubmissionJudgingDraft(submission);
    const judgeScore = Number(draft.judgeScore);
    const judgeFeedbackSummary = draft.judgeFeedbackSummary.trim();

    if (!Number.isFinite(judgeScore) || judgeScore < 0 || judgeScore > 100) {
      setStatusMessage("Judge score must be a number between 0 and 100.");
      return;
    }

    if (!judgeFeedbackSummary) {
      setStatusMessage("Feedback summary is required.");
      return;
    }

    await handleAsync(
      () =>
        saveJudging({
          adminPassword,
          submissionId: submission._id,
          judgeScore,
          judgeFeedbackSummary,
        }),
      "Judging saved.",
    );
  };

  return (
    <div className="page-stack admin-page">
      <section className="panel hero-panel compact">
        <div>
          <p className="eyebrow">Admin Control Room</p>
          <h1>{dashboard.event.eventName}</h1>
          <p>{dashboard.event.overview}</p>
          <p className="admin-hero-hint">
            Use the sections below in order: fix registration groups, run the matcher, adjust draft teams, then publish.
          </p>
        </div>
        <div className="stack-list tight">
          <button className="primary-button" type="button" onClick={() => handleAsync(() => runMatching({ adminPassword }), "Matcher completed.")}>
            Run matcher
          </button>
          <button className="secondary-button" type="button" onClick={() => handleAsync(() => publishAll({ adminPassword }), "Teams published.")}>
            Publish all teams
          </button>
          <button
            className="mini-button"
            type="button"
            onClick={() => {
              setAdminPassword("");
              setPasswordInput("");
              setAuthMessage(null);
            }}
          >
            Lock admin
          </button>
          <div className="phase-buttons">
            {EVENT_PHASES.map((phase) => (
              <button
                key={phase}
                className={`mini-button ${dashboard.event.phase === phase ? "active" : ""}`}
                type="button"
                onClick={() =>
                  handleAsync(
                    () => setPhase({ adminPassword, phase }),
                    `Phase set to ${PHASE_LABELS[phase]}.`,
                  )
                }
              >
                {PHASE_LABELS[phase]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {statusMessage ? <div className="panel helper-text">{statusMessage}</div> : null}

      <section className="panel admin-guide">
        <h2 className="admin-guide-title">How this dashboard is laid out</h2>
        <ol className="admin-guide-steps">
          <li>
            <strong>Reserved units (left)</strong> — Registration groups: solo signups or friend groups who asked to stay
            together. The matcher treats each unit as one block (when status is ready and there is no conflict).
          </li>
          <li>
            <strong>Participants (left)</strong> — Everyone who signed up. Drag a row into a draft team card on the right,
            or use actions to split or mark someone as already placed.
          </li>
          <li>
            <strong>Draft teams (right)</strong> — Output after you run the matcher, or teams you created manually. Lock when
            happy, merge duplicates, then publish all.
          </li>
          <li>
            <strong>Event settings (right)</strong> — Copy, deadlines, and phase labels participants see on the site.
          </li>
        </ol>
      </section>

      <section className="stats-grid">
        <div className="panel stat-card"><span>Registered</span><strong>{dashboard.overview.registered}</strong></div>
        <div className="panel stat-card"><span>Pending</span><strong>{dashboard.overview.pending}</strong></div>
        <div className="panel stat-card"><span>Ready</span><strong>{dashboard.overview.ready}</strong></div>
        <div className="panel stat-card"><span>Drafts</span><strong>{dashboard.overview.matched}</strong></div>
        <div className="panel stat-card"><span>Published</span><strong>{dashboard.overview.published}</strong></div>
        <div className="panel stat-card">
          <span title="Registration groups where the same email is listed on more than one unit">Unit conflicts</span>
          <strong>{dashboard.overview.conflicts}</strong>
        </div>
      </section>
      <p className="stats-legend">
        <strong>Ready</strong> (stat above) counts registration groups that are fully registered with no conflict — not
        the same as “Registered” people. <strong>Drafts</strong> is non-published team rows.
      </p>

      <section className="two-column-layout admin-columns">
        <div className="stack-list">
          <section className="panel stack-panel">
            <div className="section-heading">
              <h2>Participants</h2>
              <input className="search-input" placeholder="Search by name or email" value={search} onChange={(eventObject) => setSearch(eventObject.target.value)} />
            </div>
            <p className="section-hint">Drag a participant onto a draft team card to move them. “New team” creates an empty draft.</p>
            <div className="stack-list compact-scroll">
              {filteredParticipants.map((participant) => (
                <div className="participant-row" draggable key={participant._id} onDragStart={() => setDraggedParticipantId(participant._id)}>
                  <div>
                    <strong>{participant.name}</strong>
                    <p>{participant.email}</p>
                    <p>{formatParticipantSummary(participant)}</p>
                  </div>
                  <div className="stack-list tight align-end">
                    <StatusBadge label={participant.teamNumber ? `Team ${participant.teamNumber}` : participant.teamStatus ?? "Unplaced"} tone={participant.teamStatus === "published" ? "success" : "warning"} />
                    <div className="inline-actions">
                      <button className="mini-button" type="button" onClick={() => handleAsync(() => moveParticipant({ adminPassword, participantId: participant._id, targetTeamId: null }), "Moved to a new manual team.")}>
                        New team
                      </button>
                      <button className="mini-button" type="button" onClick={() => handleAsync(() => setParticipantPlaced({ adminPassword, participantId: participant._id, placed: !participant.excludedFromMatching }), participant.excludedFromMatching ? "Participant returned to matching." : "Participant excluded from matching.") }>
                        {participant.excludedFromMatching ? "Unplace" : "Mark placed"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stack-panel">
            <div className="section-heading">
              <h2>Reserved units</h2>
              <StatusBadge label={`${dashboard.units.length} groups`} tone="neutral" />
            </div>
            <div className="admin-callout">
              <p>
                <strong>What this is:</strong> When registrants list teammates, they form a <em>unit</em> so matching can
                keep them on the same team. Solo signups are a one-person unit. Status updates as people finish
                registration.
              </p>
              <p>
                <strong>Conflicts:</strong> The same email appears on more than one unit (for example, two friend groups
                both listed the same person). Matching is blocked for those units until you remove the wrong listing with{" "}
                <strong>Remove</strong> on one of the groups — keep the listing that matches who should actually be
                together.
              </p>
            </div>
            <div className="stack-list compact-scroll">
              {dashboard.units.map((unit) => {
                const statusKey = unit.status as keyof typeof UNIT_STATUS_LABELS;
                const statusLabel = UNIT_STATUS_LABELS[statusKey] ?? unit.status.replaceAll("_", " ");
                const statusHelp = UNIT_STATUS_HELP[statusKey] ?? "";
                const conflictDetails = unit.conflictDetails ?? [];
                return (
                  <div className={`team-card ${unit.status === "conflict" ? "unit-card-conflict" : ""}`} key={unit._id}>
                    <div className="section-heading">
                      <div>
                        <h3>{unit.source === "solo" ? "Solo unit" : "Friend group"}</h3>
                        <p className="unit-status-help">{statusHelp}</p>
                      </div>
                      <div className="stack-list tight align-end">
                        <StatusBadge
                          label={statusLabel}
                          tone={
                            unit.status === "conflict"
                              ? "danger"
                              : unit.status === "ready"
                                ? "success"
                                : unit.status === "placed"
                                  ? "info"
                                  : "warning"
                          }
                        />
                      </div>
                    </div>
                    {unit.status === "conflict" && conflictDetails.length > 0 ? (
                      <div className="admin-conflict-banner">
                        <strong>Overlapping email(s):</strong>
                        <ul>
                          {conflictDetails.map((row) => (
                            <li key={row.email}>
                              <code className="email-chip">{row.email}</code> also listed on{" "}
                              {row.otherUnitIds.map((id) => describeOtherUnit(id, dashboard.units)).join("; ")}. Remove this
                              person from every group but the one that should win.
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="stack-list tight">
                      {unit.members.map((member) => (
                        <div className="inline-row" key={member.email}>
                          <div>
                            <strong>{member.name ?? member.email}</strong>
                            <p>{member.email}</p>
                          </div>
                          <div className="inline-actions">
                            <StatusBadge label={member.registered ? "Registered" : "Pending"} tone={member.registered ? "success" : "warning"} />
                            {unit.members.length > 1 ? (
                              <button
                                className="mini-button"
                                type="button"
                                onClick={() =>
                                  handleAsync(
                                    () => removeReservedMember({ adminPassword, unitId: unit._id, email: member.email }),
                                    "Removed from this unit; claims refreshed.",
                                  )
                                }
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="stack-list">
          <section className="panel stack-panel">
            <div className="section-heading">
              <h2>Draft teams</h2>
              <StatusBadge label={`${dashboard.teams.length} teams`} tone="info" />
            </div>
            <p className="section-hint">
              Drop participants here from the list on the left. Locked teams stay fixed when you re-run the matcher (if
              your workflow uses that). Publish when all teams are final.
            </p>
            <div className="team-board">
              {dashboard.teams.map((team) => (
                <div
                  className="team-card droppable"
                  key={team._id}
                  onDragOver={(eventObject) => eventObject.preventDefault()}
                  onDrop={() => {
                    if (!draggedParticipantId) {
                      return;
                    }
                    void handleAsync(() => moveParticipant({ adminPassword, participantId: draggedParticipantId, targetTeamId: team._id }), "Participant moved.");
                    setDraggedParticipantId(null);
                  }}
                >
                  <div className="section-heading">
                    <div>
                      <h3>{team.teamNumber ? `Team ${team.teamNumber}` : `Draft ${team._id.slice(-4)}`}</h3>
                      <p>{team.matchScore ? `Score ${team.matchScore}` : "Manual / unscored"}</p>
                    </div>
                    <div className="inline-actions">
                      <StatusBadge label={team.status} tone={team.status === "published" ? "success" : team.status === "flagged" ? "warning" : "info"} />
                      <button className="mini-button" type="button" onClick={() => handleAsync(() => setTeamLocked({ adminPassword, teamId: team._id, locked: !team.locked }), team.locked ? "Team unlocked." : "Team locked.")}>
                        {team.locked ? "Unlock" : "Lock"}
                      </button>
                    </div>
                  </div>
                  {team.flags.length > 0 ? (
                    <div className="tag-list">
                      {team.flags.map((flag) => (
                        <StatusBadge key={flag} label={flag} tone="warning" />
                      ))}
                    </div>
                  ) : null}
                  <div className="stack-list tight">
                    {team.members.map((member) => (
                      <div className="member-card" draggable key={member._id} onDragStart={() => setDraggedParticipantId(member._id)}>
                        <div>
                          <strong>{member.name}</strong>
                          <p>{member.email}</p>
                        </div>
                        <div className="member-meta">
                          <span>{formatParticipantSummary(member)}</span>
                          <button className="mini-button" type="button" onClick={() => handleAsync(() => moveParticipant({ adminPassword, participantId: member._id, targetTeamId: null }), "Participant moved into a new manual team.")}>
                            Split out
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="inline-actions wrap">
                    {dashboard.teams.filter((candidate) => candidate._id !== team._id).slice(0, 4).map((candidate) => (
                      <button className="mini-button" key={candidate._id} type="button" onClick={() => handleAsync(() => mergeTeams({ adminPassword, sourceTeamId: team._id, targetTeamId: candidate._id }), "Teams merged.")}>
                        Merge into {candidate.teamNumber ? `Team ${candidate.teamNumber}` : candidate._id.slice(-4)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stack-panel">
            <div className="section-heading">
              <h2>Submissions &amp; judging</h2>
              <StatusBadge label={`${dashboard.submissions.length} submissions`} tone="info" />
            </div>
            <p className="section-hint">
              Save a manual score and summary first, then release the result when you want the team
              to see it in their dashboard.
            </p>
            <div className="stack-list compact-scroll">
              {dashboard.submissions.length === 0 ? (
                <p>No submissions yet.</p>
              ) : (
                dashboard.submissions.map((submission) => {
                  const draft = getSubmissionJudgingDraft(submission);
                  const hasSavedJudging =
                    typeof submission.judgeScore === "number" &&
                    Boolean(submission.judgeFeedbackSummary?.trim());
                  const statusLabel = submission.resultsReleasedAt
                    ? "Released"
                    : hasSavedJudging
                      ? "Scored, not released"
                      : "No score";
                  const statusTone = submission.resultsReleasedAt
                    ? "success"
                    : hasSavedJudging
                      ? "warning"
                      : "neutral";

                  return (
                    <div className="team-card" key={submission._id}>
                      <div className="section-heading">
                        <div>
                          <h3>
                            {submission.teamNumber
                              ? `Team ${submission.teamNumber}`
                              : `Team …${submission.teamId.slice(-4)}`}
                          </h3>
                          <p>{submission.title}</p>
                        </div>
                        <StatusBadge label={statusLabel} tone={statusTone} />
                      </div>

                      <div className="stack-list tight">
                        <div className="inline-row">
                          <span>Submitted</span>
                          <strong>{formatDateTime(new Date(submission.submittedAt).toISOString())}</strong>
                        </div>
                        <div className="inline-row">
                          <span>Last updated</span>
                          <strong>{formatDateTime(new Date(submission.updatedAt).toISOString())}</strong>
                        </div>
                        {submission.repoUrl ? (
                          <a href={submission.repoUrl} target="_blank" rel="noreferrer">
                            Repository link
                          </a>
                        ) : null}
                        {submission.demoUrl ? (
                          <a href={submission.demoUrl} target="_blank" rel="noreferrer">
                            Demo link
                          </a>
                        ) : null}
                      </div>

                      <div className="stack-list tight">
                        <label className="field">
                          <span>Judge score</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={draft.judgeScore}
                            onChange={(eventObject) =>
                              setSubmissionJudgingDraft(submission, {
                                judgeScore: eventObject.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Feedback summary</span>
                          <textarea
                            rows={4}
                            value={draft.judgeFeedbackSummary}
                            onChange={(eventObject) =>
                              setSubmissionJudgingDraft(submission, {
                                judgeFeedbackSummary: eventObject.target.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="inline-actions wrap">
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => void handleSaveJudging(submission)}
                        >
                          Save judging
                        </button>
                        <button
                          className="mini-button"
                          type="button"
                          disabled={!hasSavedJudging}
                          onClick={() =>
                            handleAsync(
                              () =>
                                setResultsReleased({
                                  adminPassword,
                                  submissionId: submission._id,
                                  released: true,
                                }),
                              "Results released to team.",
                            )
                          }
                        >
                          Release to team
                        </button>
                        <button
                          className="mini-button"
                          type="button"
                          disabled={!submission.resultsReleasedAt}
                          onClick={() =>
                            handleAsync(
                              () =>
                                setResultsReleased({
                                  adminPassword,
                                  submissionId: submission._id,
                                  released: false,
                                }),
                              "Results hidden from team.",
                            )
                          }
                        >
                          Unrelease
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel stack-panel">
            <div className="section-heading">
              <h2>Event settings</h2>
              <StatusBadge label={PHASE_LABELS[eventForm.phase]} tone="info" />
            </div>
            <form className="stack-list" onSubmit={handleSaveEvent}>
              <label className="field"><span>Event name</span><input value={eventForm.eventName} onChange={(eventObject) => setEventDraft({ ...eventForm, eventName: eventObject.target.value })} /></label>
              <label className="field"><span>Location</span><input value={eventForm.location} onChange={(eventObject) => setEventDraft({ ...eventForm, location: eventObject.target.value })} /></label>
              <label className="field"><span>Overview</span><textarea rows={4} value={eventForm.overview} onChange={(eventObject) => setEventDraft({ ...eventForm, overview: eventObject.target.value })} /></label>
              <div className="grid-two">
                <label className="field"><span>Registration deadline</span><input type="datetime-local" value={eventForm.registrationDeadline} onChange={(eventObject) => setEventDraft({ ...eventForm, registrationDeadline: eventObject.target.value })} /></label>
                <label className="field"><span>Publish time</span><input type="datetime-local" value={eventForm.publishTime} onChange={(eventObject) => setEventDraft({ ...eventForm, publishTime: eventObject.target.value })} /></label>
                <label className="field"><span>Submissions open</span><input type="datetime-local" value={eventForm.submissionOpenTime} onChange={(eventObject) => setEventDraft({ ...eventForm, submissionOpenTime: eventObject.target.value })} /></label>
                <label className="field"><span>Submissions close</span><input type="datetime-local" value={eventForm.submissionCloseTime} onChange={(eventObject) => setEventDraft({ ...eventForm, submissionCloseTime: eventObject.target.value })} /></label>
              </div>
              <label className="field"><span>Rules (one per line)</span><textarea rows={4} value={eventForm.rulesText} onChange={(eventObject) => setEventDraft({ ...eventForm, rulesText: eventObject.target.value })} /></label>
              <label className="field"><span>Rubric (`Name|Weight|Description`)</span><textarea rows={4} value={eventForm.rubricText} onChange={(eventObject) => setEventDraft({ ...eventForm, rubricText: eventObject.target.value })} /></label>
              <label className="field"><span>FAQ (`Question|Answer`)</span><textarea rows={4} value={eventForm.faqText} onChange={(eventObject) => setEventDraft({ ...eventForm, faqText: eventObject.target.value })} /></label>
              <button className="primary-button" type="submit">Save event settings</button>
            </form>
          </section>
        </div>
      </section>
    </div>
  );
}
