import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs"

const bin = new URL("../dist/zaly.mjs", import.meta.url)
if (!existsSync(bin)) process.exit(0)

const isBun = /\bbun\b/.test(process.env.npm_config_user_agent ?? "")
const shebang = isBun ? "#!/usr/bin/env bun run" : "#!/usr/bin/env node"

writeFileSync(bin, readFileSync(bin, "utf8").replace(/^#![^\n]*/, shebang))
chmodSync(bin, 0o755)
