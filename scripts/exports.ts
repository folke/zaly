import type { Symbol } from "ts-morph"

import { Project, SymbolFlags } from "ts-morph"

/** Walk re-export aliases until we hit the originating symbol, then
 *  check if it carries a value namespace. `SymbolFlags.Value` covers
 *  classes, functions, vars, enums; classes also carry the Type flag
 *  but counting Value first puts them in the runtime bucket. */
function isRuntime(s: Symbol): boolean {
  const flags = s.getFlags()
  if (flags & SymbolFlags.Alias) {
    const target = s.getAliasedSymbol()
    return target ? isRuntime(target) : false
  }
  return (flags & SymbolFlags.Value) !== 0
}

const project = new Project({ tsConfigFilePath: "./tsconfig.json" })
for (const pkg of ["agent", "ai", "shared", "tui", "cli"]) {
  const sf = project.getSourceFileOrThrow(`packages/${pkg}/src/index.ts`)
  const exports = sf.getExportSymbols()
  const values = exports.filter((s) => isRuntime(s))
  const types = exports.length - values.length
  console.log(`@zaly/${pkg}: ${exports.length}\n  - runtime: ${values.length}\n  - types: ${types}`)
  console.log(values.map((s) => `  - ${s.getName()}`).join("\n"))
}
