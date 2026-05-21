// oxlint-disable sort-keys

import type { SessionInfo } from "@zaly/agent/session"
import type { ParsedArgs } from "citty"
import type { Cli } from "../cli.ts"

import { listSessions, Session } from "@zaly/agent/session"
import { stringifyContent } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { defineCommand } from "citty"
import { rm } from "node:fs/promises"
import { basename, dirname, isAbsolute } from "pathe"

type ListArgs = ParsedArgs<{
  pattern: { type: "positional"; required: false }
  all: { type: "boolean"; default: false }
  json: { type: "boolean"; default: false }
}>

type RefArgs = ParsedArgs<{
  id: { type: "positional"; required: true }
  json: { type: "boolean"; default: false }
  yes: { type: "boolean"; default: false }
}>

export function sessionCommand(cli: Cli) {
  return defineCommand({
    meta: {
      name: "session",
      description: "Manage zaly sessions (list / show / rm / path)",
    },
    subCommands: {
      list: defineCommand({
        meta: { name: "list", description: "List sessions in the current scope" },
        args: {
          pattern: {
            type: "positional",
            description: "Substring filter for session ids",
            required: false,
          },
          all: {
            type: "boolean",
            description: "Across all scopes (not just the current cwd)",
            default: false,
          },
          json: { type: "boolean", description: "JSON output", default: false },
        },
        run: ({ args }) => list(cli, args as unknown as ListArgs),
      }),
      show: defineCommand({
        meta: { name: "show", description: "Show session metadata + tail" },
        args: {
          id: { type: "positional", description: "Session id or file path", required: true },
          json: { type: "boolean", description: "JSON output", default: false },
        },
        run: ({ args }) => show(cli, args as unknown as RefArgs),
      }),
      rm: defineCommand({
        meta: { name: "rm", description: "Delete a session" },
        args: {
          id: { type: "positional", description: "Session id or file path", required: true },
          yes: {
            type: "boolean",
            alias: ["y"],
            description: "Skip confirmation prompt",
            default: false,
          },
        },
        run: ({ args }) => remove(cli, args as unknown as RefArgs),
      }),
      path: defineCommand({
        meta: { name: "path", description: "Print resolved session file path" },
        args: {
          id: { type: "positional", description: "Session id or file path", required: true },
        },
        run: ({ args }) => path(cli, args as unknown as RefArgs),
      }),
    },
    // Bare `zaly session` defaults to `list` in the current scope.
    // Skip when a sub-subcommand consumed the invocation (citty fires
    // the parent's `run` regardless after a child returns).
    run: ({ args }) => {
      if (args._.length > 0) return
      return list(cli, { _: [], all: false, json: false } as unknown as ListArgs)
    },
  })
}

async function list(_cli: Cli, args: ListArgs): Promise<void> {
  // Without `--all`, scope to the current cwd. With `--all`, omit the
  // filter so the manager walks every project scope.
  const sessions = await listSessions({
    filter: args.all ? undefined : normPath(),
    sort: true,
  })
  const filtered = args.pattern
    ? sessions.filter((s) => s.id.toLowerCase().includes((args.pattern as string).toLowerCase()))
    : sessions

  if (args.json) {
    console.log(JSON.stringify(filtered, undefined, 2))
    return
  }
  if (filtered.length === 0) {
    console.error(args.all ? "no sessions found" : "no sessions in this scope")
    return
  }
  const messages = await Promise.all(
    filtered.map((s) => Session.lastMessage({ path: s.path }).catch(() => undefined))
  )
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i]
    const m = messages[i]
    const mt = m ? stringifyContent(m.content) : "—"
    const when = s.mtime ? new Date(s.mtime).toISOString() : "—"
    console.log(`${when}\t${s.workspace}\t${s.id}\t${mt}`)
  }
}

async function show(cli: Cli, args: RefArgs): Promise<void> {
  const s = await resolve(cli, args.id)
  if (args.json) {
    console.log(JSON.stringify(s, undefined, 2))
    return
  }
  console.log(`id:    ${s.id}`)
  console.log(`workspace: ${s.workspace}`)
  console.log(`path:  ${s.path}`)
  if (s.mtime !== undefined) {
    console.log(`mtime: ${new Date(s.mtime).toISOString()}`)
  }
}

async function remove(cli: Cli, args: RefArgs): Promise<void> {
  const s = await resolve(cli, args.id)
  if (!args.yes) {
    console.error(`refusing to delete \`${s.dir}\` without --yes`)
    process.exit(1)
  }
  await rm(s.dir, { force: true, recursive: true })
  console.log(`deleted ${s.dir}`)
}

async function path(cli: Cli, args: RefArgs): Promise<void> {
  const s = await resolve(cli, args.id)
  console.log(s.path)
}

/** Polymorphic resolver: id (under current scope), path-to-jsonl, or
 *  path-to-session-dir. Errors out cleanly when the session can't be
 *  located. */
async function resolve(cli: Cli, ref: string | undefined): Promise<SessionInfo> {
  if (!ref) {
    console.error("session id or path required")
    process.exit(1)
  }
  // Path forms — anything that looks file-system-ish.
  if (ref.includes("/") || ref.endsWith(".jsonl") || isAbsolute(ref)) {
    const filePath = ref.endsWith(".jsonl") ? ref : `${ref.replace(/\/$/, "")}/session.jsonl`
    const dir = dirname(filePath)
    const id = basename(dir)
    const workspace = basename(dirname(dir))
    return { dir, id, path: filePath, workspace }
  }
  // Plain id — look up under current scope first, fall back to any scope.
  const inScope = await listSessions({
    filter: { workspace: cli.ctx.flags.cwd, id: ref },
    sort: true,
  })
  const matches =
    inScope.length > 0 ? inScope : await listSessions({ filter: { id: ref }, sort: true })
  if (matches.length === 0) {
    console.error(`no session found with id \`${ref}\``)
    process.exit(1)
  }
  return matches[0]
}
