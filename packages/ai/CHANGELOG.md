# Changelog

## [0.0.2](https://github.com/folke/zaly/compare/ai-v0.0.1...ai-v0.0.2) (2026-06-17)


### 🚀 Enhancements

* **agent/session:** simplified session settings ([e8116e5](https://github.com/folke/zaly/commit/e8116e5cdfe792e5585eb9b7042f282b1437cfbf))
* **agent:** better stringify errors ([b8f7655](https://github.com/folke/zaly/commit/b8f765500f26d34db9e31658915fcf88589aee65))
* **agent:** frecency based masking ([80867f8](https://github.com/folke/zaly/commit/80867f8590f9c2bc480f12123ac3749b9d70fa57))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **agent:** ToolCallPart.params is now the cleaned params, not fully coerced defaulted params ([54c2712](https://github.com/folke/zaly/commit/54c271249351e93aa393d166f83e14bf75c2a87c))
* **ai/anthropic:** align thinking options with newer APIs ([93ade97](https://github.com/folke/zaly/commit/93ade975789b4fdb170a5821da0fdb1b3300f1a4))
* **ai/content:** added a saftey truncate of 60Kb ([ef45d92](https://github.com/folke/zaly/commit/ef45d923db2dbe8a45b0677485d4131b3f1ccf91))
* **ai/models:** added registerModel ([73830da](https://github.com/folke/zaly/commit/73830da71b80240a40aed40391ce471ac563ce7d))
* **ai/provider:** added tool-call-delta streaming events ([f23dcd5](https://github.com/folke/zaly/commit/f23dcd5311cf817dafbbcc87b48be3f1ec3ecbdb))
* **ai:** added claude-4-8 support ([50b08a0](https://github.com/folke/zaly/commit/50b08a0b08551502ddcc36a9719ffc6d473e41cf))
* **ai:** added secrets AuthProvider ([145a243](https://github.com/folke/zaly/commit/145a243ca1cdd87095a1d6450fb9f8d2e893cd82))
* **ai:** simplify model loading API ([a063088](https://github.com/folke/zaly/commit/a063088e348d657f8564095b0f8a0e0c11d407c1))
* **cli:** added session /new /resume ([41025d5](https://github.com/folke/zaly/commit/41025d51f771573cff989e471ac054c7b8ab3ac0))
* **cli:** automatically inject file references ([9c4f5da](https://github.com/folke/zaly/commit/9c4f5da640321d884eb584990434b1093d453cdf))
* **cli:** better zaly models ([cafcc1f](https://github.com/folke/zaly/commit/cafcc1f7f64812d92703ba15449002e224ed58b2))
* **cli:** better zaly models cli sub-command ([5614502](https://github.com/folke/zaly/commit/5614502aae265867c48db988ade52ac53568d9b5))
* **cli:** big actions refactor + added model/reasoning pickder ([612ba75](https://github.com/folke/zaly/commit/612ba7584b17a8737212899c3a4f33feda60d356))
* **cli:** plugin support!! ([df85809](https://github.com/folke/zaly/commit/df858094a18a2d7c3e20d4946b7f0a31195c65ff))
* **cli:** wire up cli flags with config ([52a9b5d](https://github.com/folke/zaly/commit/52a9b5d4ef817829dcc1de60dfb05d48afb07899))
* **dev:** added z exports ([d8491a9](https://github.com/folke/zaly/commit/d8491a9170f2c8cd141d80c7cb5df47e3a58fa9b))


### 🩹 Fixes

* **agent/compaction:** extract tool results instead of calls for file usage ([51eb49f](https://github.com/folke/zaly/commit/51eb49f6d8bb535639125a862f2d66f4b69a5fad))
* **agent/prompt:** never include empty system prompt blocks ([70f0bf3](https://github.com/folke/zaly/commit/70f0bf34c57d3b4420e58d3318e538a3a56ec7aa))
* **ai/gemini:** added support for gemini extra_content in tool calls ([ac00ff1](https://github.com/folke/zaly/commit/ac00ff1065bafec0070d6c69c43313d4385460c0))
* **ai/models:** codex has a hard context limit of 272k ([1e52dde](https://github.com/folke/zaly/commit/1e52ddeedbf1be0f3c0ab17ee4c28c4b78476d06))
* **ai/openai:** explicitely set strict:false for openai responses since they do weird schema coercion when not set ([e3b830a](https://github.com/folke/zaly/commit/e3b830ab5549a9eb3295038cad45db8fa8544ed4))
* **ai/provider:** wire data for openai provider ([a6d7552](https://github.com/folke/zaly/commit/a6d7552c8699798db7399f28807ca72e2a56b759))
* **ai/secrets:** trim file secrets ([1012189](https://github.com/folke/zaly/commit/1012189ed17f22f9e271b1df03e637e13731980a))
* **ai/typebox:** Value.Default before Value.Convert ([fd27c68](https://github.com/folke/zaly/commit/fd27c68b811edaa7bf7a12d52b70c2ab5e73c09a))
* **ai:** only set maxTokens when explicitely set ([2bd4a3c](https://github.com/folke/zaly/commit/2bd4a3cbd2efc56d6fbae3ad95f8873a3614240e))
* **dev/exports:** better exports report + added --node ([775d526](https://github.com/folke/zaly/commit/775d526f00ad6962b0681f7153cc246dfa5c4c06))


### 🔥 Performance

* **ai:** remove provider from ai build ([a97c53b](https://github.com/folke/zaly/commit/a97c53bed08166a6b3dfc7c7e54ef3ae76075603))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))


### 💅 Refactors

* **agent/tools:** better extractToolResults/extractToolCalls ([e27a0be](https://github.com/folke/zaly/commit/e27a0befdaa6cbf14a3136ca10539876beba2063))
* **agent:** added createAgent that lazy-loads agent deps when needed ([bc8a851](https://github.com/folke/zaly/commit/bc8a851eec719c1e9665ff82248f07bee86c601f))
* **ai/auth:** auth is now a registry ([56605d5](https://github.com/folke/zaly/commit/56605d5edc39b760cf27bbc59e72246c1dbb7d86))
* **ai:** added Tool.preflight for perm checks and extra validation ([daa21a6](https://github.com/folke/zaly/commit/daa21a66a4225e4f10fdba2e6cdb9015df828dc9))
* **ai:** big refactor around ModelSpec/ModelInfo/ProviderInfo types ([7c10df5](https://github.com/folke/zaly/commit/7c10df58d6a05ff6a24e729909dee3682d1fe736))
* **ai:** Tool.validator with lazy typebox imports ([4cfc71c](https://github.com/folke/zaly/commit/4cfc71c98bf0207afdc6e23fbc1675191b2335f1))
* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* **demo:** demos should import from the actual packages ([cb750ac](https://github.com/folke/zaly/commit/cb750ac07ee7871dac381e7f6013601a6a99e51f))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))


### 🎨 Styles

* fmt ([7843193](https://github.com/folke/zaly/commit/784319311f67f9730f5c844dda80e0a690afcf70))
* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))


### 📖 Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))


### ✅ Tests

* fix tests ([4e7144e](https://github.com/folke/zaly/commit/4e7144e7b010510103945a1bc7003e4fddcab0f4))
* fix tests ([1a5903a](https://github.com/folke/zaly/commit/1a5903a21e24df805f70537a138d84b417ec78ee))


### 📦 Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* models.dev ([9ccf902](https://github.com/folke/zaly/commit/9ccf902781802dadd927d0f1e1708401d3a73f36))
* optimized ai build ([b539b31](https://github.com/folke/zaly/commit/b539b31b21d7e3667824999cebeb44a1021ba47c))
* refactor some deeps ([d4854f5](https://github.com/folke/zaly/commit/d4854f55f95738976feb763454e7b33ae08c4cfc))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* updated api docs ([6b8f4f1](https://github.com/folke/zaly/commit/6b8f4f1c72f714bd451d2049ea90e8e86608ae7a))
