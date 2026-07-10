import { expect, test } from "vitest"
import { stripReasoningMarkers } from "../src/widgets/reasoning.ts"

test("strips inline and standalone reasoning summary markers", () => {
  expect(
    stripReasoningMarkers(`Investigating subagent usage

<!-- -->**Searching repository**
<!-- -->`)
  ).toBe(`Investigating subagent usage

**Searching repository**`)
})
