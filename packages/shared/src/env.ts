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
