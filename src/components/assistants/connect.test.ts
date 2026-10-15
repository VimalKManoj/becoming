import { describe, expect, it } from "vitest";
import { connectCommand, lastHeard, pluginCommands, trusts } from "./connect";

describe("connecting Claude Code", () => {
  it("adds Becoming for every project, with the token as a bearer header", () => {
    const command = connectCommand("bcm_test");
    expect(command).toMatch(/^claude mcp add --transport http --scope user becoming \S*\/mcp /);
    expect(command).toContain(`--header "Authorization: Bearer bcm_test"`);
  });

  it("installs the plugin from the public repo's marketplace", () => {
    expect(pluginCommands.split("\n")).toEqual(["claude plugin marketplace add VimalKManoj/becoming", "claude plugin install becoming@becoming"]);
  });

  it("says when an assistant was last heard from, by calendar day", () => {
    const now = new Date(2026, 9, 15, 22, 0).getTime();
    expect(lastHeard(new Date(2026, 9, 15, 0, 30).getTime(), now)).toBe("today");
    expect(lastHeard(new Date(2026, 9, 14, 23, 50).getTime(), now)).toBe("yesterday");
    expect(lastHeard(new Date(2026, 9, 11, 9, 0).getTime(), now)).toBe("4 days ago");
  });

  it("offers the three trust levels, with Record my work in the middle", () => {
    expect(trusts.map(item => item.value)).toEqual(["ask", "work", "all"]);
  });
});
