import type { parseArgs, ParseArgsConfig, ParseArgsOptionsConfig } from "node:util"

export type ParsedArgs<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>
type ParseArgOption = ParseArgsOptionsConfig[string]

export type ArgsOption = ParseArgOption & {
  desc?: string
  required?: boolean
  positional?: boolean
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

  const positionals: ArgsOpts = {}
  const nonPositionals: T = {} as T

  for (const [key, opt] of Object.entries(options)) {
    if (opt.positional) {
      positionals[key] = opt
    } else {
      nonPositionals[key as keyof T] = opt as T[Extract<keyof T, string>]
    }
  }

  const parsed = parseArgs<{
    allowPositionals: true
    allowNegative: true
    args: string[]
    options: T
  }>({
    allowNegative: true,
    allowPositionals: true,
    args: argv,
    options: nonPositionals,
  })
  const values = parsed.values as Record<string, unknown>
  if (!values.help) {
    for (const [key, opt] of Object.entries(options)) {
      if (opt.required && values[key] === undefined) {
        throw new Error(`Missing required argument: --${key}`)
      }
    }
  }
  const pos = [...parsed.positionals]
  for (const [key, opt] of Object.entries(positionals)) {
    if (!values.help && opt.required && pos.length === 0) {
      throw new Error(`Missing required positional argument: ${key}`)
    }
    if (pos.length > 0) {
      values[key] = opt.multiple ? pos.splice(0, pos.length) : pos.shift()
    }
  }
  return { ...parsed.values, $: cmd, _: parsed.positionals } as ArgsResult<T>
}

export function argsUsage(name: string, opts: ArgsOpts): string {
  const flags: string[] = []
  const positionals: string[] = []

  for (const [opt, config] of Object.entries(opts)) {
    if (config.positional) {
      let value = opt
      if (config.multiple) value = `${value}...`
      value = config.required ? `<${value}>` : `[${value}]`
      positionals.push(value)
      continue
    }
    const neg = config.type === "boolean" && config.default === true
    const flag = `--${neg ? `no-${opt}` : opt}`
    const value = config.type === "string" ? " <value>" : ""
    const short = config.short ? `-${config.short}, ` : ""
    const ret = `${short}${flag}${value}`
    flags.push(config.required ? ret : `[${ret}]`)
  }
  if (positionals.length === 0) positionals.push("[args...]")
  return [name, ...flags, ...positionals].join(" ")
}
