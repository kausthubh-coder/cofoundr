export const MAJORS = ["cs", "business"] as const;
export type Major = (typeof MAJORS)[number];

export const CS_SKILLS = [
  "frontend",
  "backend",
  "ml_ai",
  "mobile",
  "data",
] as const;
export const BUSINESS_SKILLS = [
  "marketing",
  "finance",
  "sales",
  "operations",
  "product",
] as const;
export const ALL_SKILLS = [...CS_SKILLS, ...BUSINESS_SKILLS] as const;
export type Skill = (typeof ALL_SKILLS)[number];

export const EXPERIENCE_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const WORK_STYLES = ["planner", "executor"] as const;
export type WorkStyle = (typeof WORK_STYLES)[number];

export const UNIT_STATUSES = [
  "pending_members",
  "ready",
  "placed",
  "conflict",
  "dropped",
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const TEAM_STATUSES = ["draft", "locked", "flagged", "published"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const EVENT_PHASES = [
  "registration_open",
  "matching_review",
  "teams_published",
  "submissions_open",
  "submissions_closed",
] as const;
export type EventPhase = (typeof EVENT_PHASES)[number];

export const TEAMMATE_COUNT_OPTIONS = [0, 1, 2, 3] as const;

export const MAJOR_LABELS: Record<Major, string> = {
  cs: "Computer Science",
  business: "Business",
};

export const SKILL_LABELS: Record<Skill, string> = {
  frontend: "Frontend",
  backend: "Backend",
  ml_ai: "ML / AI",
  mobile: "Mobile",
  data: "Data",
  marketing: "Marketing",
  finance: "Finance",
  sales: "Sales",
  operations: "Operations",
  product: "Product",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const WORK_STYLE_LABELS: Record<WorkStyle, string> = {
  planner: "Planner",
  executor: "Executor",
};

export const PHASE_LABELS: Record<EventPhase, string> = {
  registration_open: "Registration Open",
  matching_review: "Matching Review",
  teams_published: "Teams Published",
  submissions_open: "Submissions Open",
  submissions_closed: "Submissions Closed",
};

export type RubricItem = {
  name: string;
  description: string;
  weight: number;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type PublicEventConfig = {
  eventName: string;
  location: string;
  overview: string;
  rules: string[];
  rubric: RubricItem[];
  faq: FaqItem[];
  registrationDeadline: string;
  publishTime: string;
  submissionOpenTime: string;
  submissionCloseTime: string;
  phase: EventPhase;
};

export const DEFAULT_EVENT_CONFIG: PublicEventConfig = {
  eventName: "Cofoundr Hackathon",
  location: "Main Campus Innovation Hall",
  overview:
    "Build a startup-ready concept with a balanced team of builders and operators. The app handles signups, matching, team publication, and submissions for one focused event.",
  rules: [
    "Teams should target four people with a 2 CS / 2 Business balance when possible.",
    "One submission per team is required before the submission window closes.",
    "Keep teammate reservations accurate so matching and publishing stay clean.",
  ],
  rubric: [
    {
      name: "Problem Clarity",
      description: "Explain the user pain and why the opportunity matters.",
      weight: 30,
    },
    {
      name: "Execution",
      description: "Demonstrate product quality, feasibility, and completeness.",
      weight: 40,
    },
    {
      name: "Business Case",
      description: "Show market reasoning, differentiation, and go-to-market thinking.",
      weight: 30,
    },
  ],
  faq: [
    {
      question: "Can I register before I know my full team?",
      answer:
        "Yes. Register solo or reserve teammates by email. The admin team can still adjust edge cases before publishing.",
    },
    {
      question: "Can teams be uneven?",
      answer:
        "Yes. The matcher targets 4-person teams, but flagged edge cases can still be published when attendance is uneven.",
    },
    {
      question: "Can we edit our submission later?",
      answer:
        "Yes. Any team member can update the submission while the submission phase is open.",
    },
  ],
  registrationDeadline: "2026-01-15T17:00:00.000Z",
  publishTime: "2026-01-15T18:00:00.000Z",
  submissionOpenTime: "2026-01-15T19:00:00.000Z",
  submissionCloseTime: "2026-01-16T20:00:00.000Z",
  phase: "registration_open",
};

export const EVENT_MILESTONES = [
  { key: "registrationDeadline", label: "Registration closes" },
  { key: "publishTime", label: "Teams published" },
  { key: "submissionOpenTime", label: "Submissions open" },
  { key: "submissionCloseTime", label: "Submissions close" },
] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function uniqueEmails(emails: string[]) {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}

export function skillOptionsForMajor(major: Major) {
  return major === "cs" ? CS_SKILLS : BUSINESS_SKILLS;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
