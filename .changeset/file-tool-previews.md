---
"@zaly/agent": patch
"@zaly/cli": minor
---

File-tool summaries now show resolved file paths, and read summaries include line
ranges even when their results are collapsed. Requested ranges update to the actual
returned range on completion, including negative offsets and end-of-file clamping.
Read results also have a more compact code preview. The agent package exports a
shared FileTool type for integrations.
