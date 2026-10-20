import type { ActionDef } from "@zaly/tui"
import type { ArgDef } from "citty"
import type { App } from "../../cli/src/app/app.ts"

import { readFile, writeFile } from "node:fs/promises"
import { join } from "pathe"
import { permissionPresets } from "../../agent/src/permissions/presets.ts"
import { toolRegistry } from "../../agent/src/tools/registry.ts"
import { appActions } from "../../cli/src/app/actions.ts"
import { Cli, mainCommand } from "../../cli/src/cli.ts"
import { modelsCommand } from "../../cli/src/commands/models.ts"
import { defaultSettings } from "../../config/src/defaults.ts"
import { ConfigSchema } from "../../config/src/schemas/gen/config.schema.ts"
import { defaultActions } from "../../tui/src/input/defaults.ts"
import { workspace } from "./utils.ts"

export const referenceRegions: Record<string, string> = {
  "cli.md": "cli",
  "commands.md": "commands",
  "keybindings.md": "keys",
  "settings.md": "settings",
  "tools.md": "tools",
}
const code = (value: unknown) => `\`${String(value).replaceAll("`", "&#96;")}\``
const prose = (value: string) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const cell = (value: string) =>
  prose(value)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ")
const json = (value: unknown) => `\n\`\`\`json\n${JSON.stringify(value, undefined, 2)}\n\`\`\`\n`

type Schema = {
  type?: string
  description?: string
  enum?: unknown[]
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
  $ref?: string
  anyOf?: Schema[]
  oneOf?: Schema[]
  additionalProperties?: boolean | Schema
}

export function schemaType(schema: Schema): string {
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ")
  if (schema.$ref) return schema.$ref.split("/").at(-1) ?? "object"
  if (schema.type === "array") return `Array<${schemaType(schema.items ?? {})}>`
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) return variants.map(schemaType).join(" | ")
  return schema.type ?? "unknown"
}

export function settingsReference(): string {
  const definitions = ConfigSchema.components.schemas as Record<string, Schema>
  const root = ConfigSchema.schema as Schema
  const deref = (schema: Schema) =>
    schema.$ref ? (definitions[schema.$ref.split("/").at(-1)!] ?? schema) : schema
  const lines: string[] = []
  const walk = (schema: Schema, path: string, defaults: unknown) => {
    const resolved = deref(schema)
    if (path) {
      lines.push(`## ${code(path)}`, "", `**Type:** ${code(schemaType(resolved))}`, "")
      if (schema.description) lines.push(prose(schema.description), "")
      if (defaults !== undefined && !resolved.properties)
        lines.push(
          `**Default:** ${path === "system.npm" ? "runtime-dependent" : code(JSON.stringify(defaults))}`,
          ""
        )
      if (resolved.additionalProperties && typeof resolved.additionalProperties === "object")
        lines.push("Values:", json(deref(resolved.additionalProperties)))
    }
    for (const [key, property] of Object.entries(resolved.properties ?? {})) {
      walk(
        property,
        path ? `${path}.${key}` : key,
        (defaults as Record<string, unknown> | undefined)?.[key]
      )
    }
  }
  walk(root, "", {
    ...defaultSettings,
    tools: defaultSettings.tools.filter((name) => name !== "search"),
  })
  lines.push("## Permission presets", "")
  for (const [name, preset] of Object.entries(permissionPresets))
    lines.push(`### ${name}`, "", preset.description, "", json(preset.rules))
  return lines.join("\n")
}

export async function referencePages(): Promise<Record<string, string>> {
  // Construct metadata only: action handlers and CLI setup/run hooks are never executed.
  const actions: Record<string, ActionDef> = {
    ...defaultActions,
    ...appActions({ app: { renderer: { terminal: { mouse: true } } } as App }),
  }
  const cli = new Cli()
  const commands: string[] = []
  for (const [id, action] of Object.entries(actions).toSorted(([a], [b]) => a.localeCompare(b))) {
    if (!action.cmd || action.hidden) continue
    commands.push(`## /${action.cmd}`, "", prose(action.desc ?? ""), "", `Action: ${code(id)}`, "")
    for (const [name, arg] of Object.entries(action.args ?? {}))
      commands.push(
        `- ${code(arg.positional ? name : `--${name}`)}: ${prose(arg.desc ?? "")} (${arg.type})`
      )
    commands.push("")
  }
  const keys = ["| Action | Keys | Description |", "| --- | --- | --- |"]
  for (const [id, action] of Object.entries(actions).toSorted(([a], [b]) => a.localeCompare(b))) {
    const bindings = typeof action.keys === "string" ? [action.keys] : action.keys
    if (!bindings?.length) continue
    keys.push(`| ${code(id)} | ${bindings.map(code).join(", ")} | ${cell(action.desc ?? "")} |`)
  }
  const flags: string[] = []
  for (const [name, command] of [
    ["zaly", mainCommand(cli)],
    ["zaly models", modelsCommand(cli)],
  ] as const) {
    flags.push(`## ${name}`, "", "| Argument | Type | Description |", "| --- | --- | --- |")
    for (const [key, arg] of Object.entries(command.args ?? {}) as [string, ArgDef][]) {
      const alias = "alias" in arg ? arg.alias : undefined
      const aliases = alias
        ? (Array.isArray(alias) ? alias : [alias]).map((value) =>
            code(`${value.length === 1 ? "-" : "--"}${value}`)
          )
        : []
      const type = arg.type === "enum" ? (arg.options?.join(", ") ?? "enum") : arg.type
      flags.push(
        `| ${[code(arg.type === "positional" ? key : `--${key}`), ...aliases].join(", ")} | ${code(type)} | ${cell(arg.description ?? "")} |`
      )
    }
    flags.push("")
  }
  const tools: string[] = []
  const catalog = await Promise.all(
    [...toolRegistry.keys()]
      .toSorted()
      .map(async (name) => ({ name, tool: await toolRegistry.load(name) }))
  )
  for (const { name, tool } of catalog)
    tools.push(`## ${name}`, "", prose(tool.desc ?? ""), "", "### Parameters", json(tool.params))
  return {
    "cli.md": flags.join("\n"),
    "commands.md": commands.join("\n"),
    "keybindings.md": keys.join("\n"),
    "settings.md": settingsReference(),
    "tools.md": tools.join("\n"),
  }
}

export function updateRegion(source: string, name: string, contents: string): string {
  const markers = [...source.matchAll(/^<!-- ([\w-]+):(start|end) -->(?=\r?$)/gm)]
  const own = markers.filter((marker) => marker[1] === name)
  const [start, end] = own
  if (own.length !== 2 || start[2] !== "start" || end[2] !== "end") {
    throw new Error(`Expected one ordered pair of ${name}:start / ${name}:end markers`)
  }
  if (markers.some((marker) => marker.index > start.index && marker.index < end.index)) {
    throw new Error(`Nested or mismatched markers inside ${name}`)
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n"
  const body = contents.trimEnd().replace(/\r?\n/g, newline)
  return `${source.slice(0, start.index + start[0].length)}${newline}${body}${newline}${source.slice(end.index)}`
}

export async function generateDocs(dir = join(workspace, "docs/reference")): Promise<void> {
  const pages = await referencePages()
  // Validate every region before writing so malformed markers cannot cause partial updates.
  const updates = await Promise.all(
    Object.entries(pages).map(async ([name, contents]) => {
      const path = join(dir, name)
      const before = await readFile(path, "utf8")
      return { after: updateRegion(before, referenceRegions[name], contents), before, path }
    })
  )
  await Promise.all(
    updates
      .filter(({ before, after }) => before !== after)
      .map(({ path, after }) => writeFile(path, after))
  )
}

if (import.meta.main) await generateDocs()
