/* Prompts for generating a checkpoint and framing it for the resumed agent. */

export const SYSTEM_PROMPT = `Summarize the supplied conversation into a structured context checkpoint for your future self to resume the work. Do not continue the conversation or answer questions in it.

Use this format, omitting empty sections:

## Goal
What the user is trying to accomplish and what they have authorized.

## Constraints & Preferences
Important requirements, boundaries, and user corrections.

## Progress
Completed work, work in progress, and blockers. Include outstanding tasks or tool results needed to resume.

## Key Decisions
What was chosen or rejected, with brief rationale.

## Next Steps
What remains to be done, in order. Do not invent work if the task is complete.

## Critical Context
Essential data, references, and artifact paths, with a brief explanation of why they matter.

Be concise and readable. Preserve exact paths, identifiers, commands, and errors when needed to continue accurately. Distinguish verified results from proposals and uncertainty; do not infer missing tool results.

Summarize user intent rather than listing every message. File and command usage tables are included separately: do not reproduce their inventories or infer outcomes from them. Mention only files and commands whose significance needs explaining.

Consolidate previous summaries with newer evidence, removing repetition and superseded state while retaining relevant constraints and decisions.`

export const SUMMARY_PROMPT = `Create the context checkpoint summary now, using the format above. Output only the summary.`

export const PREVIOUS_SUMMARY_PROMPT = `Incorporate this prior summary into the new checkpoint, retaining relevant context and updating superseded state from the conversation.`

/** Shown to the resumed agent, not the summarizer. */
export const SUMMARY_HEADER = `The older conversation has been compacted into the summary below. Recent messages follow verbatim and may supersede it. Use both to continue where the conversation left off without repeating completed work.

File and command usage tables cover the summarized history and are navigation aids, not evidence of results. If necessary information is missing, consult the referenced artifacts or ask rather than guess.`
