/**
 * Cross-runtime env detection. Intentional public surface — every
 * symbol here is exposed via `@zaly/shared/env` regardless of whether
 * it currently has an internal consumer.
 *
 * @public
 */

const argv = process.argv
const env = process.env

export const hasTTY = process.stdout.isTTY && env.TERM !== "dumb"
export const isWin = process.platform === "win32"
export const isCI = !!env.CI

export const termCols = { get: () => (hasTTY ? process.stdout.columns : 80) }
export const termRows = { get: () => (hasTTY ? process.stdout.rows : 24) }
export const nodeENV: string | undefined = process.env.NODE_ENV

export const isTest: boolean = nodeENV === "test" || !!env.TEST

export const hasColors =
  !(!!env.NO_COLOR || argv.includes("--no-color")) &&
  (!!env.FORCE_COLOR || argv.includes("--color") || isWin || hasTTY || isCI || isTest)

/** True when the process looks like it's running under SSH. Native
 *  clipboard tools on the remote host write to the *remote* clipboard,
 *  which is rarely what the user wants — flip to OSC 52 instead. Other
 *  tools may also want to behave differently in remote sessions. */
export const isSSH = process.env.SSH_TTY ?? process.env.SSH_CONNECTION ?? process.env.SSH_CLIENT
