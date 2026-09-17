import { ConvexError } from "convex/values";
import type { QueryCtx } from "../model";

export async function requireOwner(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to access this workspace.");
  return identity.tokenIdentifier;
}
export function assertOwner(record: { owner: string } | null, owner: string): asserts record is { owner: string } {
  if (!record || record.owner !== owner) throw new ConvexError("Record not found.");
}
export function nonempty(value: string, max = 160) {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new ConvexError(`Enter between 1 and ${max} characters.`);
  return clean;
}
