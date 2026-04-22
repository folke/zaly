// Image-protocol internals (kitty / iterm2 / capabilities / source
// conversion) stay private — they're consumed by the `image` widget,
// the markdown image callback, and capability probes. Only the handful
// of types that appear in public state interfaces escape.

export type { ImageProtocol } from "./capabilities.ts"
