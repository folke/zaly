import type { FileTypeDetect } from "./index.ts"

/** PDF detector — single format, single magic signature. PDFs always
 *  start with `%PDF-` (followed by a version string). No MIME/ext
 *  fallback: trust the bytes. */
export const pdfDetector: FileTypeDetect<"pdf", "pdf"> = {
  formats: ["pdf"],
  magic: { pdf: [[{ b: "%PDF-" }]] },
  type: "pdf",
}
