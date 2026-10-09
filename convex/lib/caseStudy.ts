// Builds a Markdown case-study draft from a project's saved records. It only arranges
// what was recorded (sessions, milestones, evidence, open steps) and invents nothing;
// the person edits the draft before sharing it anywhere.

export type CaseStudyData = {
  project: { title: string; purpose: string; outcome: string; status: string };
  progress: { done: number; total: number };
  milestones: { title: string; doneWhen: string; completedAt?: number; progress: { done: number; total: number } }[];
  sessions: { title: string; lane: string; outcome: string; contribution: string; endedAt: number }[];
  openSteps: { title: string; status: string; nextStep: string }[];
  evidence: { title: string; url: string; status: string; publishedUrl?: string; publishedOn?: string; notes: string; skills: string[]; portfolioCandidate: boolean }[];
};

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
// Keeps table-free Markdown readable: one line per entry, no stray line breaks.
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function caseStudyMarkdown(data: CaseStudyData, assembledOn: string) {
  const { project } = data;
  const lines: string[] = [`# ${project.title}`, "", `> ${oneLine(project.purpose)}`, ""];
  if (project.outcome) lines.push("## Intended outcome", "", project.outcome.trim(), "");
  lines.push("## Where it stands", "", `${project.status}. ${data.progress.done} of ${data.progress.total} tasks done.`, "");

  if (data.milestones.length) {
    lines.push("## Milestones", "");
    for (const milestone of data.milestones) {
      const state = milestone.completedAt !== undefined ? `completed ${isoDay(milestone.completedAt)}` : `${milestone.progress.done} of ${milestone.progress.total} tasks done`;
      lines.push(`- [${milestone.completedAt !== undefined ? "x" : " "}] **${oneLine(milestone.title)}** (${state})${milestone.doneWhen ? ` — ${oneLine(milestone.doneWhen)}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## How it happened", "");
  if (data.sessions.length) {
    for (const session of data.sessions) lines.push(`- **${isoDay(session.endedAt)}** · ${session.lane} · ${oneLine(session.title)} (${session.outcome.toLowerCase()}): ${oneLine(session.contribution)}`);
  } else lines.push("_No saved sessions yet._");
  lines.push("");

  if (data.evidence.length) {
    lines.push("## Evidence", "");
    for (const item of data.evidence) {
      const published = item.status === "Published" && item.publishedUrl ? ` · published${item.publishedOn ? ` ${item.publishedOn}` : ""} at <${item.publishedUrl}>` : ` · ${item.status.toLowerCase()}`;
      lines.push(`- [${oneLine(item.title)}](${item.url})${published}${item.portfolioCandidate ? " · portfolio candidate" : ""}`);
      if (item.notes) lines.push(`  - ${oneLine(item.notes)}`);
    }
    lines.push("");
  }

  const skills = [...new Set(data.evidence.flatMap(item => item.skills))];
  if (skills.length) lines.push("## Skills shown", "", skills.join(", "), "");

  if (data.openSteps.length) {
    lines.push("## Still open", "");
    for (const step of data.openSteps) lines.push(`- ${oneLine(step.title)} (${step.status.toLowerCase()})${step.nextStep ? `: ${oneLine(step.nextStep)}` : ""}`);
    lines.push("");
  }

  lines.push("---", "", `_Draft assembled by Becoming on ${assembledOn} from saved sessions and evidence. Edit it before sharing._`, "");
  return lines.join("\n");
}
