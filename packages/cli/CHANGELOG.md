# Changelog

## [0.0.5](https://github.com/folke/zaly/compare/cli-v0.0.4...cli-v0.0.5) (2026-07-10)


### 🩹 Fixes

* **cli:** make code compat with node 22 ([a054381](https://github.com/folke/zaly/commit/a0543819d4ab593410effab4010ee01cd227f634))


### 📦 Build

* **cli:** fix `--version` ([73388ab](https://github.com/folke/zaly/commit/73388ab78fafe71b0bd026e37b7b8d694aed3638))
* Node 22.11 compat ([e69afd8](https://github.com/folke/zaly/commit/e69afd83a4719117ebd5e7a2a104d7503f53a18b))

## [0.0.4](https://github.com/folke/zaly/compare/cli-v0.0.3...cli-v0.0.4) (2026-07-10)


### 🩹 Fixes

* **cli:** strip weird GPT 5.6 empty reasoning markers ([fcf6f0e](https://github.com/folke/zaly/commit/fcf6f0ed5500e5f3db3c21a6a59f54a9be3dda9b))

## [0.0.3](https://github.com/folke/zaly/compare/cli-v0.0.2...cli-v0.0.3) (2026-07-10)


### 🚀 Enhancements

* **agent/commands:** better command templates with bash execution ([af87101](https://github.com/folke/zaly/commit/af871016b9240eed4097452c39e63efd2572d3c2))
* **agent/commands:** finished commands implementation ([6ce9bbf](https://github.com/folke/zaly/commit/6ce9bbfa35d25ba06773275e15654e36e5ea136e))
* **agent/masking:** add mask checkpoints to session so that session resume start with roughly the same masking state ([fa4a6c2](https://github.com/folke/zaly/commit/fa4a6c24b14ee7cd0c0ab9f54071fe34536c791a))
* **ai/masking:** made masking configurable ([bd9d51d](https://github.com/folke/zaly/commit/bd9d51d900a0aac98b2397e3e258a51b574f5db1))
* **ai/models:** model/provider overrides rework + hook up with config ([9ea2ae4](https://github.com/folke/zaly/commit/9ea2ae4069925bc3b22586f2dabf1ae3d1c6c831))
* **ai:** big rework of oauth/authentication/model catalog ([a4b8cbc](https://github.com/folke/zaly/commit/a4b8cbc35158237e3a3e32ad0c583bb2d6b4b2e1))
* **cli:** --version ([4609787](https://github.com/folke/zaly/commit/4609787a5c444416960d8920bb028ab5b4bc8b48))
* **cli/app:** logs during startup are now sticky, so they don't get hidden by replay ([c4540f8](https://github.com/folke/zaly/commit/c4540f8042b05f42843cfe035ca1ba4bb185fc22))
* **cli/composer:** action trigger is now `:` instead of `/` ([a045e76](https://github.com/folke/zaly/commit/a045e760820664bb5d180be4a7cd3857e560ea79))
* **cli/config:** configure terminal mode: `"scrollback" | "fullscreen"` ([11234ae](https://github.com/folke/zaly/commit/11234ae035d56b41cfde63412ba26238c33af07d))
* **cli/context:** added `/context` action to show a detailed breakdown of token usage ([c08706b](https://github.com/folke/zaly/commit/c08706b5180755b00f99a76c7b6a1373e3c022c7))
* **cli/help:** help for actions / keys ([fa1f653](https://github.com/folke/zaly/commit/fa1f6537d79fa72b91af29bb79fc0cdd29e3b286))
* **cli/login:** copy url to clipboard if url could not be opened in the browser ([74b2fea](https://github.com/folke/zaly/commit/74b2fea34cf40861e15763df7f849906148c56d8))
* **cli/login:** custom render for provider picker ([d9d3474](https://github.com/folke/zaly/commit/d9d3474e192d7fe41e987a744aafa61bc9539973))
* **cli/login:** manage and login to providers ([8cfe784](https://github.com/folke/zaly/commit/8cfe784ce6e7e24a2138bd3503f88b1a73d29278))
* **cli/model:** add env vars to model desc ([ad4c845](https://github.com/folke/zaly/commit/ad4c84524e11a34b070137efd9665408bd8c2cee))
* **cli/model:** toggle all/authenticated models ([c29e28f](https://github.com/folke/zaly/commit/c29e28f57dd164e3c436f8d4c636254319522140))
* **cli/plugins:** proper plugin management: /plugins /install /update ([f5f79fd](https://github.com/folke/zaly/commit/f5f79fd08bbc3a6f2689ad96392ca3310ff5ba90))
* **cli/resources:** added /resources --project|--user ([64795bd](https://github.com/folke/zaly/commit/64795bddc35b2a68c9839b004fba861753ed3400))
* **cli/resources:** pass `plugin` to resource manager ([cdb35e3](https://github.com/folke/zaly/commit/cdb35e3e31c9463723641541231ed754c1e22cb0))
* **cli/session:** session token usage breakdown in table ([895541f](https://github.com/folke/zaly/commit/895541f2b290ae0d17b763f34fe27e62c1d65228))
* **cli/skills:** added skill renderer ([d9698ba](https://github.com/folke/zaly/commit/d9698ba9ad738a784ef89fbaf3a722aea80cc365))
* **cli/stream:** configure which tools to show as collapsed ([524e33a](https://github.com/folke/zaly/commit/524e33a854d6c1750f892750201d865640f44387))
* **cli/theme:** live theme preview and use custom theme resources ([8291f96](https://github.com/folke/zaly/commit/8291f9683f144ad73cd1ccf74a5556b41027323e))
* **cli/tree:** tree filter settings ([862ff1d](https://github.com/folke/zaly/commit/862ff1d3256a05878d8eab9ef6a2b97fe00b8a09))
* **cli/ui:** allow disabling reasoning in the ui ([7ccf951](https://github.com/folke/zaly/commit/7ccf95101509770ae2135dfd64a24afb50ef05a7))
* **cli/user:** user message meta markdown?:boolean ([0130773](https://github.com/folke/zaly/commit/013077341ce014feb2c3f553336b9bf79f4cc4b0))
* **cli:** added --mode to configure terminal mode ([7b73647](https://github.com/folke/zaly/commit/7b73647d0e4427d2ec1e2ce3fae37e9cc05b2281))
* **cli:** added /config ([47076e2](https://github.com/folke/zaly/commit/47076e25411fe39862b32a9d1ce74d9838b3cf50))
* **cli:** added `--debug` which sets Logger level to debug instead of info ([cbb574a](https://github.com/folke/zaly/commit/cbb574a12e3cd21df0169d24006b7b55202f0f11))
* **cli:** added `/session` with session info ([8189809](https://github.com/folke/zaly/commit/81898097cd2e729f78dfe3cb1c06143c0d67e7fc))
* **cli:** added `ctrl-y` as default keymap to copy/yank selection or input ([abe36bc](https://github.com/folke/zaly/commit/abe36bcaba81a68636042409760e191a584bc46c))
* **cli:** added copy on select ([86f0942](https://github.com/folke/zaly/commit/86f0942497e8666a392a77fca7806838bb53251b))
* **cli:** AppState.loading + App.do() ([9b4733b](https://github.com/folke/zaly/commit/9b4733bb37c927f82ef8674008d59ed38058ecb6))
* **cli:** enabled stack traces in debug mode `--debug` ([29ea8ad](https://github.com/folke/zaly/commit/29ea8ad39eac9b1d21f55bfff7b1314813814f93))
* **cli:** keep track of lastModel in state.json ([fa4a300](https://github.com/folke/zaly/commit/fa4a300a8e6d9cce3ee1330d7393d96a14ce18f8))
* **cli:** live propagate listHeight to autocomplete/picker ([34c38fa](https://github.com/folke/zaly/commit/34c38fa76b3c34c83ff1fba23d0bb7be4a9304da))
* **cli:** manage resources (enabled/disable) ([8e1f09f](https://github.com/folke/zaly/commit/8e1f09f67bc0d94ca6073d036c1b6fe7d94fdf53))
* **cli:** more lenient error handling in config files ([47cea3c](https://github.com/folke/zaly/commit/47cea3c2317eab04ea608cb822b9ab2d7b277816))
* **config:** add state:JsonFile to ConfigManager ([190e789](https://github.com/folke/zaly/commit/190e78965ae64f8f8e5cf3eb55a782bd529185ce))
* **config:** added `ui.copyOnSelect` config option ([f886a11](https://github.com/folke/zaly/commit/f886a114c5c252414eb0a3968c1d20b0b72717fc))
* **config:** allow configuring a skill/command action prefix ([e9502db](https://github.com/folke/zaly/commit/e9502dbec293050cbae2bfed149e8edc65d2bba7))
* **config:** made session tree sections configurable ([e17e40e](https://github.com/folke/zaly/commit/e17e40e5a6c23287232b8343fcca123dbfb7442e))
* **config:** make bash/git/npm paths configurable ([bd552f3](https://github.com/folke/zaly/commit/bd552f3335c06feb06b7a2be0f3c630fdcba1018))
* **config:** MOAR config options ([0ba1911](https://github.com/folke/zaly/commit/0ba191157d9cae9a0b0600c165cb19cd50effca1))
* **config:** packages support (npm & git) ([2fbe300](https://github.com/folke/zaly/commit/2fbe30074676f7bebd8541379fbda2e95de0dc88))
* **config:** pass resource excludes from flags ([696fdb3](https://github.com/folke/zaly/commit/696fdb3148f1e350cf59213116e1230e0f8b6bb3))
* **config:** propagate compaction settings ([9c78f0a](https://github.com/folke/zaly/commit/9c78f0a6fb732c944beb6344aee79a00d3dc0b79))
* **config:** resource management ([6b5b561](https://github.com/folke/zaly/commit/6b5b561237fa14b4c94e02ab465fff83b7d7c5b2))
* **config:** ui.listHeight and ui.treeHeight ([673b265](https://github.com/folke/zaly/commit/673b26515286041a5015e8104f9763a6b2dc99df))
* **dev:** initial publishing ([30b54fa](https://github.com/folke/zaly/commit/30b54fab50a94e9c4ee62d01f8f96a23ce04f87d))
* **plugins:** debug plugins now prints tool schemas and prompts ([ca4398b](https://github.com/folke/zaly/commit/ca4398b79a93006567e1c043008131b1d9eb0dfa))
* **shared/args:** added support for positional args ([f700065](https://github.com/folke/zaly/commit/f700065284d98e8c6eb8750cfdee1a88e55164aa))
* **shared/json:** added JsonFile to easily manage json files (config/state/etc) ([00649a8](https://github.com/folke/zaly/commit/00649a8eced29074182124a1957ae0d12db97085))
* **tui/images:** allow disabling image rendering ([3fb7282](https://github.com/folke/zaly/commit/3fb7282e75ea7fb9a56d768cb749bd795ef0e7ea))
* **tui/picker:** opts.clearInput ([055bdc6](https://github.com/folke/zaly/commit/055bdc676708772579f83742345163933a973024))
* **tui/prompt:** generic prompt service that integrates with the composer ([189e125](https://github.com/folke/zaly/commit/189e125388bedae2d549c8c0d8b2a503e9039b00))
* **tui/reactive:** createRef now has an optional onSet ([ae92b41](https://github.com/folke/zaly/commit/ae92b41325f0974290dfb8f1799027928572e656))


### 🩹 Fixes

* **agent/bash:** tag dynamic paths containing shell expansion or globs ([3776e7b](https://github.com/folke/zaly/commit/3776e7b8782a6fcf9fc48fa3a33be5ab3f5c68c1))
* **agent/ctx:** don't update session settings when it's not started yet ([76e0793](https://github.com/folke/zaly/commit/76e0793ac88f060db24637c36ce1f71a61bdbc48))
* **agent/ctx:** use model registry and correct auth manager for loading session models ([48df4d8](https://github.com/folke/zaly/commit/48df4d8fb0af2d064840b7295b460f08afcd58c7))
* **agent/masking:** include prompt/tools in token estimation for masker ([a498fef](https://github.com/folke/zaly/commit/a498fef6e36ccd576420118a299276a97a4ca745))
* **app:** logger entries need left-padding:1 ([18276b6](https://github.com/folke/zaly/commit/18276b65934a457cbd727cfe0fc6bbde06b15b87))
* **cli/app:** reset config on reload ([bd35aec](https://github.com/folke/zaly/commit/bd35aecc430694bae892ed09bf7491bbaea03927))
* **cli/composer:** always update/refresh input history ([cfcf630](https://github.com/folke/zaly/commit/cfcf63023ba1488637f788022f5316044b386541))
* **cli/login:** max width 80% ([72d70ee](https://github.com/folke/zaly/commit/72d70eef683c9987ae6431a6d920689788caee32))
* **cli/themes:** only apply theme when set ([03974ce](https://github.com/folke/zaly/commit/03974ceaf6882a43e6f15d04d68699cb83906058))
* **cli/tools:** implemented ToolRenderer.call ([df4eef2](https://github.com/folke/zaly/commit/df4eef2fd087e7853dfe5bde0fb19bac70a7a96e))
* **cli/tools:** move params to separate widget to prevent cycle ([eda53fb](https://github.com/folke/zaly/commit/eda53fbe191c7844f366119720954a7114bcf1d9))
* **cli/ui:** propagate listHeight to autocomplete ([4a9e1c1](https://github.com/folke/zaly/commit/4a9e1c15de8aa7c91dbcf16c60dbadc0cce5c56b))
* **cli:** action trigger is now `/` again instead of `:` ([dad224f](https://github.com/folke/zaly/commit/dad224fde07b617c9fe31a6d9aca91bce69c8d58))
* **tui/composer:** allow whitespace aftr `:`, but not before ([70c6a09](https://github.com/folke/zaly/commit/70c6a09ab57d6bce8c6f0a06774e34654cb15640))
* **tui/log:** don't render empty log content ([c6e0d7f](https://github.com/folke/zaly/commit/c6e0d7f25aa708ac19f3ce264332227d372e6678))


### 💅 Refactors

* **ai:** ModelSpec.providerInfo =&gt; ModelSpec.provider ([51f2ce1](https://github.com/folke/zaly/commit/51f2ce1399394351b8561733be2e6f960cfdf1b3))
* **ai:** more model refactoring ([108c223](https://github.com/folke/zaly/commit/108c2233f9c53ca9703ef006127d123a674c14be))
* cleanup ([2cb908e](https://github.com/folke/zaly/commit/2cb908e54e730f2ee4bf6dd5dc410423d64f8815))
* **cli/resources:** use multi select (with custom render) ([eb350ce](https://github.com/folke/zaly/commit/eb350ce1b33ccd6ea67b07f8d7efe5c339fc6562))
* **cli:** make config a getter instead of async loaded ([38d697b](https://github.com/folke/zaly/commit/38d697b1e89267a4d031b894078f0be276259b6e))
* **cli:** move theme/model actions to separate file ([e8a1cd7](https://github.com/folke/zaly/commit/e8a1cd710b0924ab3b5d81d6beef21222fc0d843))
* **config:** added ResolvedSettings inferred from default settings ([fd8660d](https://github.com/folke/zaly/commit/fd8660def74a22c83907f9faae34e8207540476a))
* **config:** ConfigManager ([149a353](https://github.com/folke/zaly/commit/149a353de12a5e973172e5fead9120de7bec0bc7))


### 🎨 Styles

* **cli/actions:** better desc for `app.copy` depending on terminal.mouse ([ebbebee](https://github.com/folke/zaly/commit/ebbebeef8ff3ef1de21769eaad9a8fa10bfb5cf9))
* **cli/actions:** rename some action fns ([aae37ad](https://github.com/folke/zaly/commit/aae37adde752ff08d756027e4b07b1dc835d11e3))
* **cli:** remove env vars from model list ([dfc34e5](https://github.com/folke/zaly/commit/dfc34e5aeac85f8a2b670742fd157d29f9946fb0))
* oxfmt ([be0afec](https://github.com/folke/zaly/commit/be0afecf4459405fdef168c3f72d322c74fe5c48))


### 📖 Documentation

* basic docs before publishing v0 ([c9c4fc3](https://github.com/folke/zaly/commit/c9c4fc34e1bddae7432abec7fcc7bf1336b27999))
* tagline ([89fdaa5](https://github.com/folke/zaly/commit/89fdaa54fe8269b136cc1df548dfa339c61f45c2))


### 📦 Build

* update package.json files and add homepage/bugs/repository.directory ([81576dd](https://github.com/folke/zaly/commit/81576ddca3fbf8bdc4044f4a1f1b29445b524e4d))


### 🤖 CI

* enable linting ([1c64a8a](https://github.com/folke/zaly/commit/1c64a8a4f2699cb2992522e1a634a8154129feb4))
* fix build ([f322d6a](https://github.com/folke/zaly/commit/f322d6ad3b0662ef7163f4c817e524f74d3d45e5))

## [0.0.2](https://github.com/folke/zaly/compare/cli-v0.0.1...cli-v0.0.2) (2026-06-17)


### 🚀 Enhancements

* **agent/session:** simplified session settings ([e8116e5](https://github.com/folke/zaly/commit/e8116e5cdfe792e5585eb9b7042f282b1437cfbf))
* **agent:** expose full TokenUsage ([f23afa4](https://github.com/folke/zaly/commit/f23afa4efad7206aaa50fad8528603931f04381c))
* **agent:** grep/find tool ([7df18b6](https://github.com/folke/zaly/commit/7df18b62caca622bbd74c8301f3c6f09185890c4))
* **agent:** markdown prompt template commands ([16bbb67](https://github.com/folke/zaly/commit/16bbb67bc334e099ade52822e94ccc590b47162a))
* **agent:** seed context usage from session messages ([0217d57](https://github.com/folke/zaly/commit/0217d57a10093b1a995e9d4950bea4bd492713a0))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **ai/anthropic:** align thinking options with newer APIs ([93ade97](https://github.com/folke/zaly/commit/93ade975789b4fdb170a5821da0fdb1b3300f1a4))
* **ai:** added secrets AuthProvider ([145a243](https://github.com/folke/zaly/commit/145a243ca1cdd87095a1d6450fb9f8d2e893cd82))
* **ai:** simplify model loading API ([a063088](https://github.com/folke/zaly/commit/a063088e348d657f8564095b0f8a0e0c11d407c1))
* **app:** add skills to slash commands ([6352cb2](https://github.com/folke/zaly/commit/6352cb2961a514ba19f252f79872087b1c85132e))
* **cli/actions:** ctrl+c now cancels current input or exits on second press ([f488610](https://github.com/folke/zaly/commit/f488610b6b6866d91615454e0745ae9c74056bf7))
* **cli/app:** faster messages replay ([d34dd64](https://github.com/folke/zaly/commit/d34dd644aeb7691a1cad4291f38ccabca0bd51cb))
* **cli/app:** split agent loading from model loading to give plugins a chance to register models before loading ([a796f14](https://github.com/folke/zaly/commit/a796f147b734df5075b11c63e57fc2592a11a853))
* **cli/bubble:** tool pending bubble now has a spinner ([b4b0346](https://github.com/folke/zaly/commit/b4b03467af20f2d5b51848c9fee4d81337ccc1f3))
* **cli/picker:** add picker.close to app.cancel ([cbaa426](https://github.com/folke/zaly/commit/cbaa4262b9db017e1340649197d7a68e0b81365d))
* **cli/session:** better session tree rendering ([fcbaa37](https://github.com/folke/zaly/commit/fcbaa372354914bd3b776ba4d8c30f832dfb3ab3))
* **cli/statusline:** show percentage of used context ([7f62665](https://github.com/folke/zaly/commit/7f62665a456347fa27d21819fc63c2b7cbe7a99e))
* **cli/stream:** better rendering for pending tool calls ([5bac0cf](https://github.com/folke/zaly/commit/5bac0cfd69b819c7b537824ae8b40139ca668be4))
* **cli/tools:** better tool renderer ([7c7aedb](https://github.com/folke/zaly/commit/7c7aedb7f1b466134187a965b1340e296093dd5d))
* **cli:** added --help for slash commands + skills + template commands ([e6c0f37](https://github.com/folke/zaly/commit/e6c0f375f4b5d63442eb498c089dbfca9967f693))
* **cli:** added --permission to select a preset ([b0b6e8e](https://github.com/folke/zaly/commit/b0b6e8e50701ca839b93757cb09e9b33f1b0bf90))
* **cli:** added !bash commands to composer ([31c5378](https://github.com/folke/zaly/commit/31c53786d584591220b1c1c234aa0b7f7e5ce8ae))
* **cli:** added /theme ([49c2baf](https://github.com/folke/zaly/commit/49c2bafcb1c62fa5dd37ecbee38f3a972e53e8ce))
* **cli:** added input history picker ([351bc90](https://github.com/folke/zaly/commit/351bc90566af585af63b3458d68c17720100e834))
* **cli:** added permission ask workflow ([be1afa2](https://github.com/folke/zaly/commit/be1afa2425424600a8272bd926db4763b4c3f126))
* **cli:** added scroll to top/bottom ([fc7ef24](https://github.com/folke/zaly/commit/fc7ef24e04a54fcc6808b0bd81be1414e15eeb5a))
* **cli:** added session /new /resume ([41025d5](https://github.com/folke/zaly/commit/41025d51f771573cff989e471ac054c7b8ab3ac0))
* **cli:** added session /tree command ([d9c860b](https://github.com/folke/zaly/commit/d9c860b44c4cb97c70a939f4fba0fe6d469e9593))
* **cli:** added support for pending messages (sticky with spinner) ([e98d1c8](https://github.com/folke/zaly/commit/e98d1c820d2d570d43414acd5fad56dc2045646c))
* **cli:** added support for user keymaps ([1dacc2a](https://github.com/folke/zaly/commit/1dacc2af9539c0bf7b5ee5070add53be58baf844))
* **cli:** assistant messages now show as pending/sticky while streaming ([d641370](https://github.com/folke/zaly/commit/d641370a3b9eb1e0d21bc002c91515256253be8a))
* **cli:** automatically inject file references ([9c4f5da](https://github.com/folke/zaly/commit/9c4f5da640321d884eb584990434b1093d453cdf))
* **cli:** better zaly models ([cafcc1f](https://github.com/folke/zaly/commit/cafcc1f7f64812d92703ba15449002e224ed58b2))
* **cli:** better zaly models cli sub-command ([5614502](https://github.com/folke/zaly/commit/5614502aae265867c48db988ade52ac53568d9b5))
* **cli:** big actions refactor + added model/reasoning pickder ([612ba75](https://github.com/folke/zaly/commit/612ba7584b17a8737212899c3a4f33feda60d356))
* **cli:** composer plugins refactor ([d7becd7](https://github.com/folke/zaly/commit/d7becd78085478cd174eee423177131a99d14b04))
* **cli:** debug sub command ([0579ffa](https://github.com/folke/zaly/commit/0579ffa2d88e4852641048de910e7c131045b6be))
* **cli:** extract CommandDef type for args ([16488aa](https://github.com/folke/zaly/commit/16488aa8d220bad94abc4bf2b782cfae2c6582ac))
* **cli:** frecency for file picker ([b91d67a](https://github.com/folke/zaly/commit/b91d67a46dcac5992604edcef30113b75b8c5898))
* **cli:** let other tools detect zaly as an AI agent ([5f0d68f](https://github.com/folke/zaly/commit/5f0d68f5edf181ee7babd03e54fc744057f14481))
* **cli:** load .env files ([b123689](https://github.com/folke/zaly/commit/b1236890f3d1b4c53d92d1cd805db6d319c135a6))
* **cli:** load model from --model, state or session ([246f836](https://github.com/folke/zaly/commit/246f8369ebef4b1097ee425cdfe108985b3bfd1a))
* **cli:** map esc to abort agent run ([3254eb8](https://github.com/folke/zaly/commit/3254eb83ef24188fa7494b6a7c90256c49abab88))
* **cli:** move autocomplete in an overlay ([38b2044](https://github.com/folke/zaly/commit/38b20447470bddeb5f7ba63819052b2e479e11d0))
* **cli:** order footer ui like Neovim ([9af56bc](https://github.com/folke/zaly/commit/9af56bc27da7926b5a18b0babdf6a3faf7c95a8d))
* **cli:** plugin support!! ([df85809](https://github.com/folke/zaly/commit/df858094a18a2d7c3e20d4946b7f0a31195c65ff))
* **cli:** refactored injected toolUse ([5d389db](https://github.com/folke/zaly/commit/5d389db1d810d9e620e75d1743d6a58e59b0c959))
* **cli:** scrolling indicator in statusline ([71066a3](https://github.com/folke/zaly/commit/71066a3500748f79d4bed6e1b23b3dca3cbcac59))
* **cli:** set process title to zaly ([518b4b1](https://github.com/folke/zaly/commit/518b4b1ae8633395c1ce0419d376783e24dc245e))
* **cli:** show permission ask details ([a623c3b](https://github.com/folke/zaly/commit/a623c3b50326634c6436fb015458b70871c8e926))
* **cli:** wire up cli flags with config ([52a9b5d](https://github.com/folke/zaly/commit/52a9b5d4ef817829dcc1de60dfb05d48afb07899))
* **config/state:** state for transient settings ([e0c7d73](https://github.com/folke/zaly/commit/e0c7d7309f1e70ae8ca436e31d200b746782432d))
* **config:** added permissions to settings ([2ff04cd](https://github.com/folke/zaly/commit/2ff04cd3b8a15fbcacb27f45635a365f228ebbfc))
* **logger:** wire up the logger in all the places ([72cc4e0](https://github.com/folke/zaly/commit/72cc4e0360d1c9353f25feb3230ae876b23310b8))
* **shared/emitter:** allow passing an abort signal to automatically unsubscribe listeners ([fff8b85](https://github.com/folke/zaly/commit/fff8b85a2287aaa32cb8ebd700f139e229967fa1))
* **shared/paths:** move zalyPaths to shared and use XDG ([54145f0](https://github.com/folke/zaly/commit/54145f07f06538798ca85f452e65e419aa3be0c2))
* **tui/autocomplete:** let autocomplete grow/shrink when needed ([3420a79](https://github.com/folke/zaly/commit/3420a79b909de805cadf4d8d4d06005b126346d0))
* **tui/bubble:** blue bubble icon for pending tool calls ([e6682a7](https://github.com/folke/zaly/commit/e6682a71b392d2592c30b4c50040c96281cc62fd))
* **tui/input:** added input history ([57c8029](https://github.com/folke/zaly/commit/57c8029ce838c01288bfdc80c7fd3621f27016ce))
* **tui/input:** atomic delete for attachment markers and custom formatters ([4dc0275](https://github.com/folke/zaly/commit/4dc0275509f3c76ad7420eb293b38c573beb42f1))
* **tui/inspect:** inspect() using zaly themes ([11f84e9](https://github.com/folke/zaly/commit/11f84e91f27046ca090fff5787f8252a5f6186aa))
* **tui/logger:** allow wrapping logger nodes before adding to the stream ([1ba4a0c](https://github.com/folke/zaly/commit/1ba4a0c861b6d9a3d0699b2c17e153e06369f543))
* **tui/overlay:** added relative positioning to screen/ui/stream ([58257f3](https://github.com/folke/zaly/commit/58257f3145b413ec16b0914de630a5988afdf9a5))
* **tui/overlay:** simplify overlay management ([9356f77](https://github.com/folke/zaly/commit/9356f772c0dbf7d06489f3473abe9754dae584cf))
* **tui/picker|menu:** added support for non-filtering picker and match prev/next ([ef0162e](https://github.com/folke/zaly/commit/ef0162eba0e041f19236aaf5aad601d152d8d4f5))
* **tui/reactive:** added createRef and Node.ref() ([dca7ab9](https://github.com/folke/zaly/commit/dca7ab99370dde2b25a91d6ee92f26c102f650c2))
* **tui/reactive:** properly working createAsync ([c55821d](https://github.com/folke/zaly/commit/c55821d9bb69d8238ebd595d57c07e7f18dc5c35))
* **tui/renderer:** propagate Node emitter listener errors to the stream ([a16c39b](https://github.com/folke/zaly/commit/a16c39bf9b9eee4bcaee329fbf5146234dc4e84f))
* **tui/renderer:** render surfaces now accept ()-&gt;Node, which runs the fn inside a new root context ([8cdab82](https://github.com/folke/zaly/commit/8cdab82f632c97a6660626f1237193bdc11067aa))
* **tui/select:** reverse select ([f68b562](https://github.com/folke/zaly/commit/f68b56273ce31c382ae864bd991eede543966077))
* **tui/show:** better show(): branches/gates/fallbacks and lazy node creation ([ea6760a](https://github.com/folke/zaly/commit/ea6760a405c2ed6d8725f40fba5bfee41b59069a))
* **tui/spinner:** optional idle char (instead of space) ([6ad5aa6](https://github.com/folke/zaly/commit/6ad5aa690909c613cd5f5b1178b807cd9bbfcc14))
* **tui/stream:** make scrolling return a promise that resolves when the scroll anim is done ([40bcb6e](https://github.com/folke/zaly/commit/40bcb6e85058025165c0e73b90fcfef4835f9e7b))
* **tui/stream:** separate viewport from scrollback queue. Realtime rendering now ([49a6a44](https://github.com/folke/zaly/commit/49a6a44b9c87231660174df2a05f3a5953b9bce8))
* **tui/stream:** virtual stream scrolling ([9190f1e](https://github.com/folke/zaly/commit/9190f1ec22c0544c5f8a6baa5d8c2fae7d69c21d))
* **tui/terminal:** terminal progress support (ghossty and others) ([a0680f1](https://github.com/folke/zaly/commit/a0680f1331f56b1d4c37cc43c0162968703777c4))
* **tui/tree:** select active tree node ([9a83c3e](https://github.com/folke/zaly/commit/9a83c3ef3ca796afb63d6abe7c2ea02872340e4e))
* **tui:** added divider() ([be1364a](https://github.com/folke/zaly/commit/be1364aa59f5e44ac3bb1932b6f67f2c88770561))
* **tui:** added log notify style that shows a notification ([e581fb2](https://github.com/folke/zaly/commit/e581fb2219e32481fcba73427fa99a5e7f4b0e95))
* **tui:** improved and simplified paste and attachments ([96df15a](https://github.com/folke/zaly/commit/96df15a7a92a97eb4f5a3269f4918f1f5f3635a7))
* **tui:** picker/notifier service ([0661686](https://github.com/folke/zaly/commit/0661686d6f46691998759092972cea77711ae27b))
* **tui:** refactored key bindings / actions (simplified) ([de28902](https://github.com/folke/zaly/commit/de2890219d260b09034b3284a633c361a62733f9))
* **tui:** shiki worker threads ([75d106c](https://github.com/folke/zaly/commit/75d106c6faa7612b087f6fb2a01d3249082a2135))


### 🩹 Fixes

* **agent/read:** read tool should check freshness taking masked results into account ([2215b38](https://github.com/folke/zaly/commit/2215b3852b9dbad0b7e706fc87b076d7030e6bb3))
* **agent/tools:** make all tool args with defaults optional ([8ef6b99](https://github.com/folke/zaly/commit/8ef6b993877c719eac3eb57f4ca5cd9cdb9522ca))
* **cli/actions:** proper output for oauth login fllows ([0bff136](https://github.com/folke/zaly/commit/0bff1369067d8b84e01a9beefb34097f826dd282))
* **cli/app:** allow submit when agent is busy. Always inject instead of send ([380b2ae](https://github.com/folke/zaly/commit/380b2aefd6bf808276615c44f38d5969f9ec2db8))
* **cli/bubble:** make bubble type reactive ([fc3555d](https://github.com/folke/zaly/commit/fc3555dc58b60e5915856c6008fab784714c0909))
* **cli/bubble:** width:fill ([90596d5](https://github.com/folke/zaly/commit/90596d5bd8d262030ccc4a4e3ea627dd8202d0dc))
* **cli/replay:** bump repllay overlay to last 8 messages ([974c01d](https://github.com/folke/zaly/commit/974c01dfe8fd697052f36daaabc6afbc5dee14ce))
* **cli/session:** collapse single child branches ([30c82da](https://github.com/folke/zaly/commit/30c82da82b51d0b4cb140f6a6d4c23cb980738d7))
* **cli/session:** session filter for cwd ([172d4cc](https://github.com/folke/zaly/commit/172d4ccf33797c56f6dd3cb6e53454c106e0bf61))
* **cli/tool:** don't show tool result when error ([9feaca0](https://github.com/folke/zaly/commit/9feaca08bce2e272f16ac07db75fbb30a9592ecb))
* **cli/tools:** show tool errors ([e86cdb0](https://github.com/folke/zaly/commit/e86cdb008aedfdd9664018f15afc4bc7ecd537a5))
* **cli:** don't do process.exit ([2de9895](https://github.com/folke/zaly/commit/2de9895155432601b11f75d02f53e2ab0ea8c394))
* **cli:** fixed footer height is 5 rows, not 3 ([6b6011d](https://github.com/folke/zaly/commit/6b6011d2a767a25fc62d399589688f1c92804b88))
* **cli:** flush console in citty cleanup ([31b1783](https://github.com/folke/zaly/commit/31b1783ef07d59298d719aba14e475925691a27f))
* **cli:** session settings resolution ([75897db](https://github.com/folke/zaly/commit/75897dbc1864c2024166433a275d32bc9a453d4b))
* **cli:** set reasoning to trigger statusline updated ([f06fe9c](https://github.com/folke/zaly/commit/f06fe9c942ae5412b0e5854a213e2a75239f7c81))
* **cli:** show agent errors in stream ([77c1fb1](https://github.com/folke/zaly/commit/77c1fb1e55d98d38c5aacaaaeee5e5f75b7cd6fe))
* **cli:** use new session manager ([26c53bf](https://github.com/folke/zaly/commit/26c53bf575ee80093c57c480e20003f5f0037ac8))
* **cli:** wait till app exited in runMain, so citty cleanup can run at the correct time ([a76c5af](https://github.com/folke/zaly/commit/a76c5afeb999005803ebd90ca5cc17bd59ffce33))
* **plugins:** better notif for ollama & lm-studio when not running ([0371c4b](https://github.com/folke/zaly/commit/0371c4be95fb06d7a4bfc742af5913a07a6eee25))
* **plugins:** proper error notif when a plugin fails loading ([9e0f8c3](https://github.com/folke/zaly/commit/9e0f8c38b2911975d6270b276a8ea17d273e6bdc))
* **shared/registry:** return keys() in insertion order ([8541128](https://github.com/folke/zaly/commit/8541128e932ac66087bd161ab9b143c48104299f))
* **tui/box:** resolveWidth with width:fit ([f6727e7](https://github.com/folke/zaly/commit/f6727e789df1a4ba8cd22bde745b0bb4bc6f9c26))
* **tui/logger:** await markdown renderer for log entries ([7f292bb](https://github.com/folke/zaly/commit/7f292bbd8966c9d6ecfada203e0e10dbd0adc549))
* **tui/picker:** close previous picker and diable automcplete when picking ([a194fcb](https://github.com/folke/zaly/commit/a194fcb67ce406b75ca5046b6d9fed023b3a797d))
* **tui/statusline:** only show status when status !== "ready" ([d3e5fb7](https://github.com/folke/zaly/commit/d3e5fb71d587bb050a2b5212482c2bd2834da36d))


### 🔥 Performance

* **cli:** even better & faster replay ([ecc9b09](https://github.com/folke/zaly/commit/ecc9b09cf14adc944f32a5db4cb46493ce1e625b))
* **cli:** lazy load agent ([540c73b](https://github.com/folke/zaly/commit/540c73b91d89db1a21777868814371d0526d9472))
* **cli:** lazy-load claudeSession ([2c539b3](https://github.com/folke/zaly/commit/2c539b389e5bf0f7975ef25e34d905f7a1f254f8))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))
* **tui/stream:** never await async rendering in the stream render ([415f2b8](https://github.com/folke/zaly/commit/415f2b8dab6d2887817c3a4955e894150f48d553))
* **tui:** export tui/themes ([705ea45](https://github.com/folke/zaly/commit/705ea4597f04fd95fb540e666eadc3a91cd7b67a))
* **tui:** make exported createCtx async ([333e9c5](https://github.com/folke/zaly/commit/333e9c522cf651306eaa94f0a40f51c0faecafe5))
* **tui:** optimized progressive shiki highlighting ([0a33da6](https://github.com/folke/zaly/commit/0a33da67bf866cc534973189189a8c94829c6525))


### 💅 Refactors

* ActionInfo =&gt; ActionDef ([aeec920](https://github.com/folke/zaly/commit/aeec92050b505eb08bd43de96fb1dea8b834e690))
* **agent|cli:** use LazyCache for Context & AgentContext ([ccddf7e](https://github.com/folke/zaly/commit/ccddf7ea7f762bbf84d7a4e8d993275d170bf85e))
* **agent:** added createAgent that lazy-loads agent deps when needed ([bc8a851](https://github.com/folke/zaly/commit/bc8a851eec719c1e9665ff82248f07bee86c601f))
* **ai/auth:** auth is now a registry ([56605d5](https://github.com/folke/zaly/commit/56605d5edc39b760cf27bbc59e72246c1dbb7d86))
* **ai:** big refactor around ModelSpec/ModelInfo/ProviderInfo types ([7c10df5](https://github.com/folke/zaly/commit/7c10df58d6a05ff6a24e729909dee3682d1fe736))
* **all:** Node.setState() -&gt; Node.state.set() ([ac18f63](https://github.com/folke/zaly/commit/ac18f6316d8379c50af5784260f7bd2532450c1c))
* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* **cli:** added cli context to centralize all config loading ([104ef0b](https://github.com/folke/zaly/commit/104ef0b5269c62bb44b5049252117d78fdd0b62f))
* **cli:** cleanup AppState ([559e652](https://github.com/folke/zaly/commit/559e65297391de22e3ebca82fe19199fffdf7834))
* **cli:** moved attachment and file ref handling in user message to respective composer plugins ([825072a](https://github.com/folke/zaly/commit/825072ac4416ccd79dbc3fa74777d4d692437964))
* **cli:** restructured cli modules. Instant session loading now in tui ([205eecb](https://github.com/folke/zaly/commit/205eecb944fde99c1c275cefefcd19ea9812180e))
* **config:** Config.resources and can be false to skip ([845af72](https://github.com/folke/zaly/commit/845af720ceab0c742b838a5891bd855ae7ae7326))
* **config:** prompts -&gt; commands ([4b75716](https://github.com/folke/zaly/commit/4b75716f4f536092f465ffbbd9f3ef941c482112))
* more refactoring ([ced76fb](https://github.com/folke/zaly/commit/ced76fbc349571561fa6732e2e2dc9af5bfcaa68))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* **shared/glob:** move glob from agent/utils to shared/glob ([18ff32e](https://github.com/folke/zaly/commit/18ff32e6ad1eff4c8fb117f5aa223f902674e816))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))
* **shared:** move logger to shared and split logging from reporting ([f7bf75e](https://github.com/folke/zaly/commit/f7bf75e4dafd9c1c6e401ed1c053cf647963308e))
* split up widgets/services exports in tui ([84d81ad](https://github.com/folke/zaly/commit/84d81ad31e6fe2072782e990e6f35c5e0ce16153))
* **tui/actions:** ActionInfo.name -&gt; ActionInfo.cmd ([7034b9a](https://github.com/folke/zaly/commit/7034b9a64ab1e300777e5c2aaf6b6c9a99f70a28))
* **tui/overlay:** overlay.add(Node) =&gt; overlay.add(() =&gt; Node) ([fb30fa5](https://github.com/folke/zaly/commit/fb30fa54c946b8f523e30a183dedac3c5349dcea))
* **tui/picker:** refactor/cleanup select/picker/autocomplete/tree ([aadcc2d](https://github.com/folke/zaly/commit/aadcc2de3967a4be8b6f33e02e7477baf5c09f2d))
* **tui/reactive:** useContext / provideContext ([0cf7ed7](https://github.com/folke/zaly/commit/0cf7ed76ea9420f9a33450c38f3572d9659e8d71))
* **tui/renderer:** made createRenderer async ([37ad5e3](https://github.com/folke/zaly/commit/37ad5e385bb2947c22e54afa30e4d0caf58d2444))
* **tui/select:** get rid of Option.value in favor of Option.text ([0164575](https://github.com/folke/zaly/commit/016457509bd472eb532858cf38c3de5478082026))
* **tui/stream:** Stream.append(Node) =&gt; Stream.append(() =&gt; Node) ([699cf59](https://github.com/folke/zaly/commit/699cf59b7a4e11492d84c9edfb19ce7caa1ed0a7))
* **tui/widget:** simplify widget types ([a42ed32](https://github.com/folke/zaly/commit/a42ed32c2dfe5e9c782323f3c54b6146d2795ba9))
* **tui:** autocomplete now uses Ref&lt;Input&gt; ([d9817df](https://github.com/folke/zaly/commit/d9817df83033018e259c8cfe6e7f6a6d14da7e99))
* **tui:** menu() =&gt; select() ([8670217](https://github.com/folke/zaly/commit/86702176c072655b2ebb9edb88e9f79eca378b01))
* **tui:** optimize imports ([982aa66](https://github.com/folke/zaly/commit/982aa66a68d726b2e709f94d67bbba10d81bb2d9))
* **tui:** ui.add(Node) -&gt; ui.add(() =&gt; Node) ([0fbe96e](https://github.com/folke/zaly/commit/0fbe96e8a47c8dd914c02a1963821c53c3612fc1))


### 🎨 Styles

* action descs ([4c635b2](https://github.com/folke/zaly/commit/4c635b22b5347f3a120368a533ef200d3c96f7b9))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
* **tui:** proper types for MenuItem ([fd08788](https://github.com/folke/zaly/commit/fd087888efa9cf1b6938f8e2af9d24b6832e9b87))


### 📦 Build

* **cli:** fix shebang in postinstall ([44fe3ab](https://github.com/folke/zaly/commit/44fe3ab300485c7315a35ae20b7f5f8df1c7eeb6))
* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* fixed trustedDependencies ([887a7d2](https://github.com/folke/zaly/commit/887a7d2bafe641b41e4102f8667689b77b7a79ef))
* optimized cli build ([86ad1da](https://github.com/folke/zaly/commit/86ad1da3fe5b864ac0992ea5e6d15a08425f2857))
* refactor some deeps ([d4854f5](https://github.com/folke/zaly/commit/d4854f55f95738976feb763454e7b33ae08c4cfc))
* **shared:** tsdown config ([ad27488](https://github.com/folke/zaly/commit/ad27488ec2ed8aedda0f599081c0c605ed31023d))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* **tsdown:** fix shebang only for zaly entry ([5036ac1](https://github.com/folke/zaly/commit/5036ac19ddf7be29469adb52aa48619c34d5799d))
* **tui:** export ansi ([a85e135](https://github.com/folke/zaly/commit/a85e13547725367c09377945f9b31611e350d4bc))
* **tui:** export logger|markdown ([90807cd](https://github.com/folke/zaly/commit/90807cd717fca85d1b2b9494eeb54e7cd25ab78d))
