import { describe, expect, it } from "vitest";
import { bloomSkillList, bloomSkills } from "./bloom";

const countOf = (result: ReturnType<typeof bloomSkills>, name: string) => result.petals.find(petal => petal.name === name)?.sessions;

describe("Mind Bloom", () => {
  it("always has the eight skills in the same order and colours", () => {
    const { petals } = bloomSkills([], []);
    expect(petals.map(petal => petal.name)).toEqual(["Frontend", "Interaction", "Motion", "Visual", "Writing", "Research", "Systems", "Shipping"]);
    expect(petals.map(petal => petal.lane)).toEqual(bloomSkillList.map(skill => skill.lane));
    expect(petals.every(petal => petal.sessions === 0)).toBe(true);
  });

  it("counts each session once per skill, from the recap and its evidence, ignoring case", () => {
    const result = bloomSkills(
      [{ id: "s1", lane: "Projects", skills: ["Frontend"] }, { id: "s2", lane: "Showcases", skills: ["motion"] }, { id: "s3", lane: "Projects" }],
      [{ sessionId: "s1", skills: ["frontend", "Motion"] }, { sessionId: "s1", skills: ["Frontend"] }, { sessionId: "s3", skills: ["Frontend"] }],
    );
    expect(countOf(result, "Frontend")).toBe(2);
    expect(countOf(result, "Motion")).toBe(2);
    expect(result).toMatchObject({ sessions: 3, tagged: 3 });
  });

  it("keeps other tags out of the bloom", () => {
    const result = bloomSkills([{ id: "s", lane: "Writing", skills: ["Typography"] }], []);
    expect(result.petals.every(petal => petal.sessions === 0)).toBe(true);
    expect(result.tagged).toBe(0);
  });
});
