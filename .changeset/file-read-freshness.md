---
"@zaly/agent": patch
"@zaly/cli": patch
---

Fixed file reads incorrectly reporting unchanged content when another file shared
its modification time. Freshness checks now match the file path, and reads with
truncated lines no longer count as complete. The path check also prevents unrelated
reads from satisfying edit and write freshness requirements.
