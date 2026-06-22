import type { parseArgs, ParseArgsConfig, ParseArgsOptionsConfig } from "node:util"

export type ParsedArgs<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>
type ParseArgOption = ParseArgsOptionsConfig[string]

export type ArgsOption = ParseArgOption & {
  desc?: string
  required?: boolean
}
export type ArgsOpts = Record<string, ArgsOption>

export type ParsedArgsResult<T extends ParseArgsConfig> = ParsedArgs<T>["values"] & {
  _: string[]
  $: string
}

export type ArgsResult<T extends ArgsOpts = ArgsOpts> = ParsedArgsResult<{
  allowPositionals: true
  options: T
}>

export async function argsParse<T extends ArgsOpts>(
  cmd: string,
  options: T
): Promise<ArgsResult<T>> {
  const { parseArgs } = await import("node:util")
  const { shellSplit } = await import("./shell.ts")
  const argv = await shellSplit(cmd)

  const parsed = parseArgs<{
    allowPositionals: true
    allowNegative: true
    args: string[]
    options: T
  }>({
    allowNegative: true,
    allowPositionals: true,
    args: argv,
    options,
  })
  const values = parsed.values as Record<string, unknown>
  if (!values.help) {
    for (const [key, opt] of Object.entries(options)) {
      if (opt.required && values[key] === undefined) {
        throw new Error(`Missing required argument: --${key}`)
      }
    }
  }
  return { ...parsed.values, $: cmd, _: parsed.positionals } as ArgsResult<T>
}

export function argsUsage(name: string, opts: ArgsOpts): string {
  const flags = Object.entries(opts).map(([opt, config]) => {
    const neg = config.type === "boolean" && config.default === true
    const flag = `--${neg ? `no-${opt}` : opt}`
    const value = config.type === "string" ? " <value>" : ""
    const short = config.short ? `-${config.short}, ` : ""
    const ret = `${short}${flag}${value}`
    return config.required ? ret : `[${ret}]`
  })
  return [name, ...flags, "[args...]"].join(" ")
}
