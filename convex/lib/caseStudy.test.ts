import { expect, it } from "vitest";
import { caseStudyMarkdown, type CaseStudyData } from "./caseStudy";

const data: CaseStudyData = {
  project: { title: "Becoming", purpose: "A practice\nworth building", outcome: "A usable Today flow", status: "Active" },
  progress: { done: 1, total: 3 },
  milestones: [
    { title: "Usable Today", doneWhen: "Start to recap works", completedAt: Date.parse("2026-09-25T10:00:00Z"), progress: { done: 1, total: 1 } },
    { title: "Weekly rhythm", doneWhen: "", progress: { done: 0, total: 2 } },
  ],
  sessions: [{ title: "Focus card", lane: "Projects", outcome: "Finished", contribution: "Built the card\nwith states", endedAt: Date.parse("2026-09-24T18:00:00Z") }],
  openSteps: [{ title: "Week strip", status: "In progress", nextStep: "Add the pause state" }],
  evidence: [
    { title: "Card demo", url: "https://example.test/demo", status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2026-09-26", notes: "Shows the empty state.", skills: ["React", "Accessibility"], portfolioCandidate: true },
    { title: "Draft notes", url: "https://example.test/notes", status: "Draft", notes: "", skills: ["Writing", "React"], portfolioCandidate: false },
  ],
};

it("arranges recorded facts into an editable Markdown draft", () => {
  const markdown = caseStudyMarkdown(data, "2026-10-02");
  expect(markdown).toContain("# Becoming\n\n> A practice worth building");
  expect(markdown).toContain("Active. 1 of 3 tasks done.");
  expect(markdown).toContain("- [x] **Usable Today** (completed 2026-09-25) — Start to recap works");
  expect(markdown).toContain("- [ ] **Weekly rhythm** (0 of 2 tasks done)");
  expect(markdown).toContain("- **2026-09-24** · Projects · Focus card (finished): Built the card with states");
  expect(markdown).toContain("- [Card demo](https://example.test/demo) · published 2026-09-26 at <https://example.test/post> · portfolio candidate");
  expect(markdown).toContain("  - Shows the empty state.");
  expect(markdown).toContain("## Skills shown\n\nReact, Accessibility, Writing");
  expect(markdown).toContain("- Week strip (in progress): Add the pause state");
  expect(markdown).toContain("Draft assembled by Becoming on 2026-10-02");
});

it("says plainly when there are no sessions yet", () => {
  const markdown = caseStudyMarkdown({ ...data, milestones: [], sessions: [], evidence: [], openSteps: [] }, "2026-10-02");
  expect(markdown).toContain("_No saved sessions yet._");
  expect(markdown).not.toContain("## Evidence");
  expect(markdown).not.toContain("## Milestones");
});
