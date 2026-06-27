/**
 * Model catalog loading microbench.
 *
 *     bun bench/models.ts
 *
 * Compares loading `assets/models.json` through native JSON module import
 * against reading the file and parsing it manually. The import benchmark uses
 * a unique URL query per iteration so the module cache does not turn the
 * benchmark into a cached Promise lookup.
 */

import { barplot, bench, summary } from "mitata"
import { copyFile, readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { constants, gzip as gzipCb, gunzip as gunzipCb } from "node:zlib"

const modelUrl = new URL("../assets/models.json", import.meta.url)

const gzip = promisify(gzipCb)
const gunzip = promisify(gunzipCb)
const files: string[] = []
const gzipFiles: string[] = []

for (let i = 0; i < 300; i++) {
  const tmpFile = `/tmp/models-${i}.json`
  const gzipFile = `${tmpFile}.gz`
  files.push(tmpFile)
  gzipFiles.push(gzipFile)
  await copyFile(modelUrl, tmpFile)
  await writeFile(
    gzipFile,
    await gzip(await readFile(tmpFile), {
      level: constants.Z_BEST_SPEED,
    })
  )
}

let importFileId = 0
let readFileId = 0
let gzipFileId = 0

async function importJson() {
  const file = files[importFileId++]
  if (!file) return
  const url = pathToFileURL(file)
  const mod = await import(url.href, { with: { type: "json" } })
  return mod.default
}

async function readAndParseJson() {
  const file = files[readFileId++]
  if (!file) return
  const json = await readFile(file, "utf8")
  return JSON.parse(json)
}

async function readAndGunzipJson() {
  const file = gzipFiles[gzipFileId++]
  if (!file) return
  const data = await gunzip(await readFile(file))
  return JSON.parse(data.toString("utf8"))
}

barplot(async () => {
  summary(async () => {
    bench("import(models.json)", async () => {
      await importJson()
    })

    bench("readFile + JSON.parse(models.json)", async () => {
      await readAndParseJson()
    })

    bench("readFile + gunzip(models.json.gz)", async () => {
      await readAndGunzipJson()
    })
  })
})
