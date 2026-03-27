import { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_EVENT_CONFIG } from "../../lib/hackathon";

type ReadCtx = QueryCtx | MutationCtx;

export async function getEventConfigOrDefault(ctx: ReadCtx) {
  const eventConfig = await ctx.db
    .query("eventConfig")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();

  if (!eventConfig) {
    return {
      _id: null,
      ...DEFAULT_EVENT_CONFIG,
    };
  }

  return eventConfig;
}
