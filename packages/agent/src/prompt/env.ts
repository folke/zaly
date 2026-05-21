import type { PromptCtx } from "./registry.ts"

import { which } from "@zaly/shared/process"
import os from "node:os"

export function prompt(ctx: PromptCtx): string {
  const lines = [
    "## Environment",
    `- Platform: ${process.platform} (${os.release()})`,
    `- Arch: ${process.arch}`,
    process.env.SHELL ? `- Shell: ${process.env.SHELL}` : undefined,
    `- Runtime: ${runtime()}`,
    `- Cwd: ${ctx.cwd}`,
    searchTools(),
  ]
  return lines.filter(Boolean).join("\n")
}

function runtime(): string {
  if (typeof Bun !== "undefined") return `bun ${Bun.version}`
  return `node ${process.versions.node}`
}

function searchTools(): string | undefined {
  const tools: string[] = []
  if (which("rg")) tools.push("rg")
  if (which("fd")) tools.push("fd")
  else if (which("fdfind")) tools.push("fdfind")
  if (tools.length === 0) return
  return `- Search tools: ${tools.join(", ")} available; prefer them over grep/find because they are fast and respect .gitignore by default.`
}
