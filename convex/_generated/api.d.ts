/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as board from "../board.js";
import type * as dev from "../dev.js";
import type * as events from "../events.js";
import type * as extract from "../extract.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as lib_ruleExtract from "../lib/ruleExtract.js";
import type * as lib_senderAuth from "../lib/senderAuth.js";
import type * as lib_trustScore from "../lib/trustScore.js";
import type * as pipeline from "../pipeline.js";
import type * as profiles from "../profiles.js";
import type * as registry from "../registry.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  board: typeof board;
  dev: typeof dev;
  events: typeof events;
  extract: typeof extract;
  http: typeof http;
  inbound: typeof inbound;
  "lib/ruleExtract": typeof lib_ruleExtract;
  "lib/senderAuth": typeof lib_senderAuth;
  "lib/trustScore": typeof lib_trustScore;
  pipeline: typeof pipeline;
  profiles: typeof profiles;
  registry: typeof registry;
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
