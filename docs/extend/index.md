# Extend zaly

Start with the smallest mechanism that fits the job:

| Need                                           | Mechanism                                     |
| ---------------------------------------------- | --------------------------------------------- |
| Explain how a project should be worked on      | [Project instructions](./instructions.md)     |
| Reuse a prompt with arguments or shell context | [Custom commands](./commands.md)              |
| Format command inputs and conditional text     | [Templates](./templates.md)                   |
| Teach a reusable workflow loaded on demand     | [Skills](./skills.md)                         |
| Execute custom integration logic               | [Plugins](./plugins.md)                       |
| Distribute resources together                  | [Resource packs](./plugins.md#resource-packs) |

User resources apply across projects; project resources travel with a repository.
See [resource discovery](../configuration/resources.md) before choosing where to
put them.

Keep prompts focused. A short instruction or command is often more maintainable
than a plugin. Conversely, use code when something needs deterministic behavior
rather than hoping the model will consistently implement it.

::: warning Trust
Commands can execute shell snippets, and plugins execute code. Read resources
before enabling them. Do not assume the agent's tool permissions sandbox extension
code or template evaluation.
:::
