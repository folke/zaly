import { defineTool, AiError } from "@zaly/ai"
import { Type } from "typebox"

// oxlint-disable sort-keys

const tool = defineTool({
  name: "time",
  desc: "get the current time",
  params: Type.Object({
    timezone: Type.Optional(
      Type.String({
        description: "IANA timezone, e.g. 'Europe/Berlin'. Omit for UTC.",
        examples: ["Europe/Berlin", "America/New_York", "Asia/Tokyo"],
      })
    ),
  }),
  call: async ({ timezone }) => {
    const date = new Date()
    if (timezone) {
      try {
        const tzDate = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(date)
        return tzDate
      } catch (error) {
        throw new AiError({
          code: "INVALID_INPUT",
          message: `Invalid timezone: ${timezone}`,
          cause: error,
        })
      }
    }
    return date.toISOString()
  },
})

console.log(await tool.call({ timezone: "Europe/Berlin" }, {}))
