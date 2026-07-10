# Changelog

## [0.0.3](https://github.com/folke/zaly/compare/ai-v0.0.2...ai-v0.0.3) (2026-07-10)


### 🚀 Enhancements

* **ai/auth:** cleanup ApiKey resolving ([244b4d2](https://github.com/folke/zaly/commit/244b4d22cbb98af389e153d325e02097b703740e))
* **ai/auth:** oauth rework ([153dfcc](https://github.com/folke/zaly/commit/153dfcc071e7a881e2cb7ca00632c3757652f35c))
* **ai/models:** added new GPT 5.6 Codex Models ([6cb3b50](https://github.com/folke/zaly/commit/6cb3b504bcebf7d4c19aee566fd92361f44a9e33))
* **ai/models:** model/provider overrides rework + hook up with config ([9ea2ae4](https://github.com/folke/zaly/commit/9ea2ae4069925bc3b22586f2dabf1ae3d1c6c831))
* **ai/types:** AnyPart and SafeParamsOf ([d29dd47](https://github.com/folke/zaly/commit/d29dd47ad20fab8dfd2d52d0ac0577b0d4cec9e2))
* **ai:** allow overrides override all ModelProvider fields ([ea84cdb](https://github.com/folke/zaly/commit/ea84cdb83c216bf020c6b9d9684ffb8dee24599f))
* **ai:** big rework of oauth/authentication/model catalog ([a4b8cbc](https://github.com/folke/zaly/commit/a4b8cbc35158237e3a3e32ad0c583bb2d6b4b2e1))
* **ai:** build ModelCatalog on load, not on build ([1670a0d](https://github.com/folke/zaly/commit/1670a0dd0b5c14864bb1c723d8dc68642c65cb84))
* **cli/login:** copy url to clipboard if url could not be opened in the browser ([74b2fea](https://github.com/folke/zaly/commit/74b2fea34cf40861e15763df7f849906148c56d8))
* **cli/login:** custom render for provider picker ([d9d3474](https://github.com/folke/zaly/commit/d9d3474e192d7fe41e987a744aafa61bc9539973))
* **dev:** initial publishing ([30b54fa](https://github.com/folke/zaly/commit/30b54fab50a94e9c4ee62d01f8f96a23ce04f87d))


### 🩹 Fixes

* **agent/notify:** fix time based agent notifs ([e2d7bd4](https://github.com/folke/zaly/commit/e2d7bd498804481f17527332ad8767290d2f18ff))
* **ai/anthropic:** fixed anthropic model version detection ([3cda232](https://github.com/folke/zaly/commit/3cda232d657947d1bc9b94c9bfefa4e2b8b8e26e))
* **ai/auth:** 5 step resolution for api key ([2adbf1c](https://github.com/folke/zaly/commit/2adbf1c004af84664ba69a0c7cd1183079630cdd))
* **ai/error:** some error props are not enumerable, so spreading fails. pick them manually ([0995823](https://github.com/folke/zaly/commit/0995823e23921bf43c437346238971bf19d8e74c))
* **ai/model:** pass correct model context to loadModel ([ef7f55c](https://github.com/folke/zaly/commit/ef7f55c0a04de4f7bc3a295506570f38509eada1))
* **ai/models:** fixed model downloads ([4db576c](https://github.com/folke/zaly/commit/4db576c3beabbaf9b854030127985927027de4eb))


### 🔥 Performance

* **ai:** don't let tsgo/tsdown see/bundle models.json ([fd1e634](https://github.com/folke/zaly/commit/fd1e63485a149d758da411717d78201afd82aa30))
* **ai:** improve type-checking/linting/lsp performance ([0e07b45](https://github.com/folke/zaly/commit/0e07b4575ecd813041de761d2f3ea9fa8da0760a))
* **ai:** more type inference optims ([e106de5](https://github.com/folke/zaly/commit/e106de57782e009abda42eec105be9cd4eed1ea8))


### 💅 Refactors

* **ai:** ModelSpec.providerInfo =&gt; ModelSpec.provider ([51f2ce1](https://github.com/folke/zaly/commit/51f2ce1399394351b8561733be2e6f960cfdf1b3))
* **ai:** more model refactoring ([108c223](https://github.com/folke/zaly/commit/108c2233f9c53ca9703ef006127d123a674c14be))


### 🎨 Styles

* oxfmt ([52369c7](https://github.com/folke/zaly/commit/52369c7d22a000c16fb4953a9c4744c55b34652d))
* oxfmt ([be0afec](https://github.com/folke/zaly/commit/be0afecf4459405fdef168c3f72d322c74fe5c48))


### 📖 Documentation

* basic docs before publishing v0 ([c9c4fc3](https://github.com/folke/zaly/commit/c9c4fc34e1bddae7432abec7fcc7bf1336b27999))


### ✅ Tests

* addded models loading bench ([9e2050f](https://github.com/folke/zaly/commit/9e2050fba80bdff6a4d5de79bd8ee9bee21aec23))
* **ai:** ai tests ([f29943d](https://github.com/folke/zaly/commit/f29943dad93b932872be7c210e3f7f2063d03f41))
* fix model override tests ([d40746e](https://github.com/folke/zaly/commit/d40746eb5f3b87a50dc9bfe9997e37a72cf75a41))


### 📦 Build

* **ai:** don't put snapshot.json in git ([6a4aeca](https://github.com/folke/zaly/commit/6a4aeca6fb78d2292d76c11d3962fadf02e6d9b8))
* fix build ([995e599](https://github.com/folke/zaly/commit/995e599eb4a46f3a55ece54dd0ea1f8e256f29cd))
* update package.json files and add homepage/bugs/repository.directory ([81576dd](https://github.com/folke/zaly/commit/81576ddca3fbf8bdc4044f4a1f1b29445b524e4d))


### 🤖 CI

* fix build ([f322d6a](https://github.com/folke/zaly/commit/f322d6ad3b0662ef7163f4c817e524f74d3d45e5))
* updated github actions ([937473b](https://github.com/folke/zaly/commit/937473b9d5e60609856eb29181be82eb1550b44a))

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
