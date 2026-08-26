import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// Fetch a single event row for the extraction action to read.
export const getRaw = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<Doc<"events"> | null> => {
    return await ctx.db.get("events", args.eventId);
  },
});
