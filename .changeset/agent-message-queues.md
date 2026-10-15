---
"@zaly/agent": patch
"@zaly/cli": patch
---

Queued follow-up messages now wait until ongoing work and steering messages finish.
Separate follow-up submissions run one at a time, while messages within a single
submission stay together. Steering remains the default and is delivered at the
next step boundary without interrupting active work.
