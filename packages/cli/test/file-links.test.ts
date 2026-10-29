import type { SkillTool } from "@zaly/agent"
import type { MetaOf, ToolResult } from "@zaly/ai"
import type { ComposerRenderCtx } from "../src/app/composer.ts"

import { createCtx } from "@zaly/tui"
import { fileUrl } from "@zaly/tui/ansi"
import { resolve } from "pathe"
import { expect, test } from "vitest"
import { FilesComposer } from "../src/app/composer/files.ts"
import { MessageComposer } from "../src/app/composer/message.ts"
import { assistantMessage } from "../src/widgets/assistant.ts"
import { ToolView } from "../src/widgets/tool.ts"
import { toolRenderer } from "../src/widgets/tools/registry.ts"

const project = resolve("project")

function loadedSkill(path = ""): ToolResult<MetaOf<SkillTool>> {
  return {
    content: "loaded",
    meta: { name: "example", path, mtime: 1, desc: "[reference](docs/reference.md)" },
  }
}

test("skill links use the skill file's directory and follow reactive path changes", async () => {
  const first = resolve("skills/first/SKILL.md")
  const second = resolve("skills/second/SKILL.md")
  const view = new ToolView<SkillTool>({
    call: { id: "skill", name: "skill", type: "tool-call", params: { name: "example" } },
    cwd: project,
    result: loadedSkill(first),
  })
  const node = toolRenderer<SkillTool>("skill").result(view)
  const ctx = await createCtx({ width: 100 })
  const rows = await node.render(ctx)
  expect(rows.join("\n")).toContain(fileUrl("skills/first/docs/reference.md"))
  expect(rows.join("\n")).not.toContain(fileUrl("docs/reference.md", project))
  view.result = loadedSkill(second)
  const updated = await node.render(ctx)
  expect(updated.join("\n")).toContain(fileUrl("skills/second/docs/reference.md"))
  expect(updated.join("\n")).not.toContain(fileUrl("skills/first/docs/reference.md"))
})

test("skill links without a path fall back to the calling project", async () => {
  const node = toolRenderer<SkillTool>("skill").result(
    new ToolView<SkillTool>({
      call: { id: "skill", name: "skill", type: "tool-call", params: { name: "example" } },
      cwd: project,
      result: loadedSkill(),
    })
  )
  const rows = await node.render(await createCtx({ width: 100 }))
  expect(rows.join("\n")).toContain(fileUrl("docs/reference.md", project))
})

test("assistant links use the supplied agent cwd", async () => {
  const node = assistantMessage({ content: "[source](README.md)", cwd: project })
  const rows = await node.render(await createCtx({ width: 100 }))
  expect(rows.join("\n")).toContain(fileUrl("README.md", project))
})

test("composer file references use the supplied cwd and encode literal filenames", async () => {
  const nodes = await new FilesComposer().render({
    cwd: project,
    message: {
      role: "user",
      content: "",
      meta: { fileRefs: [{ path: "notes #1.md", ref: "@notes" }] },
    },
  } as unknown as ComposerRenderCtx)
  const rows = await nodes[0].render(await createCtx({ width: 100 }))
  expect(rows.join("\n")).toContain(fileUrl("notes #1.md", project))
})

test("local attachment links use file URIs while remote attachment URLs are preserved", async () => {
  const nodes = await new MessageComposer().render({
    cwd: project,
    message: {
      role: "user",
      content: [
        { type: "pdf", mime: "application/pdf", source: { type: "file", path: "notes #1.pdf" } },
        {
          type: "pdf",
          mime: "application/pdf",
          source: { type: "url", url: "https://example.com/file.pdf" },
        },
      ],
    },
  } as ComposerRenderCtx)
  const ctx = await createCtx({ width: 100 })
  const local = await nodes[0].render(ctx)
  const remote = await nodes[1].render(ctx)
  expect(local.join("\n")).toContain(fileUrl("notes #1.pdf", project))
  expect(remote.join("\n")).toContain("\x1b]8;;https://example.com/file.pdf\x1b\\")
})
