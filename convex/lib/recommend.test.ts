import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { rankFocuses, type Candidate, type Lane } from "./recommend";

let created = 0;
function task(fields: Partial<Candidate> & { title: string }): Candidate {
  created += 1;
  return { _id: fields.title as Id<"tasks">, _creationTime: created, lane: "Projects", status: "Ready", minutes: 30, energy: 2, doneWhen: "It works.", nextStep: "", ...fields };
}
const roomy = { minutes: 90, energy: 3 };

describe("Today ranking", () => {
  it("never squeezes a full task into a shorter evening", () => {
    const large = task({ title: "Build the focus card", minutes: 60, smallerStep: "Sketch three states", smallerDone: "Three sketches exist", smallerMinutes: 15 });
    const medium = task({ title: "Polish a card", minutes: 30 });
    expect(rankFocuses([large, medium], [], { minutes: 15, energy: 2 }).map(focus => [focus.title, focus.smaller, focus.minutes]))
      .toEqual([["Sketch three states", true, 15]]);
  });

  it("offers the smaller step when energy is too low for the full task", () => {
    const demanding = task({ title: "Refactor the store", energy: 3, smallerStep: "List the files to change", smallerDone: "A list exists", smallerMinutes: 10 });
    expect(rankFocuses([demanding], [], { minutes: 60, energy: 1 })[0]).toMatchObject({ title: "List the files to change", taskTitle: "Refactor the store", smaller: true, doneWhen: "A list exists" });
  });

  it("only offers Ready and In progress work", () => {
    const statuses = ["Ready", "In progress", "Blocked", "Done", "Archived"] as const;
    const result = rankFocuses(statuses.map(status => task({ title: status, status })), [], roomy);
    expect(result.map(focus => focus.title).sort()).toEqual(["In progress", "Ready"]);
  });

  it("prefers the lane with the fewest recent sessions, then the oldest task", () => {
    const project = task({ title: "Project step", lane: "Projects" });
    const showcase = task({ title: "Showcase step", lane: "Showcases" });
    const writing = task({ title: "Writing step", lane: "Writing" });
    const recent: Lane[] = ["Projects", "Writing", "Projects", "Writing", "Showcases"];
    expect(rankFocuses([writing, project, showcase], recent, roomy).map(focus => focus.lane)).toEqual(["Showcases", "Projects", "Writing"]);
  });

  it("avoids a third session in a row in the same lane when another lane fits", () => {
    const project = task({ title: "Project step", lane: "Projects" });
    const writing = task({ title: "Writing step", lane: "Writing" });
    const recent: Lane[] = ["Projects", "Projects", "Writing", "Writing", "Writing"];
    expect(rankFocuses([project, writing], recent, roomy).map(focus => focus.lane)).toEqual(["Writing", "Projects"]);
    // With nothing else available, the repeated lane is still offered.
    expect(rankFocuses([project], ["Projects", "Projects"], roomy).map(focus => focus.title)).toEqual(["Project step"]);
  });

  it("resumes started work before older Ready work in the same lane", () => {
    const older = task({ title: "Older ready step" });
    const started = task({ title: "Started step", status: "In progress", nextStep: "Wire up the form" });
    expect(rankFocuses([older, started], [], roomy).map(focus => focus.title)).toEqual(["Started step", "Older ready step"]);
  });

  it("returns at most three focuses", () => {
    const many = ["One", "Two", "Three", "Four"].map(title => task({ title }));
    expect(rankFocuses(many, [], roomy)).toHaveLength(3);
  });
});

describe("Today reasons", () => {
  const capacity = { minutes: 30, energy: 2 };
  const reasonFor = (candidate: Candidate, recent: Lane[], room = capacity) => rankFocuses([candidate], recent, room)[0].reason;

  it("does not invent history for a new account", () => {
    expect(reasonFor(task({ title: "First" }), [])).toBe("A good first session. It fits your 30 minutes and steady energy.");
  });

  it("names a neglected lane", () => {
    expect(reasonFor(task({ title: "Draft", lane: "Writing" }), ["Projects", "Showcases", "Projects"])).toBe("None of your last 3 sessions were Writing. It fits your 30 minutes and steady energy.");
    expect(reasonFor(task({ title: "Draft", lane: "Writing" }), ["Projects"])).toBe("Your last session was Projects, so Writing gets a turn. It fits your 30 minutes and steady energy.");
  });

  it("explains the turn after two sessions in one lane", () => {
    expect(reasonFor(task({ title: "Draft", lane: "Writing" }), ["Projects", "Projects", "Writing"])).toBe("Your last two sessions were Projects, so Writing gets a turn. It fits your 30 minutes and steady energy.");
  });

  it("explains resumed work and smaller steps", () => {
    expect(reasonFor(task({ title: "Started", status: "In progress" }), ["Projects", "Writing"])).toBe("It picks up work you've already started. It fits your 30 minutes and steady energy.");
    const large = task({ title: "Large", minutes: 60, smallerStep: "Sketch", smallerDone: "Sketched", smallerMinutes: 15 });
    expect(reasonFor(large, [], { minutes: 15, energy: 2 })).toBe("A good first session. The full task needs more time or energy, so this is its 15-minute smaller step.");
  });
});
