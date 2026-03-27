/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEFAULT_EVENT_CONFIG } from "../lib/hackathon";

const modules = import.meta.glob("./**/*.ts");

const createTest = () => convexTest(schema, modules);

type TestInstance = ReturnType<typeof createTest>;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "secret";
});

async function seedBaseData(t: TestInstance) {
  const teamId = await t.run(async (ctx) => {
    return await ctx.db.insert("teams", {
      participantIds: [],
      status: "published",
      locked: true,
      origin: "manual",
      publishedAt: Date.now(),
      teamNumber: 1,
      flags: [],
    });
  });

  const participantId = await t.run(async (ctx) => {
    return await ctx.db.insert("participants", {
      clerkUserId: "clerk-user-1",
      email: "team@example.com",
      name: "Team Member",
      requestedTeammateEmails: [],
      registrationComplete: true,
      excludedFromMatching: false,
      unitId: null,
      teamId,
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(teamId, {
      participantIds: [participantId],
    });

    await ctx.db.insert("eventConfig", {
      key: "default",
      ...DEFAULT_EVENT_CONFIG,
      phase: "submissions_open",
    });
  });

  return { teamId, participantId };
}

async function seedSubmission(
  t: TestInstance,
  values: {
    teamId: Id<"teams">;
    participantId: Id<"participants">;
    judgeScore?: number;
    judgeFeedbackSummary?: string;
    judgedAt?: number;
    resultsReleasedAt?: number;
    judgedByLabel?: string;
    resultsReleasedByLabel?: string;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("submissions", {
      teamId: values.teamId,
      title: "Original title",
      description: "Original description",
      repoUrl: "https://github.com/example/original",
      demoUrl: "https://example.com/demo",
      metadata: {
        deckUrl: "https://example.com/deck",
        notes: "Original notes",
        techStack: "Next.js, Convex",
      },
      submittedByParticipantId: values.participantId,
      submittedAt: 1,
      updatedAt: 1,
      judgeScore: values.judgeScore,
      judgeFeedbackSummary: values.judgeFeedbackSummary,
      judgedAt: values.judgedAt,
      resultsReleasedAt: values.resultsReleasedAt,
      judgedByLabel: values.judgedByLabel,
      resultsReleasedByLabel: values.resultsReleasedByLabel,
    });
  });
}

test("participant upsert preserves judging fields", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, {
    teamId,
    participantId,
    judgeScore: 95,
    judgeFeedbackSummary: "Strong execution and clear business case.",
    judgedAt: 10,
    resultsReleasedAt: 20,
    judgedByLabel: "Admin",
    resultsReleasedByLabel: "Admin",
  });

  await t.withIdentity({
    subject: "clerk-user-1",
    email: "team@example.com",
    name: "Team Member",
  }).mutation(api.submissions.upsert, {
    title: "Updated title",
    description: "Updated description",
    repoUrl: "https://github.com/example/updated",
    demoUrl: "https://example.com/new-demo",
    metadata: {
      deckUrl: "https://example.com/new-deck",
      notes: "Updated notes",
      techStack: "Next.js, Convex, Clerk",
    },
  });

  const stored = await t.run(async (ctx) => await ctx.db.get(submissionId));
  expect(stored).toMatchObject({
    title: "Updated title",
    description: "Updated description",
    judgeScore: 95,
    judgeFeedbackSummary: "Strong execution and clear business case.",
    judgedAt: 10,
    resultsReleasedAt: 20,
    judgedByLabel: "Admin",
    resultsReleasedByLabel: "Admin",
  });
});

test("admin can save judging", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });

  await t.mutation(api.submissions.saveJudging, {
    adminPassword: "secret",
    submissionId,
    judgeScore: 88.5,
    judgeFeedbackSummary: "  Strong concept with a concise demo.  ",
  });

  const stored = await t.run(async (ctx) => await ctx.db.get(submissionId));
  expect(stored).toMatchObject({
    judgeScore: 88.5,
    judgeFeedbackSummary: "Strong concept with a concise demo.",
    judgedByLabel: "Admin",
  });
  expect(stored?.judgedAt).toEqual(expect.any(Number));
});

test("save judging rejects invalid score", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });

  await expect(
    t.mutation(api.submissions.saveJudging, {
      adminPassword: "secret",
      submissionId,
      judgeScore: 120,
      judgeFeedbackSummary: "Too high.",
    }),
  ).rejects.toThrow("Judge score must be a number between 0 and 100");
});

test("save judging rejects blank feedback", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });

  await expect(
    t.mutation(api.submissions.saveJudging, {
      adminPassword: "secret",
      submissionId,
      judgeScore: 90,
      judgeFeedbackSummary: "   ",
    }),
  ).rejects.toThrow("Feedback summary is required");
});

test("release requires judging data", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });

  await expect(
    t.mutation(api.submissions.setResultsReleased, {
      adminPassword: "secret",
      submissionId,
      released: true,
    }),
  ).rejects.toThrow("Save a score and feedback summary before releasing results");
});

test("participant query hides unreleased judging and shows released judging", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });
  const participantApi = t.withIdentity({
    subject: "clerk-user-1",
    email: "team@example.com",
    name: "Team Member",
  });

  await t.mutation(api.submissions.saveJudging, {
    adminPassword: "secret",
    submissionId,
    judgeScore: 84,
    judgeFeedbackSummary: "Promising prototype with clear next steps.",
  });

  const hiddenResult = await participantApi.query(api.teams.getMine, {});
  expect(hiddenResult.submission?.judging).toMatchObject({
    status: "pending_release",
    score: null,
    feedbackSummary: null,
    releasedAt: null,
  });

  await t.mutation(api.submissions.setResultsReleased, {
    adminPassword: "secret",
    submissionId,
    released: true,
  });

  const releasedResult = await participantApi.query(api.teams.getMine, {});
  expect(releasedResult.submission?.judging).toMatchObject({
    status: "released",
    score: 84,
    feedbackSummary: "Promising prototype with clear next steps.",
  });
  expect(releasedResult.submission?.judging.releasedAt).toEqual(expect.any(Number));
});

test("unrelease clears visibility marker but keeps judging data", async () => {
  const t = createTest();
  const { teamId, participantId } = await seedBaseData(t);
  const submissionId = await seedSubmission(t, { teamId, participantId });
  const participantApi = t.withIdentity({
    subject: "clerk-user-1",
    email: "team@example.com",
    name: "Team Member",
  });

  await t.mutation(api.submissions.saveJudging, {
    adminPassword: "secret",
    submissionId,
    judgeScore: 91,
    judgeFeedbackSummary: "Strong story and polished handoff.",
  });
  await t.mutation(api.submissions.setResultsReleased, {
    adminPassword: "secret",
    submissionId,
    released: true,
  });
  await t.mutation(api.submissions.setResultsReleased, {
    adminPassword: "secret",
    submissionId,
    released: false,
  });

  const stored = await t.run(async (ctx) => await ctx.db.get(submissionId));
  expect(stored).toMatchObject({
    judgeScore: 91,
    judgeFeedbackSummary: "Strong story and polished handoff.",
  });
  expect(stored).not.toHaveProperty("resultsReleasedAt");
  expect(stored).not.toHaveProperty("resultsReleasedByLabel");

  const hiddenResult = await participantApi.query(api.teams.getMine, {});
  expect(hiddenResult.submission?.judging).toMatchObject({
    status: "pending_release",
    score: null,
    feedbackSummary: null,
    releasedAt: null,
  });
});
