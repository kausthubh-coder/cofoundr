"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Countdown from "@/components/ui/Countdown";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  EVENT_MILESTONES,
  EXPERIENCE_LABELS,
  MAJOR_LABELS,
  PHASE_LABELS,
  SKILL_LABELS,
  WORK_STYLE_LABELS,
  formatDateTime,
} from "@/lib/hackathon";

type SubmissionFormState = {
  title: string;
  description: string;
  repoUrl: string;
  demoUrl: string;
  deckUrl: string;
  techStack: string;
  notes: string;
};

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const EMPTY_SUBMISSION: SubmissionFormState = {
  title: "",
  description: "",
  repoUrl: "",
  demoUrl: "",
  deckUrl: "",
  techStack: "",
  notes: "",
};

export default function ParticipantDashboard() {
  const data = useQuery(api.teams.getMine, {});
  const saveSubmission = useMutation(api.submissions.upsert);

  const [form, setForm] = useState<SubmissionFormState>(EMPTY_SUBMISSION);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.submission) {
      setForm(EMPTY_SUBMISSION);
      return;
    }

    setForm({
      title: data.submission.title,
      description: data.submission.description,
      repoUrl: data.submission.repoUrl ?? "",
      demoUrl: data.submission.demoUrl ?? "",
      deckUrl: data.submission.metadata.deckUrl ?? "",
      techStack: data.submission.metadata.techStack ?? "",
      notes: data.submission.metadata.notes ?? "",
    });
  }, [data?.submission]);

  if (!data) {
    return <div className="panel">Loading your dashboard...</div>;
  }

  const nextMilestone =
    EVENT_MILESTONES.map((milestone) => ({
      label: milestone.label,
      value: data.event[milestone.key],
    })).find((milestone) => new Date(milestone.value).getTime() > Date.now()) ??
    {
      label: "Submission archive",
      value: data.event.submissionCloseTime,
    };

  const handleSubmit = async (eventObject: FormEvent<HTMLFormElement>) => {
    eventObject.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await saveSubmission({
        title: form.title,
        description: form.description,
        repoUrl: form.repoUrl || undefined,
        demoUrl: form.demoUrl || undefined,
        metadata: {
          deckUrl: form.deckUrl || undefined,
          techStack: form.techStack || undefined,
          notes: form.notes || undefined,
        },
      });
      setMessage("Submission saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save submission");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="panel hero-panel compact">
        <div>
          <p className="eyebrow">Participant Dashboard</p>
          <h1>{data.event.eventName}</h1>
          <p>{data.event.overview}</p>
        </div>
        <div className="countdown-card">
          <span>Next milestone</span>
          <strong>{nextMilestone.label}</strong>
          <Countdown target={nextMilestone.value} />
        </div>
      </section>

      {!data.participant ? (
        <section className="panel">
          <h2>You have not registered yet.</h2>
          <p>Finish the registration form before the admin team runs matching.</p>
          <Link href="/register" className="primary-button">
            Go to registration
          </Link>
        </section>
      ) : null}

      {data.participant ? (
        <section className="two-column-layout">
          <div className="panel stack-panel">
            <div className="section-heading">
              <h2>Your status</h2>
              <StatusBadge label={PHASE_LABELS[data.event.phase]} tone="info" />
            </div>
            <div className="stack-list">
              <div className="inline-row">
                <span>Major</span>
                <strong>{data.participant.major ? MAJOR_LABELS[data.participant.major] : "TBD"}</strong>
              </div>
              <div className="inline-row">
                <span>Skills</span>
                <strong>
                  {(data.participant.skills ?? []).map((skill) => SKILL_LABELS[skill]).join(", ") || "TBD"}
                </strong>
              </div>
              <div className="inline-row">
                <span>Experience</span>
                <strong>
                  {data.participant.experienceLevel
                    ? EXPERIENCE_LABELS[data.participant.experienceLevel]
                    : "TBD"}
                </strong>
              </div>
              <div className="inline-row">
                <span>Work style</span>
                <strong>
                  {data.participant.workStyle
                    ? WORK_STYLE_LABELS[data.participant.workStyle]
                    : "TBD"}
                </strong>
              </div>
            </div>
            {data.unit ? (
              <div className="sub-panel">
                <div className="section-heading">
                  <h3>Reserved unit</h3>
                  <StatusBadge
                    label={data.unit.status.replaceAll("_", " ")}
                    tone={data.unit.status === "ready" ? "success" : "warning"}
                  />
                </div>
                <div className="stack-list">
                  {data.unit.memberStatuses.map((member) => (
                    <div className="inline-row" key={member.email}>
                      <div>
                        <strong>{member.name ?? member.email}</strong>
                        <p>{member.email}</p>
                      </div>
                      <StatusBadge
                        label={member.registered ? "Registered" : "Pending"}
                        tone={member.registered ? "success" : "warning"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel stack-panel">
            <div className="section-heading">
              <h2>Your team</h2>
              {data.team ? (
                <StatusBadge
                  label={
                    data.team.teamNumber
                      ? `Team ${data.team.teamNumber}`
                      : data.team.status.replaceAll("_", " ")
                  }
                  tone={data.team.status === "published" ? "success" : "warning"}
                />
              ) : (
                <StatusBadge label="Waiting for publish" tone="warning" />
              )}
            </div>

            {data.team ? (
              <div className="stack-list">
                {data.team.members.map((member) => (
                  <div className="member-card" key={member._id}>
                    <div>
                      <strong>{member.name}</strong>
                      <p>{member.email}</p>
                    </div>
                    <div className="member-meta">
                      <span>{member.major ? MAJOR_LABELS[member.major] : "Unassigned"}</span>
                      <span>
                        {(member.skills ?? [])
                          .map((skill) => SKILL_LABELS[skill])
                          .join(", ") || "No skills listed"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                Teams have not been published yet. Keep your registration accurate and wait for the
                admin team to finalize placements.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="two-column-layout">
        <div className="panel stack-panel">
          <div className="section-heading">
            <h2>Event timeline</h2>
            <StatusBadge label={data.event.location} tone="neutral" />
          </div>
          <div className="timeline-list">
            {EVENT_MILESTONES.map((milestone) => (
              <div className="timeline-item" key={milestone.key}>
                <strong>{milestone.label}</strong>
                <span>{formatDateTime(data.event[milestone.key])}</span>
              </div>
            ))}
          </div>
          <div className="sub-panel">
            <h3>Rubric</h3>
            {data.event.rubric.map((item) => (
              <div className="timeline-item" key={item.name}>
                <strong>
                  {item.name} ({item.weight}%)
                </strong>
                <span>{item.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stack-panel">
          <div className="section-heading">
            <h2>Submission</h2>
            <StatusBadge
              label={
                data.event.phase === "submissions_open"
                  ? "Submissions open"
                  : "Read only"
              }
              tone={data.event.phase === "submissions_open" ? "success" : "warning"}
            />
          </div>
          <form className="stack-list" onSubmit={handleSubmit}>
            <label className="field">
              <span>Project title</span>
              <input
                value={form.title}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, title: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, description: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
                required
                rows={5}
              />
            </label>
            <label className="field">
              <span>Repo URL</span>
              <input
                value={form.repoUrl}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, repoUrl: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
              />
            </label>
            <label className="field">
              <span>Demo URL</span>
              <input
                value={form.demoUrl}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, demoUrl: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
              />
            </label>
            <label className="field">
              <span>Deck URL</span>
              <input
                value={form.deckUrl}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, deckUrl: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
              />
            </label>
            <label className="field">
              <span>Tech stack</span>
              <input
                value={form.techStack}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, techStack: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, notes: eventObject.target.value }))
                }
                disabled={data.event.phase !== "submissions_open" || !data.team}
                rows={4}
              />
            </label>
            <button
              className="primary-button"
              disabled={saving || data.event.phase !== "submissions_open" || !data.team}
              type="submit"
            >
              {saving ? "Saving..." : data.submission ? "Update submission" : "Submit project"}
            </button>
            {message ? <p className="helper-text">{message}</p> : null}
          </form>

          <div className="sub-panel">
            <div className="section-heading">
              <h3>Judging</h3>
              <StatusBadge
                label={
                  !data.submission
                    ? "No submission"
                    : data.submission.judging.status === "released"
                      ? "Released"
                      : data.submission.judging.status === "pending_release"
                        ? "Pending release"
                        : "Not started"
                }
                tone={
                  !data.submission
                    ? "neutral"
                    : data.submission.judging.status === "released"
                      ? "success"
                      : data.submission.judging.status === "pending_release"
                        ? "warning"
                        : "neutral"
                }
              />
            </div>

            {!data.submission ? <p>No submission yet.</p> : null}
            {data.submission?.judging.status === "not_started" ? (
              <p>Judging has not been entered yet.</p>
            ) : null}
            {data.submission?.judging.status === "pending_release" ? (
              <p>Your results have not been released yet.</p>
            ) : null}
            {data.submission?.judging.status === "released" ? (
              <div className="stack-list">
                <div className="inline-row">
                  <span>Score</span>
                  <strong>{data.submission.judging.score} / 100</strong>
                </div>
                <div className="stack-list tight">
                  <strong>Feedback summary</strong>
                  <p>{data.submission.judging.feedbackSummary}</p>
                </div>
                {data.submission.judging.releasedAt ? (
                  <div className="inline-row">
                    <span>Released</span>
                    <strong>{formatTimestamp(data.submission.judging.releasedAt)}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
