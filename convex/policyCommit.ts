import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import {
  commitPolicy,
  verifyCommitment,
  type PolicyRule,
  type PolicyCommitment,
} from "./lib/policyCommitment";

const commitmentValidator = v.object({
  version: v.number(),
  commit: v.string(),
  nonce: v.string(),
  prev: v.union(v.string(), v.null()),
});

// Commit the signed-in user's CURRENT policy as the next version in their
// governance chain. This runs in an ACTION, not a mutation, because it generates
// a random nonce — a mutation must be deterministic. The action reads state,
// does the crypto, then persists through an internal mutation. No-ops if the
// policy is unchanged since the last commitment (governance didn't move).
export const commitCurrent = action({
  args: {},
  returns: v.union(commitmentValidator, v.null()),
  handler: async (ctx): Promise<PolicyCommitment | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await commitForUser(ctx, userId);
  },
});

// Same commit, but for an explicit user — scheduled from policy.save so a change
// auto-commits without the user clicking anything (a scheduled action has no
// auth identity, so the userId is passed in).
export const commitOnSave = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await commitForUser(ctx, args.userId);
    return null;
  },
});

// Shared logic: append a new committed version if governance actually changed.
async function commitForUser(
  ctx: { runQuery: any; runMutation: any },
  userId: Id<"users">,
): Promise<PolicyCommitment | null> {
  const rules = (await ctx.runQuery(internal.policyCommit.rulesFor, {
    userId,
  })) as PolicyRule[];
  const latest = (await ctx.runQuery(internal.policyCommit.latestFor, {
    userId,
  })) as PolicyCommitment | null;

  // Unchanged governance → no new version. If the current rules verify against
  // the latest commitment, nothing moved.
  if (latest && (await verifyCommitment(rules, latest))) return null;

  const next = await commitPolicy(rules, latest);
  await ctx.runMutation(internal.policyCommit.store, {
    userId,
    version: next.version,
    commit: next.commit,
    nonce: next.nonce,
    prev: next.prev,
  });
  return next;
}

// The user's current rules (internal — read by the action).
export const rulesFor = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
      .catch(() => null);
    return row?.rules ?? [];
  },
});

// The latest commitment in the user's chain (internal).
export const latestFor = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(commitmentValidator, v.null()),
  handler: async (ctx, args): Promise<PolicyCommitment | null> => {
    const rows = await ctx.db
      .query("policyCommitments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (rows.length === 0) return null;
    const top = rows.reduce((a, b) => (b.version > a.version ? b : a));
    return { version: top.version, commit: top.commit, nonce: top.nonce, prev: top.prev };
  },
});

// Persist a commitment (internal — called by the action).
export const store = internalMutation({
  args: {
    userId: v.id("users"),
    version: v.number(),
    commit: v.string(),
    nonce: v.string(),
    prev: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.insert("policyCommitments", { ...args, at: Date.now() });
    return null;
  },
});

// The full governance chain for the signed-in user, oldest first. Public: the
// commitments reveal nothing about the rules, only that governance is intact and
// when it changed.
export const chain = query({
  args: {},
  returns: v.array(commitmentValidator),
  handler: async (ctx): Promise<PolicyCommitment[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("policyCommitments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => a.version - b.version)
      .map((r) => ({
        version: r.version,
        commit: r.commit,
        nonce: r.nonce,
        prev: r.prev,
      }));
  },
});
