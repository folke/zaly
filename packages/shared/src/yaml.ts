import type { DumpOptions, LoadOptions } from "js-yaml"

import { safeFn } from "./utils.ts"

export type YamlParseOpts = LoadOptions & { repair?: boolean }
export type YamlStringifyOpts = DumpOptions

export async function parseYaml(yaml: string, opts?: YamlParseOpts): Promise<unknown> {
  const { load } = await import("js-yaml")
  const { repair, ...loadOpts } = opts ?? {}
  if (!(repair ?? true)) return load(yaml, loadOpts)

  let err: unknown
  try {
    return load(yaml, loadOpts)
  } catch (error) {
    err = error
  }

  try {
    return load(repairYaml(yaml), loadOpts)
  } catch {
    throw err
  }
}

export const safeParseYaml = safeFn(parseYaml)

export function repairYaml(yaml: string): string {
  return repairPlainColonScalars(repairIndentTabs(stripYamlFence(yaml)))
}

function stripYamlFence(yaml: string): string {
  const match = /^\s*```(?:ya?ml)?\s*\n([\s\S]*?)\n```\s*$/.exec(yaml)
  return match?.[1] ?? yaml
}

function repairIndentTabs(yaml: string): string {
  return yaml.replace(/^\t+/gm, (tabs) => "  ".repeat(tabs.length))
}

function repairPlainColonScalars(yaml: string): string {
  return yaml.replace(/^(\s*)([\w.-]+):\s+([^\n]*:\s+[^\n]*)$/gm, repairPlainColonScalar)
}

function repairPlainColonScalar(match: string, indent: string, key: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /^["'[{|>&*!]/.test(trimmed)) return match
  return `${indent}${key}: >-\n${indent}  ${trimmed}`
}

function yamlObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function stringifyYaml(value: unknown, opts?: YamlStringifyOpts): Promise<string> {
  const { dump } = await import("js-yaml")
  return dump(value, opts)
}

export async function parseFrontmatter(
  content: string,
  opts?: YamlParseOpts
): Promise<{ fm: Record<string, unknown>; body: string }> {
  const match = /^---\n([\s\S]+?)\n---\n?/.exec(content)
  if (!match) {
    return { body: content, fm: {} }
  }

  const [, yaml] = match
  const fm = yamlObject(await parseYaml(yaml, opts))
  const body = content.slice(match[0].length).trimStart()
  return { body, fm }
}
