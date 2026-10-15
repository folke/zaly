# @zaly/cli

## 0.1.0

### Minor Changes

- e4765f5: File-tool summaries now show resolved file paths, and read summaries include line
  ranges even when their results are collapsed. Requested ranges update to the actual
  returned range on completion, including negative offsets and end-of-file clamping.
  Read results also have a more compact code preview. The agent package exports a
  shared FileTool type for integrations.

### Patch Changes

- e4765f5: Queued follow-up messages now wait until ongoing work and steering messages finish.
  Separate follow-up submissions run one at a time, while messages within a single
  submission stay together. Steering remains the default and is delivered at the
  next step boundary without interrupting active work.
- e4765f5: Fixed file reads incorrectly reporting unchanged content when another file shared
  its modification time. Freshness checks now match the file path, and reads with
  truncated lines no longer count as complete. The path check also prevents unrelated
  reads from satisfying edit and write freshness requirements.
- e4765f5: Fixed completed tools appearing pending, with missing result previews or diffs,
  when replaying a session whose recent-history boundary separated a tool call
  from its result.
- Updated dependencies [e4765f5]
- Updated dependencies [e4765f5]
- Updated dependencies [e4765f5]
  - @zaly/agent@0.1.0
  - @zaly/config@0.1.0
  - @zaly/plugin@0.1.0

For releases through 0.0.11, see the [historical product changelog](https://github.com/folke/zaly/blob/main/CHANGELOG.md).
