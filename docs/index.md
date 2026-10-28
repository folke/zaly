---
layout: home

hero:
  text: Hackable terminal coding agent.
  tagline: Work in your terminal. Choose your model. Make the agent your own.
  actions:
    - theme: brand
      text: Get started
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/folke/zaly
---

<div class="home-details">
<section class="home-detail">
<div>

<p class="home-label">01 / Your models</p>

## Choose the model, keep the workflow.

Use supported providers with API keys or browser login, including ChatGPT
subscription access through Codex. Switch models without leaving the conversation.
Your sessions stay in your terminal, not in another browser tab.

[Connect a provider →](./configuration/models.md)

</div>
<div class="home-example">

Inside zaly

```text
/login
/model
/reasoning
```

</div>
</section>
<section class="home-detail">
<div>

<p class="home-label">02 / Your workflow</p>

## Make your next prompt a command.

Turn a Markdown file into a reusable slash command. Add arguments, expressions,
and project context. Go further with instructions, skills, and plugins—without
forking the agent.

[Create a command →](./extend/commands.md)

</div>
<div class="home-example">

.zaly/commands/review.md

```md
---
description: Review selected code
---

Review {{ args }} for correctness.
Explain concrete problems and suggest fixes,
but don't edit files yet.
```

</div>
</section>
<section class="home-detail">
<div>

<p class="home-label">03 / Your boundaries</p>

## Decide what needs approval.

Start with a permission preset, then refine the allow, ask, and deny rules.
Permissions govern tool operations, not just what the prompt tells the model to do.
Inspect requests and approve the work you actually want.

[Understand permissions →](./configuration/permissions.md)

</div>
<div class="home-example">

.zaly/config.json

```json
{
  "permissions": {
    "preset": "readonly",
    "ask": ["write(*)"],
    "deny": ["bash(sudo:*)"]
  }
}
```

</div>
</section>
</div>

<div class="home-note">

**Useful today. Still alpha.** APIs, configuration, and session formats can change
before 1.0. These docs follow the repository; installed releases may differ.
Linux and macOS are tested. Windows is untested.

</div>
