# image

Inline image rendering via the terminal's native graphics protocol (Kitty KGP or iTerm2). Falls back to alt text elsewhere.

## Example

```ts
import { image } from "@zaly/tui"

image("./logo.png")
image({ src: "./wallpaper.jpg", width: 40, alt: "wallpaper" })
```

## State

| field        | type     | default     | description                                                                                                                                                                   |
| ------------ | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | `string` | —           | Path to an image file. PNG streams directly; JPEG/WebP/GIF/AVIF/SVG are converted once to a cached temp PNG via sharp on KGP terminals (iTerm2 accepts all formats natively). |
| `width`      | `number` | `ctx.width` | Display width in terminal cells.                                                                                                                                              |
| `height`     | `number` | auto        | Display height in cells. Computed from source aspect + `cellAspect` when omitted.                                                                                             |
| `alt`        | `string` | —           | Fallback text for terminals without an image protocol.                                                                                                                        |
| `cellAspect` | `number` | `2.0`       | Character cell height / width. Tweak if images look stretched on your font.                                                                                                   |

## Notes

- Detection is automatic — KGP on Kitty/Ghostty/WezTerm, iTerm2 inline images on iTerm2, alt text everywhere else. See the capabilities probe in `src/image/capabilities.ts`.
- Each `Image` node has a stable KGP placement id, so re-renders (same src, different size) are flicker-free moves rather than retransmits.
- Format conversion + sharp are lazy-loaded — a tree with no images never pulls the dep.

> [!WARNING]
> Image bytes can be large. The graphics protocol uses APC escapes that are side-channel; `stringWidth` treats them as zero-width, so layout is unaffected, but your scrollback may still retain the transmit bytes on some terminals.
