import type { ImageFormat } from "@zaly/shared"

const support = {
  anthropic: {
    image: {
      formats: ["jpeg", "png", "gif", "webp"],
      maxCount: 600, // 100 for models with less thatn 200k context
      maxSize: 5 * 1024 * 1024, // 5 MiB
      transport: ["base64", "url"],
    },
  },
  openai: {
    image: {
      formats: ["jpeg", "png", "gif", "webp"],
      maxCount: 1500,
      maxSize: 512 * 1024 * 1024, // 512 MiB
      transport: ["base64", "url"],
    },
  },
} as const satisfies Record<string, AttachmentSupport>

// TODO: strip metadata. Request Size Limit

export type AttachmentSupport = {
  image?: {
    formats: ImageFormat[]
    maxSize: number
    maxCount: number
    transport?: ("base64" | "url")[]
  }
  pdf?: {}
}
