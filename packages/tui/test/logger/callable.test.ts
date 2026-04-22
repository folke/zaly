import type { Node } from "../../src/core/node.ts"
import type { Log } from "../../src/widgets/log.ts"

import { describe, expect, test } from "vitest"
import { Logger, makeLog } from "../../src/logger/logger.ts"

const fakeStream = () => {
  const nodes: Node[] = []
  return {
    append(n: Node) {
      nodes.push(n)
    },
    nodes,
  }
}

describe("makeLog (callable wrapper)", () => {
  test("calling the wrapper logs at 'log' level", () => {
    const s = fakeStream()
    const logger = new Logger().attach(s)
    const log = makeLog(logger)
    log("hello")
    expect((s.nodes[0] as Log).state.level).toBe("log")
  })

  test("level methods are reachable as properties", () => {
    const s = fakeStream()
    const logger = new Logger().attach(s)
    const log = makeLog(logger)
    log.error("boom")
    log.info("fine")
    expect((s.nodes[0] as Log).state.level).toBe("error")
    expect((s.nodes[1] as Log).state.level).toBe("info")
  })

  test("install/uninstall/attach/detach proxy through to logger", () => {
    const s = fakeStream()
    const logger = new Logger({ write: () => {} })
    const log = makeLog(logger)
    log.attach(s)
    log.info("a")
    expect(s.nodes).toHaveLength(1)
    log.detach()
    log.info("b")
    expect(s.nodes).toHaveLength(1)
  })

  test("wrapper.log('x') and wrapper('x') both work (symmetry)", () => {
    const s = fakeStream()
    const logger = new Logger().attach(s)
    const log = makeLog(logger)
    log("a")
    log.log("b")
    expect(s.nodes).toHaveLength(2)
    expect((s.nodes[0] as Log).state.level).toBe("log")
    expect((s.nodes[1] as Log).state.level).toBe("log")
  })
})
