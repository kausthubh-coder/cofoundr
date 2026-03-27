# Cofoundr

Cofoundr is a single-event hackathon operations app built with Next.js, Clerk, and Convex. It handles participant registration, teammate reservation, automatic team matching, admin review and publish flows, participant dashboards, and in-app project submissions.

This repo is scoped for one hackathon, not a multi-event platform.

## Product Summary

The app is designed around a simple event-day flow:

1. Participants scan a QR code and open the landing page.
2. They sign in with Clerk and complete a short registration form.
3. They can reserve teammates by email, which creates a pending registration unit.
4. Admins run the matcher, review flagged cases, manually adjust teams, and publish all teams.
5. Participants see their team, event timeline, rubric, and submission state in the app.
6. When submissions are open, any team member can submit or update the team project details.

## Core Features

- Public landing page for the event
- Clerk-based participant authentication
- Participant registration with:
  - name
  - email
  - major
  - skills
  - experience level
  - work style
  - teammate count
  - teammate emails
- Teammate reservation and pending group tracking
- Conflict detection when the same email is claimed by multiple groups
- Matching engine targeting 4-person teams with a 2 CS / 2 Business preference
- Admin dashboard for:
  - matching runs
  - manual moves
  - locking/unlocking teams
  - merging teams
  - removing reserved members
  - excluding participants from matching
  - publishing all teams
  - editing event settings and phase
- Participant dashboard for:
  - registration state
  - reserved unit state
  - published team roster
  - event timeline
  - rubric
  - submission form

## Tech Stack

- [Next.js 16](https://nextjs.org/) App Router
- [React 19](https://react.dev/)
- [Convex](https://convex.dev/) for database and backend logic
- [Clerk](https://clerk.com/) for authentication
- TypeScript
- Tailwind base import plus custom CSS in `app/globals.css`

## App Routes

- `/`
  - public landing page
- `/register`
  - authenticated participant registration page
- `/app`
  - authenticated participant dashboard
- `/admin`
  - password-protected admin dashboard
- `/server`
  - legacy placeholder route, not part of the main product flow

Protected participant routes are handled in `proxy.ts`. The admin route uses an app password instead of Clerk auth.

## Backend Architecture

### Convex Modules

- `convex/participants.ts`
  - `getRegistrationState`
  - `saveRegistration`
- `convex/units.ts`
  - `removeReservedMember`
- `convex/matching.ts`
  - `run`
- `convex/teams.ts`
  - `getMine`
  - `getAdminDashboard`
  - `setTeamLocked`
  - `moveParticipant`
  - `mergeTeams`
  - `publishAll`
  - `setParticipantPlaced`
- `convex/submissions.ts`
  - `upsert`
- `convex/eventConfig.ts`
  - `getPublic`
  - `getAdmin`
  - `save`
  - `setPhase`

### Shared Convex Helpers

- `convex/lib/auth.ts`
  - authenticated user lookup
  - admin email check via `ADMIN_EMAIL`
- `convex/lib/units.ts`
  - unit creation and refresh
  - teammate claim handling
  - unit status recomputation
- `convex/lib/matching.ts`
  - scoring and team proposal generation
- `convex/lib/event.ts`
  - default event config loading

## Data Model

Defined in `convex/schema.ts`.

### Tables

- `participants`
  - user profile and registration state
- `registrationUnits`
  - solo entries or reserved teammate groups
- `unitEmailClaims`
  - email-to-unit claim tracking for conflict detection
- `teams`
  - draft, flagged, locked, and published teams
- `submissions`
  - team project submission data
- `eventConfig`
  - singleton event settings and current event phase

## Matching Logic

The matcher prefers 4-person teams with:

- 2 `cs` majors
- 2 `business` majors

Scoring weights:

- skill complementarity: 40%
- experience balance: 35%
- work style balance: 25%

Fallback behavior is built in for uneven attendance:

- all-CS leftover teams
- all-Business leftover teams
- flagged teams of 3
- manual admin review for edge cases

The matching entry point is `convex/matching.ts`, with scoring and proposal construction in `convex/lib/matching.ts`.

## Auth and Access Control

Authentication is handled with Clerk and validated in Convex via `ctx.auth.getUserIdentity()`.

Admin access is intentionally simple for this MVP:

- set one environment variable: `ADMIN_PASSWORD`
- enter that password at `/admin`
- all admin Convex queries, mutations, and actions require that password

## Environment Variables

You need the standard Clerk + Convex values plus the admin allowlist email.

### Required frontend / Next.js

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### Required Convex / auth

- `CLERK_JWT_ISSUER_DOMAIN`

### App-specific

- `ADMIN_PASSWORD`

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev
```

Open the Convex dashboard manually only when you need it:

```bash
npm run dashboard
```

Useful scripts:

```bash
npm run lint
npm run build
```

Convex code generation:

```bash
npx convex codegen
```

## File Map

### Frontend

- `app/layout.tsx`
- `app/page.tsx`
- `app/register/page.tsx`
- `app/app/page.tsx`
- `app/admin/page.tsx`
- `components/landing/`
- `components/registration/`
- `components/participant/`
- `components/admin/`
- `components/ui/`
- `app/globals.css`

### Backend

- `convex/schema.ts`
- `convex/participants.ts`
- `convex/units.ts`
- `convex/matching.ts`
- `convex/teams.ts`
- `convex/submissions.ts`
- `convex/eventConfig.ts`
- `convex/lib/`

## Current Constraints

- Single hackathon only
- Single shared admin password for v1
- No judging workflow yet
- No winners page yet
- No live call-to-stage queue yet
- Matching is optimized for practical event ops, not a generalized marketplace

## Validation Status

The current implementation has been validated with:

- `npx convex codegen`
- `npm run lint`
- `npm run build`

## Notes for Future Extension

Likely next steps if the product expands:

- judging workflow and score capture
- winners page
- team call queue / live display
- email notifications
- multi-event support
- richer admin permissions
