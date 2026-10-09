/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assistants from "../assistants.js";
import type * as auth from "../auth.js";
import type * as constellation from "../constellation.js";
import type * as crons from "../crons.js";
import type * as data from "../data.js";
import type * as genesis from "../genesis.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as inbox from "../inbox.js";
import type * as journey from "../journey.js";
import type * as lib_bloom from "../lib/bloom.js";
import type * as lib_caseStudy from "../lib/caseStudy.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_ideaRules from "../lib/ideaRules.js";
import type * as lib_ownership from "../lib/ownership.js";
import type * as lib_projects from "../lib/projects.js";
import type * as lib_recommend from "../lib/recommend.js";
import type * as lib_rhythm from "../lib/rhythm.js";
import type * as lib_taskArchive from "../lib/taskArchive.js";
import type * as lib_taskEvents from "../lib/taskEvents.js";
import type * as lib_taskRules from "../lib/taskRules.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_validate from "../lib/validate.js";
import type * as lib_webpush from "../lib/webpush.js";
import type * as mcp from "../mcp.js";
import type * as projects from "../projects.js";
import type * as proof from "../proof.js";
import type * as push from "../push.js";
import type * as reminders from "../reminders.js";
import type * as rhythm from "../rhythm.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assistants: typeof assistants;
  auth: typeof auth;
  constellation: typeof constellation;
  crons: typeof crons;
  data: typeof data;
  genesis: typeof genesis;
  http: typeof http;
  ideas: typeof ideas;
  inbox: typeof inbox;
  journey: typeof journey;
  "lib/bloom": typeof lib_bloom;
  "lib/caseStudy": typeof lib_caseStudy;
  "lib/email": typeof lib_email;
  "lib/ideaRules": typeof lib_ideaRules;
  "lib/ownership": typeof lib_ownership;
  "lib/projects": typeof lib_projects;
  "lib/recommend": typeof lib_recommend;
  "lib/rhythm": typeof lib_rhythm;
  "lib/taskArchive": typeof lib_taskArchive;
  "lib/taskEvents": typeof lib_taskEvents;
  "lib/taskRules": typeof lib_taskRules;
  "lib/time": typeof lib_time;
  "lib/tokens": typeof lib_tokens;
  "lib/validate": typeof lib_validate;
  "lib/webpush": typeof lib_webpush;
  mcp: typeof mcp;
  projects: typeof projects;
  proof: typeof proof;
  push: typeof push;
  reminders: typeof reminders;
  rhythm: typeof rhythm;
  settings: typeof settings;
  tasks: typeof tasks;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
