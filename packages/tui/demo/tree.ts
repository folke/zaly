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
  value: "zaly",
  children: [
    {
      value: "packages",
      children: [
        {
          value: "agent",
          children: [
            {
              value: "src",
              children: [
                { value: "agent.ts" },
                { value: "context.ts" },
                {
                  value: "session",
                  children: [{ value: "session.ts" }, { value: "store.ts" }, { value: "nodes.ts" }],
                },
                {
                  value: "tools",
                  children: [
                    { value: "bash.ts" },
                    { value: "read.ts" },
                    { value: "grep.ts" },
                    { value: "tasks.ts" },
                  ],
                },
              ],
            },
            {
              value: "test",
              children: [
                { value: "session.test.ts" },
                { value: "permissions.test.ts" },
                { value: "tools.test.ts" },
              ],
            },
          ],
        },
        {
          value: "tui",
          children: [
            {
              value: "src",
              children: [
                {
                  value: "renderer",
                  children: [
                    { value: "renderer.ts" },
                    { value: "stream.ts" },
                    { value: "overlay.ts" },
                    { value: "terminal.ts" },
                  ],
                },
                {
                  value: "widgets",
                  children: [
                    { value: "input.ts" },
                    { value: "select.ts" },
                    { value: "picker.ts" },
                    { value: "tree.ts" },
                  ],
                },
              ],
            },
            {
              value: "demo",
              children: [
                { value: "tree.ts" },
                { value: "markdown.ts" },
                { value: "autocomplete.ts" },
              ],
            },
          ],
        },
        {
          value: "cli",
          children: [
            {
              value: "src",
              children: [
                {
                  value: "app",
                  children: [
                    { value: "agent.ts" },
                    { value: "stream.ts" },
                    { value: "context.ts" },
                    { value: "commands.ts" },
                  ],
                },
                {
                  value: "widgets",
                  children: [{ value: "composer.ts" }, { value: "tool.ts" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      value: "docs",
      children: [{ value: "vim.md" }, { value: "config.md" }, { value: "plugins.md" }],
    },
    {
      value: "branches",
      children: [
        {
          value: "main",
          children: [
            { value: "initial prompt" },
            {
              value: "assistant response",
              children: [
                { value: "follow-up A" },
                {
                  value: "follow-up B",
                  children: [{ value: "tool call" }, { value: "final answer" }],
                },
              ],
            },
          ],
        },
        {
          value: "alternate",
          children: [{ value: "edited prompt" }, { value: "alternate response" }],
        },
      ],
    },
  ],
}

renderer.ui.add(() =>
  box({ flexDirection: "column", padding: [0, 1], style: "ui" }, tree({ tree: root }))
)

renderer.start()
