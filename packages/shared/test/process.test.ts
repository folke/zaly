import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { describe, expect, test, vi } from "vitest"
import { Spawn, spawnCmd, spawnText, spawnWithInput } from "../src/process/spawn.ts"
import {
  BufferStream,
  bufferedTailStream,
  ProxyStream,
  tailedStream,
  TextStream,
  transformStream,
} from "../src/process/stream.ts"
import { bash, which } from "../src/process/system.ts"

describe("Spawn — basics", () => {
  test("buffers stdout and resolves with exit code 0", async () => {
    const r = await new Spawn("printf", ["hello"]).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("hello")
    expect(r.stderr.toString()).toBe("")
    expect(r.killed).toBe(false)
  })

  test("non-zero exit is not an error — surfaces the code", async () => {
    const r = await new Spawn("sh", ["-c", "exit 7"]).result
    expect(r.code).toBe(7)
    expect(r.killed).toBe(false)
  })

  test("captures stderr separately", async () => {
    const r = await new Spawn("sh", ["-c", "printf out; printf err 1>&2"]).result
    expect(r.stdout.toString()).toBe("out")
    expect(r.stderr.toString()).toBe("err")
  })

  test("memoised result promise — repeat awaits return the same value", async () => {
    const p = new Spawn("printf", ["x"])
    const a = await p.result
    const b = await p.result
    expect(a).toBe(b)
  })

  test("rejects with spawn error for unknown commands", async () => {
    await expect(new Spawn("__definitely_not_a_real_binary__").result).rejects.toThrow()
  })

  test("piped stdin is forwarded to the child", async () => {
    const r = await new Spawn("cat", [], { stdin: "piped-input" }).result
    expect(r.stdout.toString()).toBe("piped-input")
  })

  test("exposes live state before and after result", async () => {
    const p = new Spawn("printf", ["state"])
    expect(typeof p.pid).toBe("number")
    expect(p.done).toBe(false)
    const r = await p.result
    expect(r.code).toBe(0)
    expect(p.done).toBe(true)
    expect(p.exitCode).toBe(0)
    expect(p.signal).toBeUndefined()
    expect(p.killed).toBe(false)
    expect(p.killReason).toBeUndefined()
    expect(p.stdout.toString()).toBe("state")
  })

  test("stdout and stderr can be ignored", async () => {
    const r = await new Spawn("sh", ["-c", "printf out; printf err 1>&2"], {
      stderr: false,
      stdout: false,
    }).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("")
    expect(r.stderr.toString()).toBe("")
  })

  test("shell array wraps command with -c", async () => {
    const r = await new Spawn("printf shell-array", [], { shell: ["sh"] }).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("shell-array")
  })

  test("shell true uses the platform shell", async () => {
    const r = await new Spawn("printf shell-true", [], { shell: true }).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("shell-true")
  })

  test("bash option wraps command", async () => {
    const r = await new Spawn("printf $((1 + 2))", [], { bash: ["bash"] }).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("3")
  })

  test("rejects invalid shell options", () => {
    expect(() => new Spawn("true", [], { shell: [] })).toThrow("Empty shell array")
    expect(() => new Spawn("true", [], { bash: ["bash"], shell: ["sh"] })).toThrow(
      "Cannot set both `bash` and `shell` options"
    )
  })

  test("aborts when the AbortSignal fires before spawn", () => {
    const ac = new AbortController()
    ac.abort()
    expect(() => new Spawn("printf", ["x"], { signal: ac.signal })).toThrow(/abort/i)
  })

  test("timeout terminates a long-running process", async () => {
    const p = new Spawn("sleep", ["5"], { timeout: 50 })
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("timeout")
  })

  test("AbortSignal terminates a running process", async () => {
    const ac = new AbortController()
    const p = new Spawn("sleep", ["5"], { signal: ac.signal })
    setTimeout(() => ac.abort(), 20)
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("abort")
  })

  test("maxBuffer overflow kills the process", async () => {
    const p = new Spawn("sh", ["-c", "yes | head -c 4096"], { maxBuffer: 100 })
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("maxBuffer")
  })

  test("manual kill records killReason 'manual'", async () => {
    const p = new Spawn("sleep", ["5"])
    setTimeout(() => p.kill(), 20)
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("manual")
  })

  test("first kill reason wins (timeout beats subsequent manual)", async () => {
    const p = new Spawn("sleep", ["5"], { timeout: 30 })
    setTimeout(() => p.kill(), 60)
    const r = await p.result
    expect(r.killReason).toBe("timeout")
  })
})

describe("Spawn — write/closeStdin", () => {
  test("write appends to stdin while keepStdinOpen", async () => {
    const p = new Spawn("cat", [], { keepStdinOpen: true })
    p.write("hello ")
    p.write("world")
    p.closeStdin()
    const r = await p.result
    expect(r.stdout.toString()).toBe("hello world")
  })

  test("write and closeStdin are no-ops after stdin is closed", async () => {
    const p = new Spawn("cat", [], { keepStdinOpen: true })
    p.closeStdin()
    p.closeStdin()
    p.write("ignored")
    const r = await p.result
    expect(r.stdout.toString()).toBe("")
  })
})

describe("spawnCmd", () => {
  test("returns trimmed stdout", async () => {
    expect(await spawnCmd("printf", " hello ")).toBe("hello")
  })

  test("skips undefined args and accepts opts", async () => {
    expect(await spawnCmd("printf", undefined, "ok", { throw: true })).toBe("ok")
  })

  test("throws on non-zero by default", async () => {
    await expect(spawnCmd("sh", "-c", "printf err >&2; exit 3")).rejects.toThrow(
      "exited with **code:** `3`"
    )
  })

  test("returns undefined on failure when throw is false", async () => {
    expect(await spawnCmd("sh", "-c", "exit 3", { throw: false })).toBeUndefined()
  })

  test("throws when command is missing", async () => {
    await expect(spawnCmd({ throw: false })).rejects.toThrow("Missing command")
  })
})

describe("spawnText", () => {
  test("returns stdout text on exit 0", async () => {
    expect(await spawnText("printf", ["hi"])).toBe("hi")
  })
  test("returns undefined on non-zero exit", async () => {
    expect(await spawnText("sh", ["-c", "printf x; exit 1"])).toBeUndefined()
  })
  test("returns undefined on empty stdout", async () => {
    expect(await spawnText("true")).toBeUndefined()
  })
  test("returns undefined when binary is missing", async () => {
    expect(await spawnText("__definitely_not_a_real_binary__")).toBeUndefined()
  })
})

describe("spawnWithInput", () => {
  test("true on exit 0 with stdin piped", async () => {
    expect(await spawnWithInput("cat", [], "x")).toBe(true)
  })
  test("false on non-zero exit", async () => {
    expect(await spawnWithInput("sh", ["-c", "exit 2"], "")).toBe(false)
  })
  test("false on missing binary", async () => {
    expect(await spawnWithInput("__definitely_not_a_real_binary__", [], "")).toBe(false)
  })
})

describe("which", () => {
  test("finds a binary that's on PATH", () => {
    const p = which("sh")
    expect(p).toBeDefined()
    expect(p).toMatch(/sh$/)
  })
  test("returns undefined for a missing command", () => {
    expect(which("__definitely_not_a_real_binary__")).toBeUndefined()
  })
  test("absolute path fast-path returns the path when executable", () => {
    const sh = which("sh") as string
    expect(which(sh)).toBe(sh)
  })
  test("absolute path fast-path returns undefined for non-executable paths", () => {
    expect(which("/this/path/does/not/exist")).toBeUndefined()
  })

  test("update option refreshes the PATH lookup cache", () => {
    const bun = (globalThis as { Bun?: { which?: (cmd: string) => string | null } }).Bun
    if (!bun?.which) return

    const cmd = `zaly-test-bin-${process.pid}`
    const file = `/tmp/${cmd}`
    const spy = vi.spyOn(bun, "which")
    try {
      // oxlint-disable-next-line unicorn/no-null
      spy.mockReturnValueOnce(null).mockReturnValue(file)
      expect(which(cmd, { update: true })).toBeUndefined()
      expect(which(cmd)).toBeUndefined()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(which(cmd, { update: true })).toBe(file)
    } finally {
      spy.mockRestore()
      which(cmd, { update: true })
    }
  })

  test("bash returns a shell command tuple", () => {
    expect(typeof bash()[0]).toBe("string")
  })
})

describe("process streams", () => {
  test("BufferStream concatenates chunks and caches results until new data", () => {
    const stream = new BufferStream()
    expect(stream.result.toString()).toBe("")
    stream.add(Buffer.from("hello"))
    expect(stream.result.toString()).toBe("hello")
    stream.add(Buffer.from(" world"))
    const result = stream.result
    expect(result.toString()).toBe("hello world")
    expect(stream.result).toBe(result)
  })

  test("TextStream yields lines, batches and final unterminated line", async () => {
    const stream = new TextStream()
    const batches: string[][] = []
    const done = (async () => {
      for await (const batch of stream.lineBatches(2)) batches.push(batch)
    })()
    stream.add(Buffer.from("a\r\nb\npartial"))
    stream.add(Buffer.from(" line\n"))
    stream.finish()
    await done
    expect(batches).toEqual([["a", "b"], ["partial line"]])
    expect(stream.result).toBe("a\r\nb\npartial line\n")
  })

  test("TextStream lines() yields one line at a time", async () => {
    const stream = new TextStream()
    const lines: string[] = []
    const done = (async () => {
      for await (const line of stream.lines()) lines.push(line)
    })()
    stream.add(Buffer.from("one\ntwo"))
    stream.finish()
    await done
    expect(lines).toEqual(["one", "two"])
  })

  test("ProxyStream forwards hooks and transforms result", async () => {
    const add = vi.fn()
    const finish = vi.fn()
    const close = vi.fn(async () => {})
    const stream = new ProxyStream(new TextStream(), {
      add,
      close,
      finish,
      result: (text) => text.toUpperCase(),
    })
    stream.add(Buffer.from("hi"))
    expect(add).toHaveBeenCalledOnce()
    stream.finish()
    expect(finish).toHaveBeenCalledOnce()
    expect(stream.result).toBe("HI")
    await stream.close()
    expect(close).toHaveBeenCalledOnce()
  })

  test("tailedStream writes chunks to a log file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-tail-"))
    const file = join(dir, "out.log")
    try {
      const stream = tailedStream(new TextStream(), file)
      stream.add(Buffer.from("hello"))
      stream.finish()
      await stream.close?.()
      expect(stream.result).toBe("hello")
      expect(readFileSync(file, "utf8")).toBe("hello")
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  test("bufferedTailStream replays buffered chunks when tailing starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-buffered-tail-"))
    const file = join(dir, "out.log")
    try {
      const { startTailing, stream } = bufferedTailStream(new TextStream())
      stream.add(Buffer.from("before"))
      startTailing(file)
      startTailing(file)
      stream.add(Buffer.from(" after"))
      stream.finish()
      await stream.close?.()
      expect(stream.result).toBe("before after")
      expect(readFileSync(file, "utf8")).toBe("before after")
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  test("transformStream lazily transforms and caches matching inner result", () => {
    const inner = new TextStream()
    const transform = vi.fn((text: string) => text.length)
    const stream = transformStream(inner, transform)
    inner.add(Buffer.from("abc"))
    expect(stream.result).toBe(3)
    expect(stream.result).toBe(3)
    expect(transform).toHaveBeenCalledTimes(1)
    inner.add(Buffer.from("d"))
    expect(stream.result).toBe(4)
    expect(transform).toHaveBeenCalledTimes(2)
  })
})
