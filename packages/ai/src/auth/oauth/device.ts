import type { OAuthDeviceCode, OAuthDeviceLogin, OAuthToken } from "./types.ts"

// oxlint-disable no-await-in-loop
import { wrapSafeFetch } from "./utils.ts"

export async function deviceCodeLogin(opts: OAuthDeviceLogin): Promise<OAuthToken | undefined> {
  const device = await opts.start({
    fetch: wrapSafeFetch({ signal: opts.signal }),
    ...opts,
  })

  await opts.onDeviceCode?.(device)
  if (!opts.onDeviceCode) {
    void opts.browse?.(device.verificationUrl)
    await opts.notify?.({
      details: `Open [this URL](${device.verificationUrl}) in your browser, and enter code \`${device.userCode}\` to authorize ${opts.name}.

[${device.verificationUrl}](${device.verificationUrl})`,
      title: `**${opts.name}** Login (headless)`,
    })
  }
  return await pollDevice(device, opts)
}

async function pollDevice(
  device: OAuthDeviceCode,
  opts: OAuthDeviceLogin
): Promise<OAuthToken | undefined> {
  let delay = device.interval * 1000
  while (!opts.signal?.aborted) {
    await sleep(delay, opts.signal)
    if (opts.signal?.aborted) return
    if (Date.now() > device.expires) throw new Error(`OAuth ${opts.name} device login expired`)
    const res = await opts.poll(device, {
      fetch: wrapSafeFetch({ signal: opts.signal }),
      ...opts,
    })
    if (res.ok) return res
    if (res.status === "pending") continue
    if (res.status === "slow_down") {
      delay += 5000
      continue
    }
    throw new Error(
      `OAuth ${opts.name} device login failed:\n\`\`\`json\n${JSON.stringify(res)}\n\`\`\``
    )
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}
