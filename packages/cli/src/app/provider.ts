import type { AuthSource, ModelProvider } from "@zaly/ai"
import type { Accessor } from "@zaly/tui"
import type { Select } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { toError } from "@zaly/shared"
import { createRef, memo, signal } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { divider } from "@zaly/tui/widgets/divider"
import { input } from "@zaly/tui/widgets/input"
import { markdown } from "@zaly/tui/widgets/markdown"
import { overlay } from "@zaly/tui/widgets/overlay"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"

type AuthStatus = {
  source: AuthSource | "no-auth"
  details?: string
}

const recommended = new Set(["openai", "openai-codex", "anthropic", "openrouter", "google"])

function isRecommended(p: ModelProvider): boolean {
  return recommended.has(p.id) || p.source === "custom"
}

export async function listProviders(app: App): Promise<void> {
  const model = await app.ctx.model()
  const auth = await app.ctx.auth()
  const providers = await model.providers()

  const authStatus = async (p: ModelProvider): Promise<AuthStatus | undefined> => {
    if (!p.oauth && !p.env?.length && !p.apiKey) return { source: "no-auth" }
    const a = await auth.getAuth(p)
    return a ? { details: a.details, source: a.source } : undefined
  }

  const items = await Promise.all(
    providers.map(async (p) => {
      const status = await authStatus(p)
      return {
        desc: p.doc,
        enabled: !!status,
        provider: p,
        status,
        text: p.name,
      }
    })
  )

  items.sort((a, b) => {
    const ar = isRecommended(a.provider) ? 0 : 1
    const br = isRecommended(b.provider) ? 0 : 1
    if (ar !== br) return ar - br
    if (a.enabled && !b.enabled) return -1
    if (!a.enabled && b.enabled) return 1
    return a.text.localeCompare(b.text)
  })

  const ref = createRef<Select<(typeof items)[0]>>()

  await app.pick({
    actions: {
      "provider.login": {
        desc: "Login to the selected provider",
        fn: () => {
          const select = ref()
          const item = select.item
          if (!item) return
          const provider = item.provider
          void app.ctx.logger.try(async () => {
            try {
              await login(app, provider)
              item.enabled = !!(await authStatus(provider))
              select.invalidate()
            } catch (error) {
              app.ctx.logger.error(`Failed to login to provider ${provider.name}:`, error)
              app.picker.close()
            }
          })
        },
        keys: ["tab", "enter"],
        priority: 10,
      },
    },
    items,
    multi: { action: false, render: true },
    ref,
    render: (item, ctx) => {
      const s = ctx.style
      // const icon = item.enabled ? s.accent(`●`) : s.muted("○")
      let statusText = "not connected"
      const source = item.status?.source
      if (source === "oauth") statusText = "oauth"
      else if (source === "env") statusText = "env"
      else if (source === "store") statusText = "API key"
      else if (source === "no-auth") statusText = "no auth"
      else if (source === "model") statusText = "model API Key"
      else if (source === "provider") statusText = "provider API Key"
      statusText = statusText.padEnd(25)
      const d = item.status?.details
      const envs = [...(item.provider.env ?? [])]
      let env = d && envs.includes(d) ? d : (envs[0] as string | undefined)
      const isActive = d && env === d
      if (env) {
        env = env.padEnd(30)
        env = isActive ? s.syntaxDelimiter("$") + s.syntaxConstant(env) : s.muted(`$${env}`)
      } else env = "".padEnd(31)
      const status = item.enabled ? s.success(`✓ ${statusText}`) : s.muted(`• ${statusText}`)
      return `${s.optionName(item.text.padEnd(33))} ${status} ${env} ${item.desc ? s.muted(item.desc) : ""}`
    },
    title: "Select a provider",
    whichKey: true,
  })
}

type AuthProps = {
  details: Accessor<string>
  prompt: Accessor<string | undefined>
  onSubmit?: (value?: string) => void
}

function authOverlay(props: AuthProps) {
  const ret = overlay(
    {
      border: "rounded",
      borderTitle: "esc",
      borderTitleAlign: "right",
      borderTitleStyle: "accent",
      horizontalAnchor: "center",
      maxWidth: "80%",
      style: "overlay",
      verticalAnchor: "center",
      visible: memo(() => props.prompt() !== undefined || props.details() !== ""),
      width: 80,
      x: 0.5,
      y: 0.5,
    },
    box({ padding: [0, 1] }, markdown(props.details)),
    show({ when: memo(() => props.prompt() !== undefined) }, () => [
      divider(),
      box(
        { flexDirection: "row", gap: 1, style: "ui" },
        text(({ style }) => style.primary("❯"), { width: 1 }),
        input({ placeholder: props.prompt })
          .focus()
          .on("submit", (ev) => props.onSubmit?.(ev.value))
      ),
    ])
  ).focus()
  return ret
}

export async function login(app: App, provider?: ModelProvider): Promise<void> {
  const auth = await app.ctx.auth()
  provider ??= app.agent.model?.spec.provider
  if (!provider) throw new Error("No model provider configured for the current model")

  const methods = await auth.login(provider)
  if (!methods.length) {
    app.notify(`No login methods available for provider **${provider.name}**.`, {
      level: "warn",
      title: "Login",
    })
    return
  }

  const items = methods.map((m) => ({ method: m, name: m.desc, text: m.desc }))

  const item = items.length === 1 ? items[0] : await app.pick({ active: 0, items })
  if (!item) return

  const [details, setDetails] = signal("")
  const [prompt, setPrompt] = signal<string | undefined>(undefined)

  const ac = new AbortController()
  let submit: PromiseWithResolvers<string | undefined> | undefined

  const node = app.renderer.overlay.add(() =>
    authOverlay({
      details,
      onSubmit: (value) => submit?.resolve(value),
      prompt,
    })
  )
  node.on("unmount", () => {
    submit?.resolve(undefined)
    ac.abort()
  })

  app.picker.suspend()

  try {
    const apiKey = await app.do(() =>
      item.method.login({
        browse: (url) => void openBrowser(url),
        notify: (opts) => {
          setDetails(`# ${opts.title}\n\n${opts.details ?? ""}`)
        },
        prompt: (msg) => {
          setPrompt(msg)
          submit = Promise.withResolvers<string | undefined>()
          return submit.promise
        },
        signal: ac.signal,
      })
    )
    if (!apiKey) return

    app.notify(`Logged in to **${provider.name}** successfully.`, {
      level: "success",
      title: "Login",
    })
  } catch (error) {
    app.notify(`Failed to login to **${provider.name}**:\n${toError(error)}`, {
      level: "error",
      title: "Login",
    })
  } finally {
    app.renderer.overlay.close(node)
    app.picker.resume()
    submit?.resolve(undefined)
  }
}

/** Best-effort cross-platform `xdg-open`/`open`/`start` shim. Failures
 *  are silent — the URL has already been printed for the user. */
async function openBrowser(url: string): Promise<void> {
  let cmd: string[]
  if (process.platform === "darwin") cmd = ["open", url]
  else if (process.platform === "win32") cmd = ["cmd", "/c", "start", "", url]
  else cmd = ["xdg-open", url]
  const { spawn } = await import("node:child_process")
  try {
    spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" }).unref()
  } catch {
    // No `open` available — user can copy from the printed URL.
  }
}
