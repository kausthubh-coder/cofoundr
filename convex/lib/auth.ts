import { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeEmail } from "../../lib/hackathon";

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;
const HARDCODED_ADMIN_PASSWORD = "22301823";

function extractEmail(identity: { [key: string]: unknown; email?: string }) {
  const candidates = [
    identity.email,
    typeof identity.email_address === "string" ? identity.email_address : null,
    typeof identity.emailAddress === "string" ? identity.emailAddress : null,
    typeof identity.primary_email_address === "string"
      ? identity.primary_email_address
      : null,
    typeof identity.primaryEmailAddress === "string"
      ? identity.primaryEmailAddress
      : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeEmail(candidate);
    }
  }

  return null;
}

export async function requireUser(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const email = extractEmail(identity);

  return {
    identity,
    email,
    clerkUserId: identity.subject,
    name: identity.name ?? identity.preferredUsername ?? email ?? identity.subject,
  };
}

export async function requireAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  if (!adminEmail) {
    if (process.env.NODE_ENV !== "production") {
      return user;
    }
    throw new Error("Missing ADMIN_EMAIL");
  }
  if (!user.email) {
    throw new Error("Authenticated admin is missing an email address");
  }
  if (user.email !== adminEmail) {
    throw new Error("Admin access required");
  }
  return user;
}

export function getAdminPasswordStatus(password: string) {
  return {
    configured: true,
    valid: password === HARDCODED_ADMIN_PASSWORD,
  };
}

export function requireAdminPassword(password: string) {
  const status = getAdminPasswordStatus(password);
  if (!password) {
    throw new Error("Admin password required");
  }
  if (!status.valid) {
    throw new Error("Invalid admin password");
  }
}
