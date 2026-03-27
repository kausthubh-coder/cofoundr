import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdminPassword } from "./lib/auth";
import { removeEmailFromUnit } from "./lib/units";

export const removeReservedMember = mutation({
  args: {
    adminPassword: v.string(),
    unitId: v.id("registrationUnits"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdminPassword(args.adminPassword);
    await removeEmailFromUnit(ctx, args.unitId, args.email);
    return args.unitId;
  },
});
