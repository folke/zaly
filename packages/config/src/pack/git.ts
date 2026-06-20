import type { SpawnOpts } from "@zaly/shared/process"
import type { PackManagerOpts } from "./manager.ts"
import type { PackPath } from "./uri.ts"

import { safeStatAsync } from "@zaly/shared"
import { spawnCmd } from "@zaly/shared/process"
import { mkdir, rm, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "pathe"
import { Pack } from "./manager.ts"

function asCommit(s?: string): string | undefined {
  return s && /^([0-9a-f]{40})$/.test(s) ? s : undefined
}

export type GitOpts = SpawnOpts & {
  cwd?: string
  throw?: boolean
}

type GitArgs = (string | undefined)[] | [...(string | undefined)[], GitOpts]

export class Git {
  #remote = new Map<string, { ts: number; value: string | undefined }>()
  remoteTtl = 30_000

  constructor(
    public dir: string,
    public cmd = ["git"]
  ) {}

  async run(...cmd: GitArgs): Promise<string | undefined> {
    return spawnCmd(...this.cmd, { cwd: this.dir }, ...cmd)
  }

  get sentinel() {
    return `${this.dir}.cloning`
  }

  /** Fast check if the repo exists and has been cloned. */
  async exists() {
    const hasGit = await safeStatAsync(join(this.dir, ".git"))
    if (!hasGit) return false
    const s = await safeStatAsync(this.sentinel)
    return s === undefined
  }

  async clone(repo: string) {
    this.#clearRemoteCache()
    await rm(this.dir, { force: true, recursive: true })
    await mkdir(dirname(this.sentinel), { recursive: true })
    await writeFile(this.sentinel, "")
    const ret = await this.run(
      "clone",
      "--filter=blob:none",
      "--origin=origin",
      "-c",
      "core.autocrlf=false",
      "--tags",
      "--",
      repo,
      this.dir,
      { cwd: undefined }
    )
    await unlink(this.sentinel).catch(() => {})
    return ret
  }

  async checkout(ref = "HEAD") {
    return this.run("checkout", "--force", ref)
  }

  async fetch(ref?: string) {
    this.#clearRemoteCache()
    return this.run("fetch", "--prune", "--tags", "--force", "origin", ref)
  }

  async ref(ref = "HEAD") {
    return this.run("rev-parse", `${ref}^{commit}`, { throw: false })
  }

  async head() {
    return this.ref()
  }

  async remote(ref = "HEAD") {
    const cached = this.#remote.get(ref)
    const ts = Date.now()
    if (cached && ts - cached.ts < this.remoteTtl) return cached.value
    const r = await this.run("ls-remote", "origin", ref, { throw: false })
    const value = r?.split("\n")[0]?.split("\t")[0]
    this.#remote.set(ref, { ts, value })
    return value
  }

  #clearRemoteCache() {
    this.#remote.clear()
  }
}

export class GitPack extends Pack<"git"> {
  #git: Git

  constructor(packPath: PackPath<"git">, opts: PackManagerOpts) {
    super(packPath, opts)
    this.#git = new Git(packPath.dir, opts.git)
  }

  /** Get target commit for this uri.
   * If the uri has a ref, this can return undefined if the ref doesn't exist in the local repo.
   * Without ref, we fetch the remote HEAD */
  async #target() {
    return asCommit(
      this.parsed.ref ? await this.#git.ref(this.parsed.ref) : await this.#git.remote()
    )
  }

  async installed() {
    return await this.#git.exists()
  }

  async install(): Promise<void> {
    await this.#git.clone(this.parsed.repo)
    const didUpdate = await this.update()
    if (!didUpdate) await this.#build()
  }

  async update(): Promise<boolean> {
    const head = await this.#git.head()
    const target = await this.#target()
    if (head === target) return false
    await this.#git.fetch(this.parsed.ref ?? "HEAD")
    await this.#git.checkout("FETCH_HEAD")
    await this.#build()
    return true
  }

  async hasUpdate() {
    const head = await this.#git.head()
    if (!head) return true
    const target = await this.#target()
    return head !== target
  }

  override async info() {
    return {
      ...(await super.info()),
      head: await this.#git.head(),
      target: await this.#target(),
    }
  }

  async #build() {
    const s = await safeStatAsync(join(this.dir, "package.json"))
    if (!s) return
    await spawnCmd(...this.opts.npm, "install", { cwd: this.dir })
  }
}
