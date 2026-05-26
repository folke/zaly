import type { MetaPart, TextPart, Tool } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { glob } from "@zaly/shared/glob"
import { readFile } from "node:fs/promises"
import { dirname } from "pathe"
import { Type } from "typebox"

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
}

export interface SkillsOptions {
  /** SKILL.md paths, sorted from highest to lowest precedence. */
  paths?: string[]
}

export class Skills {
  readonly catalog = new Map<string, SkillEntry>()
  #tool?: Tool
  #opts: SkillsOptions

  protected constructor(opts: SkillsOptions = {}) {
    this.#opts = opts
  }

  static async load(opts?: SkillsOptions): Promise<Skills> {
    return new Skills(opts).reload()
  }

  /** (Re)scan project + user `.agent/skills/` directories. Wipes the
   *  current catalog and the cached tool, then repopulates. Safe to
   *  call mid-session — agent uses `this.tool` per-step so the next
   *  request after reload picks up the change. */
  async reload(): Promise<this> {
    this.catalog.clear()
    this.#tool = undefined
    const paths = this.#opts.paths ?? []
    await Promise.all(paths.map(async (path) => await this.add(path)))
    return this
  }

  async add(path: string): Promise<void> {
    if (!path.endsWith("SKILL.md")) return
    const dir = dirname(path)
    try {
      const { meta } = await readSkill(path)
      if (!meta.name || !meta.description || this.catalog.has(meta.name)) return
      this.catalog.set(meta.name, {
        description: meta.description,
        dir,
        name: meta.name,
        path,
      })
    } catch {}
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

    const { body } = await readSkill(skill.path)
    const references = await listReferences(skill.dir)

    return [
      {
        data: { dir: skill.dir, name: skill.name, references },
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

async function readSkill(
  path: string
): Promise<{ meta: { name?: string; description?: string }; body: string }> {
  const raw = await readFile(path, "utf8")
  const { parseFrontmatter } = await import("@zaly/shared/yaml")
  const { fm, body } = await parseFrontmatter(raw)
  return { body, meta: fm }
}

async function listReferences(dir: string): Promise<string[]> {
  const out: string[] = []
  for await (const rel of glob("**", { cwd: dir, depth: 4, type: "file" })) {
    if (rel === "SKILL.md" || rel.endsWith("/SKILL.md")) continue
    out.push(rel)
    if (out.length >= 200) break
  }
  return out.toSorted()
}
