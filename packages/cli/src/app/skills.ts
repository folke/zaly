import type { Action } from "@zaly/tui"
import type { App } from "./app.ts"

import { Skills } from "@zaly/agent"

export async function loadSkills(app: App): Promise<void> {
  const skills = await Skills.load({ paths: await app.config.resources.skills() })
  const actions: Action[] = []

  for (const skill of skills.catalog.values()) {
    actions.push({
      cmd: `${app.$.actions.skillPrefix ? "skill:" : ""}${skill.name}`,
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

  app.actions.delete({ source: "skills" })
  app.actions.register(actions, { default: false })
  app.agent.ctx.skills = skills
}
