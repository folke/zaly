#!/usr/bin/env -S bun run
import { main } from "../src/main.ts"

await main(process.argv.slice(2))
