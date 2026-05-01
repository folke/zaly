import type { MetaPart, TextPart, Tool } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { readFile } from "node:fs/promises"
import { dirname, join } from "pathe"
import { Type } from "typebox"
import { glob } from "./utils/glob.ts"
import { findResource } from "./utils/resource.ts"

/**
 * Agent Skills support — discovery, catalog, and the activation tool.
 *
 * Locations scanned (subdirectories containing `SKILL.md`):
 *   - `${cwd}/.agent/skills/`         — project
 *   - `${homedir()}/.agent/skills/`   — user (cross-project)
 *
 * Project shadows user on name collision.
 *
 * Progressive disclosure (per the Agent Skills spec):
 *   - Catalog (name + description) lives in the tool's schema /
 *     description. The model sees this from the start.
 *   - Body of the SKILL.md is loaded only when the tool is invoked.
 *   - References (files under the skill's directory) are *enumerated*
 *     at activation, not read — the model reads them via the `read`
 *     tool when its instructions call for it.
 *
 * Lifecycle:
 *   - Construct with `new Skills({ cwd })` — no I/O yet.
 *   - Call `await skills.load()` to populate the catalog. Idempotent;
 *     re-call to pick up newly installed skills (`/reload-plugins`).
 *   - `skills.tool` returns the current activation tool, or undefined
 *     when the catalog is empty. Lazily built; invalidated on reload.
 */

export interface SkillEntry {
  name: string
  description: string
  /** Absolute path to the SKILL.md file. */
  path: string
  /** Absolute path to the skill's base directory (parent of SKILL.md).
   *  Used as the workspace anchor for permissions and as the root for
   *  resolving references. */
  dir: string
  /** Where the skill was found — `project` shadows `user` on collisions. */
  scope: "project" | "user"
}

export interface SkillsOptions {
  /** Project root scanned for `${cwd}/.agent/skills/`. Defaults to
   *  `process.cwd()`. */
  cwd?: string
}

export class Skills {
  readonly catalog = new Map<string, SkillEntry>()
  readonly cwd: string
  #tool?: Tool

  protected constructor(opts: SkillsOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd()
  }

  static async load(opts?: SkillsOptions): Promise<Skills> {
    const skills = new Skills(opts)
    await skills.reload()
    return skills
  }

  /** (Re)scan project + user `.agent/skills/` directories. Wipes the
   *  current catalog and the cached tool, then repopulates. Safe to
   *  call mid-session — agent uses `this.tool` per-step so the next
   *  request after reload picks up the change. */
  async reload(): Promise<void> {
    this.catalog.clear()
    this.#tool = undefined

    const dirs = findResource({
      cwd: this.cwd,
      rel: "skills",
      scopes: ["user", "agent"],
      type: "dir",
    })

    const skills = await Promise.all(
      dirs.map((d) => scanScope(d.path, d.scope === "agent" ? "project" : "user"))
    )

    for (const skill of skills.flat()) {
      this.catalog.set(skill.name, skill)
    }
  }

  /** Skill base directories — pass each to `agent.permissions.addWorkspace`
   *  so the model can read bundled `references/` files without tripping
   *  permission asks. */
  get dirs(): readonly string[] {
    return [...this.catalog.values()].map((s) => s.dir)
  }

  /** The activation tool. Returns `undefined` when the catalog is empty
   *  (the agent then omits skills entirely from the model's tool list,
   *  per the spec). Lazily built on first access; invalidated by
   *  `load()`. */
  get tool(): Tool | undefined {
    if (this.catalog.size === 0) return undefined
    return (this.#tool ??= this.#buildTool())
  }

  #buildTool(): Tool {
    const names = [...this.catalog.keys()]
    // oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
    return defineTool({
      name: "skill",
      desc: this.#buildCatalogDesc(),
      parallel: true,
      params: Type.Object({
        name: Type.Union(
          names.map((n) => Type.Literal(n)),
          {
            description:
              "Name of the skill to activate. The full SKILL.md " +
              "instructions are loaded as the tool result; bundled " +
              "files in the skill's directory are listed but not read " +
              "— fetch them via the `read` tool when the skill's " +
              "instructions require them.",
          }
        ),
      }),
      call: (args) => this.#call(args.name as string),
    })
  }

  async #call(requested: string): Promise<(MetaPart | TextPart)[]> {
    const skill = this.catalog.get(requested)
    if (!skill) {
      const available = [...this.catalog.keys()]
      throw new AiError({
        code: "UNKNOWN_SKILL",
        data: { available, name: requested },
        message: `no skill named "${requested}". Available: ${available.join(", ")}`,
      })
    }

    const body = await readBody(skill.path)
    const references = await listReferences(skill.dir)

    return [
      {
        data: { dir: skill.dir, name: skill.name, references, scope: skill.scope },
        tag: "skill",
        type: "meta",
      },
      { text: body, type: "text" },
    ]
  }

  #buildCatalogDesc(): string {
    const header =
      "Activate one of the available skills below. The skill's full " +
      "SKILL.md instructions are loaded as the tool result; the model " +
      "should follow them directly. Bundled files are listed in the " +
      "result but not eagerly read — fetch the ones the skill's " +
      "instructions reference via the `read` tool."
    const lines = [...this.catalog.values()].map((s) => `- ${s.name}: ${s.description}`)
    return `${header}\n\nAvailable skills:\n${lines.join("\n")}`
  }
}

// ── Discovery ──────────────────────────────────────────────────────────

async function scanScope(root: string, scope: SkillEntry["scope"]): Promise<SkillEntry[]> {
  const out: SkillEntry[] = []
  // Depth 3 covers `.agent/skills/<name>/SKILL.md` and one extra level
  // (`.agent/skills/<category>/<name>/SKILL.md`). Bumping further pays
  // I/O cost we don't need for the skill convention.
  for await (const rel of glob({
    cwd: root,
    depth: 3,
    glob: ["**/*.md"],
    type: "file",
  })) {
    if (!rel.endsWith("/SKILL.md") && rel !== "SKILL.md") continue
    const path = join(root, rel)
    const dir = dirname(path)
    try {
      const meta = await readMeta(path)
      if (!meta.name || !meta.description) continue
      out.push({ description: meta.description, dir, name: meta.name, path, scope })
    } catch {
      // Malformed YAML / missing fields — skip. A debug log here would
      // be useful when we wire one up.
      continue
    }
  }
  return out
}

async function readMeta(path: string): Promise<{ name?: string; description?: string }> {
  const raw = await readFile(path, "utf8")
  const { frontmatter } = parseFrontmatter(raw)
  return frontmatter
}

async function readBody(path: string): Promise<string> {
  const raw = await readFile(path, "utf8")
  const parsed = parseFrontmatter(raw)
  return parsed.body.trim()
}

async function listReferences(dir: string): Promise<string[]> {
  const out: string[] = []
  for await (const rel of glob({ cwd: dir, depth: 4, type: "file" })) {
    if (rel === "SKILL.md" || rel.endsWith("/SKILL.md")) continue
    out.push(rel)
    if (out.length >= 200) break
  }
  return out.toSorted()
}

// ── Frontmatter ────────────────────────────────────────────────────────

interface ParsedFrontmatter {
  frontmatter: { name?: string; description?: string }
  body: string
}

/** Minimal `---`-delimited YAML frontmatter parser. Handles the only
 *  fields we read here (`name`, `description`) as plain string scalars,
 *  with optional surrounding quotes. Tolerant of unquoted values that
 *  contain colons (skills authored for other clients sometimes ship
 *  `description: Use this skill when: …`) — we take everything after
 *  the *first* `:` on a key line as the value. Multi-line block scalars
 *  / list values aren't supported; we don't need them. */
function parseFrontmatter(raw: string): ParsedFrontmatter {
  const lines = raw.split(/\r?\n/)
  if (lines[0] !== "---") return { body: raw, frontmatter: {} }
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i
      break
    }
  }
  if (close === -1) return { body: raw, frontmatter: {} }
  const fm: { name?: string; description?: string } = {}
  for (let i = 1; i < close; i++) {
    const line = lines[i]
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue
    const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
    if (!m) continue
    const [, key, rawValue] = m
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key === "name" || key === "description") fm[key] = value
  }
  const body = lines.slice(close + 1).join("\n")
  return { body, frontmatter: fm }
}
