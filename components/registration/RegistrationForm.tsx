"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CS_SKILLS,
  BUSINESS_SKILLS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  MAJOR_LABELS,
  TEAMMATE_COUNT_OPTIONS,
  WORK_STYLE_LABELS,
  WORK_STYLES,
  formatDateTime,
  type Skill,
} from "@/lib/hackathon";
import StatusBadge from "@/components/ui/StatusBadge";

type FormState = {
  name: string;
  major: "cs" | "business";
  skills: Skill[];
  experienceLevel: "beginner" | "intermediate" | "advanced";
  workStyle: "planner" | "executor";
  teammateCount: number;
  requestedTeammateEmails: string[];
};

const DEFAULT_FORM: FormState = {
  name: "",
  major: "cs",
  skills: [],
  experienceLevel: "beginner",
  workStyle: "planner",
  teammateCount: 0,
  requestedTeammateEmails: [],
};

function toneForUnitStatus(status: string) {
  switch (status) {
    case "ready":
      return "success";
    case "conflict":
      return "danger";
    case "placed":
      return "info";
    default:
      return "warning";
  }
}

export default function RegistrationForm({
  viewerEmail,
  viewerName,
}: {
  viewerEmail: string;
  viewerName: string;
}) {
  const router = useRouter();
  const registrationState = useQuery(api.participants.getRegistrationState, {
    emailHint: viewerEmail,
    nameHint: viewerName,
  });
  const event = useQuery(api.eventConfig.getPublic, {});
  const saveRegistration = useMutation(api.participants.saveRegistration);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [teammateSearch, setTeammateSearch] = useState("");
  const teammateCandidates = useQuery(api.participants.searchTeammates, {
    search: teammateSearch,
  });

  useEffect(() => {
    const participant = registrationState?.participant;
    if (!participant) {
      return;
    }

    setForm({
      name: participant.name,
      major: participant.major ?? "cs",
      skills: participant.skills ?? [],
      experienceLevel: participant.experienceLevel ?? "beginner",
      workStyle: participant.workStyle ?? "planner",
      teammateCount: participant.teammateCount ?? 0,
      requestedTeammateEmails: participant.requestedTeammateEmails ?? [],
    });
  }, [registrationState]);

  if (!registrationState || !event) {
    return <div className="panel">Loading registration...</div>;
  }

  const currentSkills =
    form.major === "cs" ? [...CS_SKILLS] : [...BUSINESS_SKILLS];

  const unitStatusByEmail = new Map(
    (registrationState.unit?.memberStatuses ?? []).map((member) => [member.email, member]),
  );
  const candidateByEmail = new Map(
    (teammateCandidates ?? []).map((candidate) => [candidate.email, candidate]),
  );

  const updateSkill = (skill: Skill) => {
    setForm((current) => {
      const hasSkill = current.skills.includes(skill);
      if (hasSkill) {
        return {
          ...current,
          skills: current.skills.filter((item) => item !== skill),
        };
      }
      if (current.skills.length >= 2) {
        return current;
      }
      return {
        ...current,
        skills: [...current.skills, skill],
      };
    });
  };

  const handleSubmit = async (eventObject: FormEvent<HTMLFormElement>) => {
    eventObject.preventDefault();
    const selectedTeammates = form.requestedTeammateEmails.filter(Boolean);
    if (selectedTeammates.length !== form.teammateCount) {
      setMessage("Choose the same number of teammates as your selected teammate count.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await saveRegistration({
        emailHint: viewerEmail,
        ...form,
        requestedTeammateEmails: selectedTeammates,
      });
      setMessage("Registration saved. Redirecting to your dashboard...");
      router.push("/app");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save registration");
    } finally {
      setSaving(false);
    }
  };

  const addTeammate = (email: string) => {
    setForm((current) => {
      if (current.requestedTeammateEmails.includes(email)) {
        return current;
      }
      if (current.requestedTeammateEmails.length >= current.teammateCount) {
        return current;
      }
      return {
        ...current,
        requestedTeammateEmails: [...current.requestedTeammateEmails, email],
      };
    });
    setTeammateSearch("");
  };

  const removeTeammate = (email: string) => {
    setForm((current) => ({
      ...current,
      requestedTeammateEmails: current.requestedTeammateEmails.filter(
        (selectedEmail) => selectedEmail !== email,
      ),
    }));
  };

  const unit = registrationState.unit;
  const registrationLocked = Boolean(registrationState.participant.teamId);
  const isAlreadyRegistered = Boolean(registrationState.participant.registrationComplete);

  return (
    <div className="page-stack">
      <section className="panel hero-panel compact">
        <div>
          <p className="eyebrow">
            {isAlreadyRegistered ? "Your Registration" : "Register"}
          </p>
          <h1>
            {registrationLocked
              ? "You're placed."
              : isAlreadyRegistered
                ? "Profile saved."
                : "Secure your spot."}
          </h1>
          <p style={{ marginTop: "0.6rem" }}>
            {registrationLocked
              ? "Your team has been finalised. No further changes can be made."
              : isAlreadyRegistered
                ? "You\u2019re registered. Update your details below if anything changes before the deadline."
                : "Fill in your profile to complete your registration."}
          </p>
        </div>
        <div className="meta-grid">
          <div>
            <span>Registration deadline</span>
            <strong>{formatDateTime(event.registrationDeadline)}</strong>
          </div>
          <div>
            <span>Your status</span>
            <StatusBadge
              label={
                registrationLocked
                  ? "Placed"
                  : isAlreadyRegistered
                    ? "Registered"
                    : "Not registered"
              }
              tone={
                registrationLocked
                  ? "info"
                  : isAlreadyRegistered
                    ? "success"
                    : "warning"
              }
            />
          </div>
        </div>
      </section>

      <section className="two-column-layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          {isAlreadyRegistered && !registrationLocked ? (
            <div className="reg-success-banner">
              <span>&#10003;</span>
              <span>You&apos;re registered &mdash; your profile is saved below.</span>
            </div>
          ) : null}
          <div className="section-heading">
            <h2>Your profile</h2>
            {registrationLocked ? (
              <StatusBadge label="Locked after placement" tone="info" />
            ) : null}
          </div>

          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(eventObject) =>
                setForm((current) => ({ ...current, name: eventObject.target.value }))
              }
              disabled={registrationLocked}
              required
            />
          </label>

          <div className="field">
            <span>Email</span>
            <div className="readonly-value">
              {registrationState.participant.email || viewerEmail}
            </div>
          </div>

          <div className="choice-grid">
            {(["cs", "business"] as const).map((major) => (
              <button
                key={major}
                className={`choice-card ${form.major === major ? "selected" : ""}`}
                type="button"
                disabled={registrationLocked}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    major,
                    skills: [],
                  }))
                }
              >
                <strong>{MAJOR_LABELS[major]}</strong>
              </button>
            ))}
          </div>

          <div className="field">
            <span>Skills (pick up to 2)</span>
            <div className="pill-grid">
              {currentSkills.map((skill) => (
                <button
                  key={skill}
                  className={`pill-button ${form.skills.includes(skill) ? "active" : ""}`}
                  type="button"
                  disabled={registrationLocked}
                  onClick={() => updateSkill(skill)}
                >
                  {skill.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="choice-grid triple">
            {EXPERIENCE_LEVELS.map((experienceLevel) => (
              <button
                key={experienceLevel}
                className={`choice-card ${
                  form.experienceLevel === experienceLevel ? "selected" : ""
                }`}
                type="button"
                disabled={registrationLocked}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    experienceLevel,
                  }))
                }
              >
                <strong>{EXPERIENCE_LABELS[experienceLevel]}</strong>
              </button>
            ))}
          </div>

          <div className="choice-grid dual">
            {WORK_STYLES.map((workStyle) => (
              <button
                key={workStyle}
                className={`choice-card ${form.workStyle === workStyle ? "selected" : ""}`}
                type="button"
                disabled={registrationLocked}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    workStyle,
                  }))
                }
              >
                <strong>{WORK_STYLE_LABELS[workStyle]}</strong>
              </button>
            ))}
          </div>

          <label className="field">
            <span>How many teammates do you already have?</span>
            <select
              value={form.teammateCount}
              disabled={registrationLocked}
              onChange={(eventObject) => {
                const teammateCount = Number(eventObject.target.value);
                setForm((current) => ({
                  ...current,
                  teammateCount,
                  requestedTeammateEmails: current.requestedTeammateEmails.slice(0, teammateCount),
                }));
              }}
            >
              {TEAMMATE_COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count === 0 ? "I am solo right now" : `${count} teammate${count > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </label>

          {form.teammateCount > 0 ? (
            <div className="field">
              <span>Pick teammates who already signed up</span>
              <input
                className="search-input"
                placeholder="Search by name or email"
                value={teammateSearch}
                disabled={registrationLocked}
                onChange={(eventObject) => setTeammateSearch(eventObject.target.value)}
              />
              <p className="helper-text">
                Ask your teammates to sign up first, then search and add them here.
              </p>
              {form.requestedTeammateEmails.length > 0 ? (
                <div className="tag-list">
                  {form.requestedTeammateEmails.map((email) => {
                    const candidate = candidateByEmail.get(email);
                    const member = unitStatusByEmail.get(email);
                    const label = candidate?.name ?? member?.name ?? email;
                    return (
                      <button
                        key={email}
                        className="pill-button active"
                        disabled={registrationLocked}
                        type="button"
                        onClick={() => removeTeammate(email)}
                      >
                        {label} <span className="pill-subtle">Remove</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="search-results">
                {(teammateCandidates ?? [])
                  .filter((candidate) => !form.requestedTeammateEmails.includes(candidate.email))
                  .map((candidate) => (
                    <button
                      key={candidate._id}
                      className="search-result-card"
                      disabled={
                        registrationLocked ||
                        form.requestedTeammateEmails.length >= form.teammateCount
                      }
                      type="button"
                      onClick={() => addTeammate(candidate.email)}
                    >
                      <strong>{candidate.name}</strong>
                      <span>{candidate.email}</span>
                      <span>
                        {candidate.major ? MAJOR_LABELS[candidate.major] : "Participant"}
                      </span>
                    </button>
                  ))}
              </div>
              {!teammateCandidates?.length ? (
                <p className="helper-text">
                  No eligible teammates found yet. They need to finish registration before they can
                  be selected.
                </p>
              ) : null}
            </div>
          ) : null}

          <button className="primary-button" disabled={saving || registrationLocked} type="submit">
            {saving
              ? "Saving..."
              : registrationLocked
                ? "Locked"
                : isAlreadyRegistered
                  ? "Save changes"
                  : "Complete registration \u2192"}
          </button>
          {message ? <p className="helper-text">{message}</p> : null}
        </form>

        <div className="panel stack-panel">
          <div className="section-heading">
            <h2>Reservation status</h2>
            {unit ? (
              <StatusBadge label={unit.status.replaceAll("_", " ")} tone={toneForUnitStatus(unit.status)} />
            ) : null}
          </div>

          {!unit ? (
            <>
              <p>
                Once you submit your profile, a reservation unit is created for your group. If you&apos;re
                going solo, you&apos;ll be matched with compatible cofounders after registration closes.
              </p>
              <p className="helper-text">
                Complete the form on the left to create your registration unit.
              </p>
            </>
          ) : (
            <>
              <p>
                When you add signed-up teammates, the admin matcher keeps your group together. Anyone
                missing from the list still needs to register before they can be locked into your unit.
              </p>
              <div className="stack-list">
                {unit.memberStatuses.map((member) => (
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
            </>
          )}
        </div>
      </section>
    </div>
  );
}



