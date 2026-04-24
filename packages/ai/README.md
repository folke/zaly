# @zaly/ai

Unified multi-provider LLM API for the Zaly agent kernel.

Lazy-loaded provider adapters, streaming, tool calling, prompt-cache awareness, and token counting behind one interface. Providers are addressed by URI — `anthropic/claude-sonnet-4-5`, `openai/gpt-5`, `openrouter/kimi/k2` — and their adapter code is only loaded when the model is actually used.

> [!WARNING]
> Pre-0.1, not yet implemented — just the scaffold. The public surface will land as the kernel (`@zaly/core`) grows into it.

## License

[MIT](./LICENSE) © Folke Lemaitre
