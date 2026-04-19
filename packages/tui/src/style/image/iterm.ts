/**
 * iTerm2 Inline Images Protocol.
 *
 * Reference: https://iterm2.com/documentation-images.html
 *
 * The terminal consumes a single OSC 1337 escape containing the base64-
 * encoded file bytes. iTerm2 auto-detects the format (PNG/JPEG/GIF/WebP),
 * so we pass raw source bytes through — no conversion needed.
 *
 * Unlike KGP there's no "placement" concept: the image renders where the
 * cursor is and the cursor advances past it. For re-renders the caller
 * must re-emit the full escape; iTerm2 doesn't de-dupe server-side.
 */

export interface IntermOptions {
  /**
   * Display width. A bare number is pixels; strings may be Nx (cells),
   * N% (percent of session), or "auto". Defaults to unspecified → iTerm
   * picks a size based on pixel dims.
   */
  width?: number | string
  /** Display height. Same units as `width`. */
  height?: number | string
  /** Shown on hover; base64-encoded inside the escape. */
  name?: string
  /**
   * When false, iTerm2 may distort the image to fit the requested
   * width/height. Defaults to true (preserve aspect).
   */
  preserveAspectRatio?: boolean
  /**
   * When false, iTerm2 shows a download icon instead of rendering the
   * image. Defaults to true (inline rendering).
   */
  inline?: boolean
}

/**
 * Encode an image for iTerm2 inline display. `base64Data` is the base64
 * of the raw file bytes (any format iTerm2 recognises — PNG, JPEG, GIF,
 * WebP). The returned string is a complete OSC 1337 escape ready to
 * write to stdout at the target cursor position.
 */
export function encode(base64Data: string, options: IntermOptions = {}): string {
  const params: string[] = [`inline=${options.inline === false ? 0 : 1}`]
  if (options.width !== undefined) params.push(`width=${options.width}`)
  if (options.height !== undefined) params.push(`height=${options.height}`)
  if (options.name !== undefined) {
    params.push(`name=${Buffer.from(options.name).toString("base64")}`)
  }
  if (options.preserveAspectRatio === false) params.push("preserveAspectRatio=0")
  return `\x1b]1337;File=${params.join(";")}:${base64Data}\x07`
}
