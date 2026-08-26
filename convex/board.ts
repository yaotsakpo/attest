import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc } from "./_generated/dataModel";

// The signed-in user's pipeline cards. Auth-scoped: identity is derived
// server-side, never accepted as an argument. Returns [] when signed out so the
// client renders an empty board rather than throwing.
export const myApplications = query({
  args: {},
  handler: async (ctx): Promise<Doc<"applications">[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
  },
});
