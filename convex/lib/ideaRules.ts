import { ConvexError, type Infer } from "convex/values";
import type { brainstorm } from "../schema";
import { httpUrl, optionalText, tagList } from "./validate";

export type Brainstorm = Infer<typeof brainstorm>;

/**
 * Cleans an idea's structured brainstorm, or returns undefined when every field is empty.
 * Shared by the brainstorm editor and backup restore, so both accept the same input.
 */
export function brainstormValues(input: Brainstorm): Brainstorm | undefined {
  const values: Brainstorm = {
    problem: optionalText(input.problem, 2000, "the problem"),
    audience: optionalText(input.audience, 1000, "the intended user"),
    hook: optionalText(input.hook, 1000, "the distinctive interaction"),
    smallestBuild: optionalText(input.smallestBuild, 1000, "the smallest build"),
    skills: input.skills ? tagList(input.skills) : undefined,
    references: input.references ? [...new Set(input.references.map(item => item.trim()).filter(Boolean).map(item => httpUrl(item, "References must be HTTP or HTTPS links.")))] : undefined,
    openQuestions: optionalText(input.openQuestions, 2000, "open questions"),
    decisions: optionalText(input.decisions, 2000, "decisions"),
  };
  if (values.references && values.references.length > 10) throw new ConvexError("Use up to 10 references.");
  if (!values.skills?.length) delete values.skills;
  if (!values.references?.length) delete values.references;
  return Object.values(values).some(value => value !== undefined) ? values : undefined;
}
