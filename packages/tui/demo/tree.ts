// oxlint-disable sort-keys
import type { TreeNode } from "@zaly/tui/widgets/tree"

import { installLogger, Logger } from "@zaly/shared/logger"
import { createRenderer } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { tree } from "@zaly/tui/widgets/tree"

/**
 * Demo for the logger surface.
 *
 * `renderer.log` is a callable — `log("...")` logs at the default `"log"`
 * level; `log.info(...)`, `log.error(...)`, etc. are also available. Each
 * call appends a `log()` widget to `renderer.stream`.
 *
 *   - Strings that look like markdown get rendered as such (bold, code,
 *     links, lists, code fences with syntax highlighting).
 *   - `util.format`-style placeholders (`%s`, `%d`) are interpolated.
 *   - `Error` values are reduced to their `.message` (set
 *     `logger: { stacktrace: true }` to include the stack).
 *   - `log.install()` patches `console.log` / `.info` / `.warn` / `.error`
 *     / `.debug` / `.trace` so existing `console.*` calls route through
 *     the logger and land in the stream like any other entry.
 */

const logger = new Logger({ name: "demo-logger" }, { level: "trace" })
const renderer = await createRenderer({ logger })

installLogger(logger)

const root: TreeNode = {
  text: "zaly",
  children: [
    {
      text: "packages",
      children: [
        {
          text: "agent",
          children: [
            {
              text: "src",
              children: [
                { text: "agent.ts" },
                { text: "context.ts" },
                {
                  text: "session",
                  children: [{ text: "session.ts" }, { text: "store.ts" }, { text: "nodes.ts" }],
                },
                {
                  text: "tools",
                  children: [
                    { text: "bash.ts" },
                    { text: "read.ts" },
                    { text: "grep.ts" },
                    { text: "tasks.ts" },
                  ],
                },
              ],
            },
            {
              text: "test",
              children: [
                { text: "session.test.ts" },
                { text: "permissions.test.ts" },
                { text: "tools.test.ts" },
              ],
            },
          ],
        },
        {
          text: "tui",
          children: [
            {
              text: "src",
              children: [
                {
                  text: "renderer",
                  children: [
                    { text: "renderer.ts" },
                    { text: "stream.ts" },
                    { text: "overlay.ts" },
                    { text: "terminal.ts" },
                  ],
                },
                {
                  text: "widgets",
                  children: [
                    { text: "input.ts" },
                    { text: "select.ts" },
                    { text: "picker.ts" },
                    { text: "tree.ts" },
                  ],
                },
              ],
            },
            {
              text: "demo",
              children: [{ text: "tree.ts" }, { text: "markdown.ts" }, { text: "autocomplete.ts" }],
            },
          ],
        },
        {
          text: "cli",
          children: [
            {
              text: "src",
              children: [
                {
                  text: "app",
                  children: [
                    { text: "agent.ts" },
                    { text: "stream.ts" },
                    { text: "context.ts" },
                    { text: "commands.ts" },
                  ],
                },
                {
                  text: "widgets",
                  children: [{ text: "composer.ts" }, { text: "tool.ts" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      text: "docs",
      children: [{ text: "vim.md" }, { text: "config.md" }, { text: "plugins.md" }],
    },
    {
      text: "branches",
      children: [
        {
          text: "main",
          children: [
            { text: "initial prompt" },
            {
              text: "assistant response",
              children: [
                { text: "follow-up A" },
                {
                  text: "follow-up B",
                  children: [{ text: "tool call" }, { text: "final answer" }],
                },
              ],
            },
          ],
        },
        {
          text: "alternate",
          children: [{ text: "edited prompt" }, { text: "alternate response" }],
        },
      ],
    },
  ],
}

renderer.ui.add(() =>
  box({ flexDirection: "column", padding: [0, 1], style: "ui" }, tree({ tree: root }))
)

renderer.start()
