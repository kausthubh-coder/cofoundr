import { query } from "./_generated/server";

export const placeholder = query({
  args: {},
  handler: async () => {
    return { ok: true };
  },
});
