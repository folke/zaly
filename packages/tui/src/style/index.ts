export * from "./ansi.ts"
export * from "./builder.ts"
export * from "./color.ts"
export * from "./theme.ts"

// Image + shiki modules stay private to the package — their helpers are
// consumed by the `image`, `markdown`, `code`, and `diff` widgets via
// direct imports (`../style/image/kitty.ts`, etc.), not by end users.
// Only the handful of types that appear in public state interfaces are
// re-exported here.
export type { ImageProtocol } from "./image/capabilities.ts"
export type { ShikiLanguage, ShikiTheme } from "./shiki.ts"
