# Tools

Built-in tool definitions and parameter schemas. Availability depends on the `tools` setting, credentials, and plugins; this is the catalog, not the default enabled list. Skill activation tools are generated from installed skills and are not listed here. Tool calls are subject to [permissions](../configuration/permissions.md).

<!-- tools:start -->
## agent_send

Send a message to a subagent by name. The receiver sees it as a user message and runs (resuming if idle). Their reply will arrive in your queue as a system message at their next natural stop. Use this to steer a subagent mid-task or to follow up on a report.

### Parameters

```json
{
  "type": "object",
  "required": [
    "to",
    "content"
  ],
  "properties": {
    "to": {
      "type": "string",
      "description": "Name of the recipient subagent (the `name` it was given when spawned, including any auto-suffix). Must be a subagent in your swarm.",
      "minLength": 1
    },
    "content": {
      "type": "string",
      "description": "Message body — what you want the subagent to do or know.",
      "minLength": 1
    }
  }
}
```

## agent_spawn

Spawn a subagent under your supervision. The new agent inherits your model, permissions, and tools (cwd, skill catalog, etc.). It runs in the background; its outward messages arrive in your queue as system messages tagged `&lt;agent&gt;` whenever it reaches a natural stop. Use `agent_send` to follow up.

### Parameters

```json
{
  "type": "object",
  "required": [
    "name",
    "desc",
    "prompt"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Short identifier for inter-agent addressing — e.g. `\"reviewer\"`, `\"researcher\"`. Other agents reference this subagent by name. The swarm auto-suffixes (`reviewer-2`, `reviewer-3`, ...) on collision, so feel free to reuse role names.",
      "minLength": 1
    },
    "desc": {
      "type": "string",
      "description": "One-line description of what this subagent is doing. Surfaces in agent listings so you (and humans observing) can keep track."
    },
    "prompt": {
      "type": "string",
      "description": "System prompt for the subagent — defines its role and constraints. Spell out what it needs to know; the subagent does NOT inherit your prompt."
    },
    "task": {
      "type": "string",
      "description": "Initial task for the subagent, sent as its first user message. Omit to spawn an idle subagent that will do nothing until you `agent_send` to it."
    }
  }
}
```

## bash

Run a bash command. Returns its output once the command exits, or a partial snapshot if the command is still running after the harness's grace window — in that case the eventual result arrives as a system message. Its result then arrives automatically when it finishes; use `task_poll` to peek at output, `task_stop` to terminate one. `timeout` is a real kill deadline.

### Parameters

```json
{
  "type": "object",
  "required": [
    "command"
  ],
  "properties": {
    "command": {
      "type": "string",
      "description": "The shell command to run, evaluated by `bash -c`."
    },
    "description": {
      "type": "string",
      "description": "Short, human-readable description of what this command does. Shown to the user in the TUI alongside the command. Keep it under ~10 words. Don't restate the command itself — describe the intent (e.g. \"check the test suite passes\", not \"run bun test\")."
    },
    "max_lines": {
      "type": "integer",
      "default": 200,
      "description": "Cap on lines kept inline in the result. Split as head + tail (half each). Lower for commands you only need pass/fail on (`max_lines: 20`); raise when middle output matters. Output above the cap is elided in the inline result, but the full log is always written to disk and surfaced as `truncated.fullOutputPath` — `read` it if you need to dig deeper.",
      "minimum": 10
    },
    "timeout": {
      "type": "integer",
      "default": 600000,
      "description": "Kill deadline in ms. The process IS killed when this elapses (SIGTERM → SIGKILL).",
      "minimum": 1
    }
  }
}
```

## edit

Apply one or more exact-text replacements to a file. All matches are resolved against the original content (not sequentially), each `oldText` must be unique, and edits must not overlap. Atomic: all-or-nothing.

### Parameters

```json
{
  "type": "object",
  "required": [
    "path",
    "edits"
  ],
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to the file. Absolute or cwd-relative."
    },
    "edits": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "oldText",
          "newText"
        ],
        "properties": {
          "oldText": {
            "type": "string",
            "description": "Exact text to find. Must occur once."
          },
          "newText": {
            "type": "string",
            "description": "Replacement text."
          }
        }
      },
      "description": "Edits to apply atomically.",
      "minItems": 1
    }
  }
}
```

## fetch

Fetch a URL and return the response. JSON responses are parsed; use `jsonpath` (e.g. `$.items[*].name`) to extract a subset and minimise tokens. HTML pages are converted to readable Markdown without executing JavaScript; use a browser for interactive pages. Images & PDFs are returned as attachments. Truncated text is saved in full; read `truncated.fullOutputPath` to inspect it.

### Parameters

```json
{
  "type": "object",
  "required": [
    "url"
  ],
  "properties": {
    "url": {
      "type": "string",
      "description": "Absolute URL."
    },
    "method": {
      "anyOf": [
        {
          "type": "string",
          "const": "GET"
        },
        {
          "type": "string",
          "const": "POST"
        },
        {
          "type": "string",
          "const": "PUT"
        },
        {
          "type": "string",
          "const": "PATCH"
        },
        {
          "type": "string",
          "const": "DELETE"
        }
      ],
      "default": "GET",
      "description": "HTTP method."
    },
    "headers": {
      "type": "object",
      "patternProperties": {
        "^.*$": {
          "type": "string"
        }
      },
      "description": "Request headers."
    },
    "query": {
      "type": "object",
      "patternProperties": {
        "^.*$": {
          "type": "string"
        }
      },
      "description": "Query string params, appended to the URL."
    },
    "body": {
      "type": "string",
      "description": "Request body as a string. For JSON, stringify it yourself and set `headers: { 'Content-Type': 'application/json' }`."
    },
    "format": {
      "anyOf": [
        {
          "type": "string",
          "const": "auto"
        },
        {
          "type": "string",
          "const": "markdown"
        },
        {
          "type": "string",
          "const": "raw"
        }
      ],
      "default": "auto",
      "description": "auto converts HTML to Markdown and parses JSON. markdown also treats unrecognized text as HTML. raw returns original text without conversion or JSON parsing. Attachments are unchanged."
    },
    "limit": {
      "type": "integer",
      "default": 2000,
      "description": "Maximum lines to keep inline, split between head and tail. Full output is saved when truncated.",
      "minimum": 1
    },
    "jsonpath": {
      "type": "string",
      "description": "JSONPath expression applied to a JSON response, e.g. `$.items[*].name`. Returns the matched values as an array."
    }
  }
}
```

## find

Find files using fd/fdfind or rg --files. `glob` is a filename/path glob, array of globs, or plain substring; empty, `*`, or `**/*` lists all files. Includes hidden files and respects .gitignore by default. Does not follow directory symlinks; prefer this over bash find for file discovery.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "glob": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      ],
      "default": "",
      "description": "Filename/path glob, array of globs, or plain substring. Empty, `*`, or `**/*` lists all files."
    },
    "paths": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Optional directories to search, relative to cwd or absolute."
    },
    "hidden": {
      "type": "boolean",
      "default": true,
      "description": "Include files in hidden directories and dotfiles."
    },
    "ignore": {
      "type": "boolean",
      "default": true,
      "description": "Respect .gitignore/.ignore rules."
    },
    "limit": {
      "type": "integer",
      "default": 200,
      "description": "Maximum paths to keep inline.",
      "maximum": 1000,
      "minimum": 1
    }
  }
}
```

## grep

Search file contents using rg/grep. Respects .gitignore by default when ripgrep is available; prefer this over bash grep/find for code search. Returns human-readable grouped matches with line numbers.

### Parameters

```json
{
  "type": "object",
  "required": [
    "pattern"
  ],
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Text or regex pattern. Uses smart case: case-insensitive unless uppercase is present.",
      "minLength": 1
    },
    "paths": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Optional files/directories to search, relative to cwd or absolute."
    },
    "glob": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Ripgrep glob filters, e.g. [`*.ts`, `!dist/**`]."
    },
    "fixed_strings": {
      "type": "boolean",
      "default": false,
      "description": "Treat all patterns as literals instead of as regular expressions"
    },
    "context": {
      "type": "integer",
      "default": 0,
      "description": "Context lines before/after each match. 0-10.",
      "maximum": 10,
      "minimum": 0
    },
    "limit": {
      "type": "integer",
      "default": 100,
      "description": "Maximum output lines to keep inline, including file headings and context.",
      "maximum": 1000,
      "minimum": 1
    }
  }
}
```

## read

Read a file. Text files return plain text with line-range metadata. Image & PDF files are sent as attachments. Use `offset`/`limit` to slice large files.

### Parameters

```json
{
  "type": "object",
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to the file. Absolute or cwd-relative."
    },
    "offset": {
      "type": "integer",
      "default": 1,
      "description": "1-based line number to start at. Negative values count from the end: -50 starts 50 lines before EOF (so `offset: -50` with the default limit returns the last 50 lines, like `tail -n 50`). `offset: -50, limit: 20` reads 20 lines starting 50 from the end."
    },
    "limit": {
      "type": "integer",
      "default": 2000,
      "description": "Maximum number of lines to return.",
      "minimum": 1
    }
  }
}
```

## search

Web search optimised for agents. Returns extracted snippets from each source page (not just titles + URLs), so you get grounding content in one call. Use for fact-finding, current events, documentation lookups, and anything beyond your knowledge cutoff.

### Parameters

```json
{
  "type": "object",
  "required": [
    "query"
  ],
  "properties": {
    "query": {
      "type": "string",
      "description": "The search query. 1–400 characters, max 50 words.",
      "maxLength": 400,
      "minLength": 1
    },
    "count": {
      "type": "integer",
      "default": 10,
      "description": "Maximum number of source URLs in the response.",
      "maximum": 50,
      "minimum": 1
    },
    "freshness": {
      "anyOf": [
        {
          "type": "string",
          "const": "pd"
        },
        {
          "type": "string",
          "const": "pw"
        },
        {
          "type": "string",
          "const": "pm"
        },
        {
          "type": "string",
          "const": "py"
        }
      ],
      "description": "Restrict to recent pages. `pd` = past 24h, `pw` = past week, `pm` = past month, `py` = past year. Omit for no filter."
    },
    "country": {
      "type": "string",
      "default": "us",
      "description": "Two-letter country code for region-specific results."
    }
  }
}
```

## subagent

Spawn a focused subagent with the same model and permissions. Use for tasks that benefit from a clean context window: deep code exploration, multi-step research, or anything where dragging the intermediate steps through your own context would be expensive. The subagent's final answer comes back as the result; full transcript is available at the returned `sessionPath` if you need more detail.

### Parameters

```json
{
  "type": "object",
  "required": [
    "description",
    "prompt",
    "task"
  ],
  "properties": {
    "description": {
      "type": "string",
      "description": "Short description of what the subagent should do. Shown to the user in the TUI. Keep under ~10 words."
    },
    "prompt": {
      "type": "string",
      "description": "System prompt for the subagent — defines its role and constraints. The subagent does NOT inherit your system prompt; spell out what it needs to know."
    },
    "task": {
      "type": "string",
      "description": "The actual task the subagent should perform, as if you were sending it as a user message. Be specific about the deliverable."
    }
  }
}
```

## task_list

List active and recently-finished tasks (running shells, subagents, any other long-running work the model has kicked off). Use this when you've lost track of an id, or to check which background work is still in flight.

### Parameters

```json
{
  "type": "object",
  "properties": {
    "includeFinished": {
      "type": "boolean",
      "default": false,
      "description": "When true, also include tasks that have already completed in this session."
    }
  }
}
```

## task_poll

Read the latest incremental output from a running task. Returns only what's arrived since the previous `task_poll` (or since the task's running placeholder was first surfaced). Use when a heartbeat flagged a task with `*new*`, or to peek at progress on a long command (build, test run, tail -f). Errors if the task is already done (its result was injected as a system message) or has no streaming output.

### Parameters

```json
{
  "type": "object",
  "required": [
    "id"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Task id to poll."
    }
  }
}
```

## task_stop

Stop a running task. Aborts the underlying work (e.g. SIGTERM → SIGKILL for bash); pending tasks chained behind a stopped task get auto-cancelled. Idempotent — safe to call on an already-finished task.

### Parameters

```json
{
  "type": "object",
  "required": [
    "id"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Task id to stop."
    }
  }
}
```

## wakeup

Schedule a one-shot wake-up of the agent loop. If `delayMs` elapses without anything else waking the loop (task completion, heartbeat, user message), you'll receive a system message with the optional `hint`. If something else wakes the loop first, the wakeup is cancelled — its hint still surfaces (with `status="cancelled"`) so your reminder doesn't evaporate. Useful for polling external state or scheduling a return to a thought.

### Parameters

```json
{
  "type": "object",
  "required": [
    "delayMs"
  ],
  "properties": {
    "delayMs": {
      "type": "integer",
      "description": "How long to wait before waking up, in milliseconds. Minimum 1.",
      "minimum": 1
    },
    "hint": {
      "type": "string",
      "description": "Short text the wakeup carries — what you wanted to remember to do at this point. Surfaces in the system message whether the wakeup fires on its own timer or gets cancelled by another event. Keep it concise; treat it as a TODO line, not prose."
    }
  }
}
```

## write

Write content to a file. Overwrites existing files; creates parent directories as needed. Returns the byte count and line count of the written file.

### Parameters

```json
{
  "type": "object",
  "required": [
    "path",
    "content"
  ],
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to the file. Absolute or cwd-relative."
    },
    "content": {
      "type": "string",
      "description": "File contents to write, verbatim."
    }
  }
}
```
<!-- tools:end -->
