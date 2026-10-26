# Sessions and context

## Persistence and resuming

Sessions are persisted under the user data directory, grouped by project working
directory. Normal `zaly` startup resumes the most recent session for the current
project. Start fresh with `zaly --new` or `/new`.

Use `/resume` to choose a session, or select one explicitly at startup:

```sh
zaly --session SESSION_ID
```

The CLI also accepts session paths and other selection forms; see
[CLI options](../reference/cli.md). `/session` shows the active session's details,
and `/tree` displays its message history. Session history can contain source code,
command output, attachments, and other sensitive material: treat it accordingly.

## What the model sees

The on-screen conversation and the model's current input are related, but not
identical. System instructions, project instructions, tool definitions, and
context-management transformations also contribute. `/context` is the best place
to inspect the current session context instead of guessing from rendered history.

Reference files with `@path/to/file.ts`. A range such as `@src/main.ts:10-30`
includes those lines; a single line reference includes surrounding context.
This uses the read tool and still goes through applicable permissions.

## Masking

Masking reduces repetitive tool output in model input while preserving the session
history on disk. Older eligible results can be replaced with compact markers.
This is not file deletion or a filesystem change. If needed, the agent can read
a file again; a masked full read should not cause an unchanged-read shortcut.

The `masking` settings control retention and token targets. The generated
[settings reference](../reference/settings.md) records current defaults.

## Compaction

Compaction summarizes older history while retaining recent messages. It is a
lossy transformation: do not assume every old detail survives verbatim. Important
long-term project conventions belong in [project instructions](../extend/instructions.md),
not only in a long conversation.

Automatic compaction is enabled by default. At 90% context usage, zaly starts
summarizing older history in the background without interrupting the current
response or tools. It applies the summary as soon as it is ready, preserving
messages added since the snapshot. At 95%, the agent waits for compaction before
continuing, reusing any summary already in progress.

Use `/compact` to request blocking compaction manually. Set
`compaction.backgroundEnabled` to `false` to keep only blocking automatic
compaction, or `compaction.enabled` to `false` to disable automatic compaction
entirely. `backgroundThreshold` and `threshold` control the background and
blocking context ratios respectively. If both thresholds are reached, blocking
compaction takes precedence.

The other `compaction` settings control retained context and the summary budget.
Model/provider token limits and output budgets also affect available context.

## Storage and cleanup

See [paths](../reference/paths.md) for session and state locations. Back up sessions
before deleting their directories; deleting them removes resumable history, not
changes the agent already made to your project.
