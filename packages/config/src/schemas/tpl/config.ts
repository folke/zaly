import { shikiThemes } from "@zaly/tui"
import { Type } from "typebox"

const bundledThemes = await shikiThemes()

const definitions = {
  AnyTool: Type.String(),
  Keymap: Type.Object(
    {},
    { additionalProperties: Type.Union([Type.String(), Type.Array(Type.String())]) }
  ),
  ResourceFilter: Type.Object(
    {
      enabled: Type.Optional(
        Type.Boolean({ description: "Whether the plugin is enabled. Defaults to true." })
      ),
      exclude: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'When set, exclude the resources, matching these paths/globs from the plugin.\nAdd a resource type to the exclude list to disable that resource type. For example,\n`["skills"]` will disable all skills from the plugin.\nExclude is applied after include.',
        })
      ),
      include: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "When set, only include the resources, matching these paths/globs from the plugin.",
        })
      ),
    },
    { additionalProperties: false }
  ),
  Resources: Type.Object({}, { additionalProperties: Type.Ref("#/$defs/ResourceFilter") }),
}

export const schema = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    commands: Type.Optional(
      Type.Object(
        {
          actionPrefix: Type.Optional(
            Type.String({ description: "Prefix for command actions. Defaults to ``" })
          ),
          bash: Type.Optional(
            Type.Boolean({ description: "Allow bash execution in commands. Defaults to true." })
          ),
          expr: Type.Optional(
            Type.Boolean({
              description: "Allow js expressions in command templates. Defaults to true.",
            })
          ),
        },
        { additionalProperties: false, description: "Template commands." }
      )
    ),
    compaction: Type.Optional(
      Type.Object(
        {
          enabled: Type.Optional(
            Type.Boolean({ description: "Enable automatic compaction when context is full" })
          ),
          keepTokens: Type.Optional(
            Type.Number({
              description:
                "Existing messages up to this many tokens will be preserved in the context",
            })
          ),
          reasoning: Type.Optional(
            Type.String({
              description: "Reasoning effort for the compaction summary",
              enum: ["high", "low", "max", "medium", "minimal", "off", "xhigh"],
            })
          ),
          summaryTokens: Type.Optional(
            Type.Number({
              description: "Maximum number of tokens to use for the generated summary",
            })
          ),
          threshold: Type.Optional(
            Type.Number({ description: "Threshold for automatic compaction." })
          ),
        },
        { additionalProperties: false }
      )
    ),
    keymap: Type.Optional(Type.Ref("#/$defs/Keymap")),
    masking: Type.Optional(
      Type.Object(
        {
          delta: Type.Optional(
            Type.Number({
              description:
                "How far above the target ratio to trigger a new masking pass.\nDefaults to 0.25 (25%).",
            })
          ),
          enabled: Type.Optional(
            Type.Boolean({ description: "Whether to enable masking. Defaults to true." })
          ),
          keepTurns: Type.Optional(
            Type.Number({
              description:
                "How many turns to keep in the tail of the conversation, regardless\nof score. Defaults to 20.",
            })
          ),
          minTokens: Type.Optional(
            Type.Number({
              description:
                "Don't mask tool-result parts whose original content is shorter\nthan this (estimated tokens). Skips tiny \"ok\"-style success\nmessages where the stub would be larger than the original.\nDoesn't apply to attachments (always worth masking).",
            })
          ),
          target: Type.Optional(
            Type.Number({
              description:
                "Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%).",
            })
          ),
        },
        { additionalProperties: false }
      )
    ),
    model: Type.Optional(Type.String({ description: "Default model to use for the agent." })),
    permissions: Type.Optional(
      Type.Object(
        {
          allow: Type.Optional(Type.Array(Type.String())),
          ask: Type.Optional(Type.Array(Type.String())),
          deny: Type.Optional(Type.Array(Type.String())),
          preset: Type.Optional(
            Type.String({
              description: 'Permissions preset to use. Defaults to "permissive".',
              enum: ["permissive", "readonly", "strict", "yolo"],
            })
          ),
        },
        { additionalProperties: false }
      )
    ),
    plugins: Type.Optional(Type.Array(Type.String())),
    reasoning: Type.Optional(
      Type.String({
        description: "Default reasoning effort.",
        enum: ["high", "low", "max", "medium", "minimal", "off", "xhigh"],
      })
    ),
    resources: Type.Optional(
      Type.Ref("#/$defs/Resources", { description: "Resource configuration for zaly." })
    ),
    skills: Type.Optional(
      Type.Object(
        {
          actionPrefix: Type.Optional(
            Type.String({
              description:
                "Prefix for command actions. Defaults to `skill:`, e.g `/skill:SKILL_NAME`",
            })
          ),
          actions: Type.Optional(
            Type.Boolean({ description: "Show skill actions. Defaults to true." })
          ),
          enabled: Type.Optional(
            Type.Boolean({ description: "Allow skills to be used by the agent. Defaults to true." })
          ),
        },
        { additionalProperties: false }
      )
    ),
    system: Type.Optional(
      Type.Object(
        {
          bash: Type.Optional(
            Type.Array(Type.String(), { description: "Command used by the bash tool." })
          ),
          git: Type.Optional(
            Type.Array(Type.String(), { description: "Command used for git packs." })
          ),
          npm: Type.Optional(
            Type.Array(Type.String(), {
              description: "Package manager command used for npm packs.",
            })
          ),
        },
        {
          additionalProperties: false,
          description: "System integrations and external commands used by zaly.",
        }
      )
    ),
    tools: Type.Optional(Type.Array(Type.String())),
    ui: Type.Optional(
      Type.Object(
        {
          collapsedTools: Type.Optional(
            Type.Array(Type.Ref("#/$defs/AnyTool"), {
              description: "Tools whose result body should be hidden in the UI.",
            })
          ),
          copyOnSelect: Type.Optional(Type.Boolean()),
          images: Type.Optional(
            Type.Boolean({ description: "Render images, if supported by the terminal" })
          ),
          listHeight: Type.Optional(
            Type.Number({
              description:
                "Maximum number of visible rows in selection lists, like pickers and autocomplete.",
            })
          ),
          mode: Type.Optional(
            Type.String({
              description:
                "Terminal display mode. Scrollback preserves terminal history/search; fullscreen uses an alternate screen with a fixed footer.",
              enum: ["fullscreen", "scrollback"],
            })
          ),
          reasoning: Type.Optional(
            Type.Boolean({ description: "Whether to show the reasoning trace in the UI." })
          ),
          sessionTree: Type.Optional(
            Type.Array(Type.String({ enum: ["assistant", "reasoning", "system", "tools"] }), {
              description:
                "What messages to show in the session tree. Defaults to assistant, reasoning, and tools.",
            })
          ),
          shiki: Type.Optional(
            Type.String({
              description:
                "Syntax highlighting: auto uses the theme's Shiki counterpart or generates from its syntax slots; a bundled name overrides it.",
              enum: ["auto", ...bundledThemes.map(({ id }) => id)].toSorted(),
            })
          ),
          theme: Type.Optional(
            Type.String({ description: "Theme name or path to custom theme file" })
          ),
          transparent: Type.Optional(
            Type.Boolean({ description: "Make the background transparent. Defaults to false." })
          ),
          treeHeight: Type.Optional(
            Type.Number({ description: "Maximum number of visible rows in the session tree." })
          ),
        },
        { additionalProperties: false }
      )
    ),
  },
  {
    $defs: definitions,
    $schema: "http://json-schema.org/draft-07/schema#",
    additionalProperties: false,
  }
)
