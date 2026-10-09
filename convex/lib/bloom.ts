// The Mind Bloom: eight skills, always in the same places (the owner's Ritual design).
// A petal grows with every saved session that practised its skill, whether the skill was
// tagged in the recap or on the session's evidence. A session counts once per skill, so
// tagging the same skill twice never double-counts. Other tags are kept but don't bloom.

type Lane = "Projects" | "Showcases" | "Writing";
export type BloomSession = { id: string; lane: Lane; skills?: string[]; taskId?: string };
/** A task finished in the window, with the skills it practised. */
export type BloomFinished = { taskId: string; lane: Lane; skills?: string[] };
export type BloomArtifact = { sessionId: string; skills?: string[] };
export type BloomPetal = { name: string; sessions: number; lane: Lane };

/** The eight skills and the lane colour each petal takes. */
export const bloomSkillList: readonly { name: string; lane: Lane }[] = [
  { name: "Frontend", lane: "Projects" }, { name: "Interaction", lane: "Showcases" }, { name: "Motion", lane: "Showcases" }, { name: "Visual", lane: "Showcases" },
  { name: "Writing", lane: "Writing" }, { name: "Research", lane: "Writing" }, { name: "Systems", lane: "Projects" }, { name: "Shipping", lane: "Projects" },
];
export const bloomPetals = bloomSkillList.length;
/** A petal is full at this many sessions. */
export const bloomFull = 12;

const keyOf = (name: string) => name.trim().toLowerCase();
const index = new Map(bloomSkillList.map((skill, i) => [keyOf(skill.name), i]));

export function bloomSkills(sessions: BloomSession[], artifacts: BloomArtifact[], finished: BloomFinished[] = []) {
  const evidence = new Map<string, string[]>();
  for (const artifact of artifacts) {
    if (artifact.skills?.length) evidence.set(artifact.sessionId, [...(evidence.get(artifact.sessionId) ?? []), ...artifact.skills]);
  }
  const counts = bloomSkillList.map(() => 0);
  let tagged = 0;
  // Which skills a task's sessions already counted, so finishing it doesn't count them twice.
  const counted = new Set<string>();
  for (const session of sessions) {
    const hit = new Set<number>();
    for (const name of [...(session.skills ?? []), ...(evidence.get(session.id) ?? [])]) {
      const at = index.get(keyOf(name));
      if (at !== undefined) hit.add(at);
    }
    if (hit.size) tagged += 1;
    for (const at of hit) { counts[at] += 1; if (session.taskId) counted.add(`${session.taskId}:${at}`); }
  }
  // A finished task counts once for each of its skills its sessions didn't already count.
  let finishedTagged = 0;
  for (const task of finished) {
    const fresh = [...new Set((task.skills ?? []).flatMap(name => { const at = index.get(keyOf(name)); return at === undefined ? [] : [at]; }))].filter(at => !counted.has(`${task.taskId}:${at}`));
    if (fresh.length) finishedTagged += 1;
    for (const at of fresh) counts[at] += 1;
  }
  const petals: BloomPetal[] = bloomSkillList.map((skill, i) => ({ name: skill.name, lane: skill.lane, sessions: counts[i] }));
  return { petals, sessions: sessions.length, tagged, finished: finishedTagged };
}
