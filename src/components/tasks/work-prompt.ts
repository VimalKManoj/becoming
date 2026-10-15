// "Work on this with Claude" (PLAN-one-tap-and-daily-loop, Phase 2): a ready prompt for Claude
// Code or any assistant connected to Becoming. It names the task by its id, so get_task loads
// the full context, and says how to record the work as it goes. The assistant's moves apply
// at once (by its token's trust) and can be undone from the task's history.

type PromptTask = { _id: string; title: string; doneWhen?: string; nextStep?: string };
type Toast = (text: string, tone?: "status" | "alert") => void;

export function workPrompt(task: PromptTask) {
  return [
    `Let's work on my Becoming task “${task.title}” (id ${task._id}).`,
    ...(task.doneWhen ? [`Done when: ${task.doneWhen}`] : []),
    ...(task.nextStep ? [`Next step: ${task.nextStep}`] : []),
    "",
    "Use the Becoming tools. Call get_task with that id for its plan, the docs it's built from and its history, then call start_task.",
    "Work toward the done-when. If something gets in the way, call block_task with what's blocking it.",
    "When the done-when is met, call complete_task with a short summary of what changed, the skills it used, and the PR or commit link. Then tell me what you recorded.",
  ].join("\n");
}

/** Copies the prompt. When the browser refuses, the toast says where to copy it by hand. */
export function copyWorkPrompt(task: PromptTask, showToast: Toast, byHand = "Open the task and copy the prompt from its sheet.") {
  void navigator.clipboard.writeText(workPrompt(task)).then(
    () => showToast("Prompt copied. Paste it into Claude Code, or any assistant connected to Becoming."),
    () => showToast(`Couldn't copy. ${byHand}`, "alert"),
  );
}
