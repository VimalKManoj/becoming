// Starting points for a new project, by kind (from the owner's Setup design). Each gives the
// docs the plan usually stands on (the first ones picked), five phases with their milestones,
// and three tasks for the first evening. Everything is editable on the page.

export type Kind = "software" | "film" | "writing" | "product";
export const kinds: { kind: Kind; label: string }[] = [
  { kind: "software", label: "Software" }, { kind: "film", label: "Film" }, { kind: "writing", label: "Writing" }, { kind: "product", label: "Physical product" },
];

type Template = { docs: [code: string, title: string, picked: boolean][]; phases: [name: string, milestones: string[]][]; tasks: [title: string, minutes: number][] };

export const templates: Record<Kind, Template> = {
  software: {
    docs: [["PRD", "Product brief", true], ["SYS", "System design", true], ["DB", "Schema", true], ["UI", "UI flow", true], ["DS", "Design system", true], ["API", "API", false]],
    phases: [["Foundation", ["Repo & first screen", "Accounts & data"]], ["Core flow", ["The main flow", "The second flow"]], ["Data & sync", ["Private storage", "Offline"]], ["Polish", ["Interface quality", "Two-week trial"]], ["Release", ["Friend pilot"]]],
    tasks: [["Create the app", 45], ["Own the tokens", 60], ["First screen in your look", 90]],
  },
  film: {
    docs: [["TRT", "Treatment", true], ["SCR", "Script", true], ["SB", "Storyboard", true], ["SL", "Shot list", true], ["BUD", "Budget", false]],
    phases: [["Development", ["Treatment locked", "Script draft"]], ["Pre-production", ["Storyboard", "Shot list"]], ["Production", ["Shoot days"]], ["Post", ["Rough cut", "Sound & grade"]], ["Release", ["Premiere"]]],
    tasks: [["Write the logline", 30], ["First treatment draft", 90], ["Read-through with a friend", 60]],
  },
  writing: {
    docs: [["THS", "Thesis", true], ["OUT", "Outline", true], ["SRC", "Sources", true], ["STY", "Style sheet", false]],
    phases: [["Research", ["Sources gathered"]], ["Outline", ["Thesis", "Section plan"]], ["Draft", ["First draft"]], ["Edit", ["Structural edit", "Line edit"]], ["Publish", ["Publish & share"]]],
    tasks: [["List ten sources", 45], ["Read and annotate three", 90], ["Write the thesis in one line", 30]],
  },
  product: {
    docs: [["SPEC", "Spec", true], ["SKT", "Sketches", true], ["CAD", "CAD model", true], ["BOM", "Bill of materials", false]],
    phases: [["Concept", ["Concept sketches"]], ["Prototype", ["First model", "Working prototype"]], ["Test", ["User tests"]], ["Refine", ["Design for making"]], ["Manufacture", ["First batch"]]],
    tasks: [["Write the spec on one page", 60], ["Twenty quick sketches", 90], ["Pick one with a friend", 30]],
  },
};

/** A short code for a doc from its name: the initials, or the first letters of one word (up to 4). */
export function docCode(title: string, taken: string[]) {
  const words = title.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map(w => w[0]).join("") : words[0] ?? "DOC").slice(0, 4) || "DOC";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n++) { const code = `${base.slice(0, 3)}${n}`.slice(0, 4); if (!taken.includes(code)) return code; }
  return base;
}
