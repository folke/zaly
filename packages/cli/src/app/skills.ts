import type { Action } from "@zaly/tui"
import type { App } from "./app.ts"

import { Skills } from "@zaly/agent"

export async function loadSkills(app: App): Promise<void> {
  const paths = app.config.$.skills.enabled ? await app.config.resources.skills() : []
  const skills = await Skills.load({ paths })
  const actions: Action[] = []

  if (app.$.skills.actions) {
    for (const skill of skills.catalog.values()) {
      actions.push({
        cmd: `${app.$.skills.actionPrefix ?? "skill:"}${skill.name}`,
        desc: skill.desc,
        fn: async () => {
          const toolUse = await skills.activate(skill.name, app.agent)
          if (!toolUse) app.notify(`Skill \`${skill.name}\` already activated.`, { level: "warn" })
          else {
            app.agent.send(toolUse.messages)
            app.notify(`Activated skill \`${skill.name}\`...`, { level: "success" })
          }
        },
        id: `skill.${skill.name}`,
        source: "skills",
      })
    }
  }

  app.actions.delete({ source: "skills" })
  app.actions.register(actions, { default: false })
  app.agent.ctx.skills = skills
}
