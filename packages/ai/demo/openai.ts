/**
 * Minimal demo. Uses `loadModel` — a single line gets you a model
 * configured from the catalog (provider, adapter, quirks, env-based
 * credentials) ready to stream.
 *
 * Run from the repo root so the top-level `.env` is picked up:
 *
 *   bun packages/ai/demo/openai.ts
 *
 * Env:
 *   OPENAI_API_KEY        required for openai/* ids
 *   OPENROUTER_API_KEY    required for openrouter/* ids
 *   MODEL                 override the default id
 */

import { collect, envAuth, listModels, loadModel } from "../src/index.ts"

const id = process.env.MODEL ?? "openrouter/minimax/minimax-m2.7"

console.log(await listModels({ auth: envAuth }).then((m) => Object.keys(m).sort()))

const model = await loadModel(id)

console.log(`→ ${model.id}`)
console.log(
  `  context ${model.options.limit.context}` +
    ` · output ${model.options.limit.output}` +
    ` · reasoning ${model.options.reasoning ? "yes" : "no"}`
)
console.log()

// Reasoning models stream thoughts via `reasoning-delta` before any
// `text-delta`; we dim them so the final answer stands out.
let mode: "reasoning" | "text" | undefined
const { finishReason, message, usage } = await collect(
  model.stream({
    maxTokens: 1024,
    messages: [
      { content: "You are a concise assistant.", role: "system" },
      { content: "Write a two-sentence haiku about the terminal.", role: "user" },
    ],
  }),
  {
    onEvent: (e) => {
      if (e.type === "reasoning-delta") {
        if (mode !== "reasoning") {
          process.stdout.write("\n\x1b[2m· reasoning ·\x1b[0m\n\x1b[2m")
          mode = "reasoning"
        }
        process.stdout.write(e.delta)
      }
      if (e.type === "text-delta") {
        if (mode === "reasoning") process.stdout.write("\x1b[0m\n\n")
        mode = "text"
        process.stdout.write(e.delta)
      }
    },
  }
)
if (mode === "reasoning") process.stdout.write("\x1b[0m")
process.stdout.write("\n\n")

console.log("finish reason:", finishReason)
console.log("usage:", usage)
console.log("message:", JSON.stringify(message, undefined, 2))
