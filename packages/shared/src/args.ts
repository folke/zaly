import type { parseArgs, ParseArgsConfig, ParseArgsOptionsConfig } from "node:util"

export type ParsedArgs<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>
export type ArgsOpts = ParseArgsOptionsConfig

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
  return { ...parsed.values, $: cmd, _: parsed.positionals } as ArgsResult<T>
}

export function argsUsage(name: string, opts: ParseArgsOptionsConfig): string {
  const flags = Object.entries(opts).map(([opt, config]) => {
    const neg = config.type === "boolean" && config.default === true
    const flag = `--${neg ? `no-${opt}` : opt}`
    const value = config.type === "string" ? " <value>" : ""
    const short = config.short ? `-${config.short}, ` : ""
    return `[${short}${flag}${value}]`
  })
  return [name, ...flags, "[args...]"].join(" ")
}
