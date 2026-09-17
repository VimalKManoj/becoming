import type { Workspace } from "./workspace";

export function createWorkspace(): Workspace {
  return {
    version: 1, motive: "Become a thoughtful design engineer.", weeklyTarget: 3, timezone: "Asia/Kolkata", activeSession: null,
    sessions: [],
    tasks: [
      { id: "focus-card", title: "Build the Today focus card", lane: "Projects", project: "Form · Personal workspace", minutes: 60, energy: 2, status: "Ready", doneWhen: "A responsive focus card with empty, ready, and completed states.", nextStep: "Start with the mobile hierarchy.", smallerStep: "Sketch the three focus-card states", smallerDone: "Save one sketch for each state.", smallerMinutes: 15, dependencies: [], createdAt: 1 },
      { id: "expandable-card", title: "Polish an expandable card", lane: "Showcases", project: "Interaction collection", minutes: 30, energy: 1, status: "Ready", doneWhen: "One expansion with keyboard support and reduced motion.", nextStep: "Test focus before tuning motion.", dependencies: [], createdAt: 2 },
      { id: "first-breakdown", title: "Outline the Today design breakdown", lane: "Writing", project: "Building in public", minutes: 15, energy: 1, status: "Ready", doneWhen: "Three points: problem, decision, and trade-off.", nextStep: "Use the PRD as source material.", dependencies: [], createdAt: 3 },
    ],
    ideas: [{ id: "reading-corner", title: "A reading corner for the web", lane: "Projects", notes: "A calm home for saved articles. Explore reading progress and a small typography system." }],
  };
}
