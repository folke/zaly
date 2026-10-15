# @zaly/agent

## 0.1.0

### Patch Changes

- e4765f5: Queued follow-up messages now wait until ongoing work and steering messages finish.
  Separate follow-up submissions run one at a time, while messages within a single
  submission stay together. Steering remains the default and is delivered at the
  next step boundary without interrupting active work.
- e4765f5: Fixed file reads incorrectly reporting unchanged content when another file shared
  its modification time. Freshness checks now match the file path, and reads with
  truncated lines no longer count as complete. The path check also prevents unrelated
  reads from satisfying edit and write freshness requirements.
- e4765f5: File-tool summaries now show resolved file paths, and read summaries include line
  ranges even when their results are collapsed. Requested ranges update to the actual
  returned range on completion, including negative offsets and end-of-file clamping.
  Read results also have a more compact code preview. The agent package exports a
  shared FileTool type for integrations.
