export async function shellSplit(input: string): Promise<string[]> {
  const { parse } = await import("shell-quote")
  const parsed = parse(input)
  const args: string[] = []

  for (const part of parsed) {
    if (typeof part === "string") args.push(part)
    else if ("comment" in part) break
    else throw new Error(`Unsupported shell syntax in args: ${JSON.stringify(part)}`)
  }

  return args
}

export async function shellQuote(args: string[]): Promise<string> {
  const { quote } = await import("shell-quote")
  return args.map((arg) => quote([arg])).join(" ")
}
