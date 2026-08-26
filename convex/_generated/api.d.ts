/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agentmail from "../agentmail.js";
import type * as auth from "../auth.js";
import type * as board from "../board.js";
import type * as dev from "../dev.js";
import type * as enrich from "../enrich.js";
import type * as events from "../events.js";
import type * as extract from "../extract.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as lib_continuity from "../lib/continuity.js";
import type * as lib_disclosureGate from "../lib/disclosureGate.js";
import type * as lib_grade from "../lib/grade.js";
import type * as lib_policyEngine from "../lib/policyEngine.js";
import type * as lib_ruleExtract from "../lib/ruleExtract.js";
import type * as lib_senderAuth from "../lib/senderAuth.js";
import type * as lib_trustScore from "../lib/trustScore.js";
import type * as pipeline from "../pipeline.js";
import type * as policy from "../policy.js";
import type * as profiles from "../profiles.js";
import type * as registry from "../registry.js";
import type * as vault from "../vault.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agentmail: typeof agentmail;
  auth: typeof auth;
  board: typeof board;
  dev: typeof dev;
  enrich: typeof enrich;
  events: typeof events;
  extract: typeof extract;
  http: typeof http;
  inbound: typeof inbound;
  "lib/continuity": typeof lib_continuity;
  "lib/disclosureGate": typeof lib_disclosureGate;
  "lib/grade": typeof lib_grade;
  "lib/policyEngine": typeof lib_policyEngine;
  "lib/ruleExtract": typeof lib_ruleExtract;
  "lib/senderAuth": typeof lib_senderAuth;
  "lib/trustScore": typeof lib_trustScore;
  pipeline: typeof pipeline;
  policy: typeof policy;
  profiles: typeof profiles;
  registry: typeof registry;
  vault: typeof vault;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
