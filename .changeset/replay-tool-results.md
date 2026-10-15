---
"@zaly/cli": patch
---

Fixed completed tools appearing pending, with missing result previews or diffs,
when replaying a session whose recent-history boundary separated a tool call
from its result.
