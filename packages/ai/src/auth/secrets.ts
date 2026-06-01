import type { AuthProvider } from "./auth.ts"

import { safeReadFile } from "@zaly/shared"

export type AuthSecrets = Record<string, Secret>

export type Secret =
  | { source: "env"; key: string }
  | { source: "exec"; cmd: string; args?: string[] } // see security note
  | { source: "file"; path: string }
  | { source: "literal"; value: string } // escape hatch / tests

/** Auth provider that resolves secrets from various sources. To use, set `model.apiKey`
 * to a string like `${secret:SECRET_NAME}` or `$secret:SECRET_NAME`, and register this
 * provider with the secrets. */
export function secretsAuth(secrets: AuthSecrets): AuthProvider {
  const manager = new SecretsManager(secrets)
  return {
    async getAuth(model) {
      const apiKey = model.apiKey
      if (!apiKey) return
      const m = apiKey.match(
        /^(?:\$\{secret:([A-Za-z_][A-Za-z0-9_]*)\}|\$secret:([A-Za-z_][A-Za-z0-9_]*))$/
      )
      if (!m) return
      const secret = m[1] || m[2]
      if (!manager.has(secret)) return
      return { apiKey: await manager.get(secret) }
    },
    priority: 100, // higher than envAuth to take precedence when both are registered
  }
}

export class SecretsManager {
  #secrets: Record<string, Secret>
  #cache = new Map<string, Promise<string>>()

  constructor(secrets: Record<string, Secret>) {
    this.#secrets = secrets
  }

  has(name: string): boolean {
    return name in this.#secrets
  }

  list(): string[] {
    return Object.keys(this.#secrets)
  }

  async get(name: string): Promise<string> {
    let ret = this.#cache.get(name)
    if (!ret) this.#cache.set(name, (ret = this.#resolve(name)))
    return ret
  }

  async #resolve(name: string): Promise<string> {
    const secret = this.#secrets[name] as Secret | undefined
    if (!secret) throw new Error(`Secret \`${name}\` not found`)

    let value: string | undefined
    if (secret.source === "env") {
      value = process.env[secret.key]
      if (!value) throw new Error(`Environment variable \`${secret.key}\` is not set`)
    } else if (secret.source === "file") {
      value = await safeReadFile(secret.path)
      value = value?.trim()
      if (!value) throw new Error(`Secret file at \`${secret.path}\` is empty or unreadable`)
    } else if (secret.source === "exec") {
      const { Spawn, TextStream } = await import("@zaly/shared/process")
      const r = await new Spawn(secret.cmd, secret.args ?? [], {
        stderr: new TextStream(),
        stdout: new TextStream(),
      }).result
      if (r.code !== 0)
        throw new Error(
          `Command \`${secret.cmd}\` failed with exit code ${r.code} and error: ${r.stderr.trim()}`
        )
      value = r.stdout.trim()
      if (!value) throw new Error(`Command \`${secret.cmd}\` did not return any output`)
    } else value = secret.value
    return value
  }
}
