import type { Agent } from "@zaly/agent"
import type { Reactive, Renderer, RendererOptions } from "@zaly/tui"
import type { StreamHandle } from "./stream.ts"
import type { UiState } from "./ui.ts"

import { createRenderer } from "@zaly/tui"
import { buildOverlays } from "./overlay.ts"
import { bindStream } from "./stream.ts"
import { buildUi } from "./ui.ts"

export interface RenderHandle {
  renderer: Renderer
  stream: StreamHandle
  input: ReturnType<typeof buildUi>["input"]
  toggleHelp: () => void
}

/**
 * Compose a Renderer wired to the given Agent. Owns the surface trees
 * (ui, stream-bridge, overlays) but leaves higher-level orchestration
 * — actions, input handling, agent.send — to App.
 */
export function buildRenderer(agent: Agent, ui: UiState, opts: RendererOptions = {}): RenderHandle {
  const renderer = createRenderer(opts)
  renderer.logger.install()
  const overlays = buildOverlays(renderer)
  const { input } = buildUi(renderer, ui)
  const stream = bindStream(renderer, agent)

  return { input, renderer, stream, toggleHelp: overlays.toggleHelp }
}

export type { Reactive }
