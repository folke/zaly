# Changelog

## [0.0.2](https://github.com/folke/zaly/compare/agent-v0.0.1...agent-v0.0.2) (2026-06-17)


### 🚀 Enhancements

* **agent/context:** added AgentContext.useSession to properly swap sessions ([4e4881f](https://github.com/folke/zaly/commit/4e4881fec9c34b1c15cedf62b01700a3d27ac3ba))
* **agent/context:** make Session required on AgentContext ([3ec67a3](https://github.com/folke/zaly/commit/3ec67a3cf3dcc7d5f88ec9e2e1e9fcdca13ad96a))
* **agent/prompt:** add fd/fdfind/rg availability to the env prompt ([ea2e82d](https://github.com/folke/zaly/commit/ea2e82d4ad61e3817af30f34f6d3e4967f30adfe))
* **agent/session:** add session fs stats ([a0b26b1](https://github.com/folke/zaly/commit/a0b26b1ccc09a8d835d6b6cab0ad8bb75b642f02))
* **agent/sessions:** better session management ([bdc7096](https://github.com/folke/zaly/commit/bdc70961a4acf68a7fc45fcfe2607c654d491e24))
* **agent/session:** Session.checkout() to checkout a different head ([2ac2fd9](https://github.com/folke/zaly/commit/2ac2fd9c89ae6fac2f92fbe2f769fbd6e4c5aef4))
* **agent/session:** simplified session settings ([e8116e5](https://github.com/folke/zaly/commit/e8116e5cdfe792e5585eb9b7042f282b1437cfbf))
* **agent/skills:** prevent double activation of skills ([4d2effb](https://github.com/folke/zaly/commit/4d2effb007357c2b45da78482110cacfdc072863))
* **agent/tokens:** optimize token estimation ([abf1b5b](https://github.com/folke/zaly/commit/abf1b5b3c4f66369304d386710ea0d2df821a633))
* **agent/tools:** added proper truncate and used it for the bash tool ([f7a720b](https://github.com/folke/zaly/commit/f7a720b8e80b25a89888fc0bd51898fc0794f924))
* **agent/tools:** optimized grep/find output ([87b61a6](https://github.com/folke/zaly/commit/87b61a60008ff41ef42cbee24a5365eb077d9864))
* **agent:** add optional abort reason ([8f2a067](https://github.com/folke/zaly/commit/8f2a06720db1da90c6942044e1c19a263786edcd))
* **agent:** add optional timeout to waitIdle ([efd8967](https://github.com/folke/zaly/commit/efd896747f66bd6a7225e59abf0075da016deac1))
* **agent:** better Agent.send Api ([0ffcdfa](https://github.com/folke/zaly/commit/0ffcdfa1293f7f713538925bc0637377fde22ad8))
* **agent:** emit tool-calls ([e44a9bc](https://github.com/folke/zaly/commit/e44a9bcd4833f7d301dd46f50b46b580813ab5ca))
* **agent:** export prompt registry ([b02a490](https://github.com/folke/zaly/commit/b02a4906eb06cb7062a07b843b45ff0417cd4663))
* **agent:** expose active abort signal ([f0c6134](https://github.com/folke/zaly/commit/f0c6134567007caae1b2a8ca650eb736d814af45))
* **agent:** expose full TokenUsage ([f23afa4](https://github.com/folke/zaly/commit/f23afa4efad7206aaa50fad8528603931f04381c))
* **agent:** expose zalyPaths.state ([b70cf0e](https://github.com/folke/zaly/commit/b70cf0e1e4cd485bb1c5da211340574709221c25))
* **agent:** frecency based masking ([80867f8](https://github.com/folke/zaly/commit/80867f8590f9c2bc480f12123ac3749b9d70fa57))
* **agent:** grep/find tool ([7df18b6](https://github.com/folke/zaly/commit/7df18b62caca622bbd74c8301f3c6f09185890c4))
* **agent:** markdown prompt template commands ([16bbb67](https://github.com/folke/zaly/commit/16bbb67bc334e099ade52822e94ccc590b47162a))
* **agent:** more events and TokenUsage ([65b8807](https://github.com/folke/zaly/commit/65b88070de9b3199ead625c6029f50044ffbbaaf))
* **agent:** seed context usage from session messages ([0217d57](https://github.com/folke/zaly/commit/0217d57a10093b1a995e9d4950bea4bd492713a0))
* **agent:** simplifiy Agent.notify ([b668034](https://github.com/folke/zaly/commit/b6680344a2a85cdf03f345e4896d513eb46885b1))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **agent:** ToolCallPart.params is now the cleaned params, not fully coerced defaulted params ([54c2712](https://github.com/folke/zaly/commit/54c271249351e93aa393d166f83e14bf75c2a87c))
* **cli/session:** better session tree rendering ([fcbaa37](https://github.com/folke/zaly/commit/fcbaa372354914bd3b776ba4d8c30f832dfb3ab3))
* **cli:** added permission ask workflow ([be1afa2](https://github.com/folke/zaly/commit/be1afa2425424600a8272bd926db4763b4c3f126))
* **cli:** added session /new /resume ([41025d5](https://github.com/folke/zaly/commit/41025d51f771573cff989e471ac054c7b8ab3ac0))
* **cli:** automatically inject file references ([9c4f5da](https://github.com/folke/zaly/commit/9c4f5da640321d884eb584990434b1093d453cdf))
* **cli:** big actions refactor + added model/reasoning pickder ([612ba75](https://github.com/folke/zaly/commit/612ba7584b17a8737212899c3a4f33feda60d356))
* **cli:** debug sub command ([0579ffa](https://github.com/folke/zaly/commit/0579ffa2d88e4852641048de910e7c131045b6be))
* **cli:** frecency for file picker ([b91d67a](https://github.com/folke/zaly/commit/b91d67a46dcac5992604edcef30113b75b8c5898))
* **cli:** refactored injected toolUse ([5d389db](https://github.com/folke/zaly/commit/5d389db1d810d9e620e75d1743d6a58e59b0c959))
* **cli:** wire up cli flags with config ([52a9b5d](https://github.com/folke/zaly/commit/52a9b5d4ef817829dcc1de60dfb05d48afb07899))
* **dev:** added z exports ([d8491a9](https://github.com/folke/zaly/commit/d8491a9170f2c8cd141d80c7cb5df47e3a58fa9b))
* **logger:** wire up the logger in all the places ([72cc4e0](https://github.com/folke/zaly/commit/72cc4e0360d1c9353f25feb3230ae876b23310b8))
* **shared/emitter:** emit() is now fully async. Also added emitSerial() ([8d8d8d4](https://github.com/folke/zaly/commit/8d8d8d4de43fe71d18122e89d864a3b9f42d2258))
* **shared/find:** extract find() functionality to shared ([cfb7b97](https://github.com/folke/zaly/commit/cfb7b9708f404cafc1d13f156e62ee3b53f335af))
* **shared/glob:** optimized and improved glob ([846bf74](https://github.com/folke/zaly/commit/846bf7443a94eedc1ab14d9fa9c4e1617d628f73))
* **shared/paths:** move zalyPaths to shared and use XDG ([54145f0](https://github.com/folke/zaly/commit/54145f07f06538798ca85f452e65e419aa3be0c2))
* **shared:** proper leanient yaml parsing and frontmatter for skills ([14d8073](https://github.com/folke/zaly/commit/14d80735c9fa80d89811ef9007d238cc7d1e4596))


### 🩹 Fixes

* **agent/compaction:** auto run at 95% ([8e298cc](https://github.com/folke/zaly/commit/8e298ccb4c17036b176626e91bd97928a54a9bed))
* **agent/compaction:** extract tool results instead of calls for file usage ([51eb49f](https://github.com/folke/zaly/commit/51eb49f6d8bb535639125a862f2d66f4b69a5fad))
* **agent/compaction:** use masked messages for compaction ([70bfd5b](https://github.com/folke/zaly/commit/70bfd5b06df00a21f9efef13505347fa94a2bbb0))
* **agent/find:** improve the find tool ([04d39ee](https://github.com/folke/zaly/commit/04d39ee37d0eeebd69ee7d4c799826a82a957fcb))
* **agent/jsonl:** lock jsonl files when appending so that it's safe for concurrency ([5fd8485](https://github.com/folke/zaly/commit/5fd8485cb0e3266f80b6e088c5e4eaeeeab2ccfa))
* **agent/masker:** make the masker a little less agressive ([919c1f9](https://github.com/folke/zaly/commit/919c1f9a57c53727eceb65b603dbf2b30d3d3eed))
* **agent/permissions:** allow command subtitution for commands that are allowed ([58b0662](https://github.com/folke/zaly/commit/58b066254b1aa303f437e23d08e9b9ababd7b9d9))
* **agent/perms:** permission rules setup flaked on undefined ([934bae5](https://github.com/folke/zaly/commit/934bae5a5be9a21a73c01fd70149e69ea29b4a1b))
* **agent/prompt:** never include empty system prompt blocks ([70f0bf3](https://github.com/folke/zaly/commit/70f0bf34c57d3b4420e58d3318e538a3a56ec7aa))
* **agent/prompt:** use new project paths for markdown prompts ([afe7297](https://github.com/folke/zaly/commit/afe7297a2999bec3997a82e4e80c7344f1e9c73d))
* **agent/read:** read tool should check freshness taking masked results into account ([2215b38](https://github.com/folke/zaly/commit/2215b3852b9dbad0b7e706fc87b076d7030e6bb3))
* **agent/session:** preserve modelId when hydrating session messages ([57d497b](https://github.com/folke/zaly/commit/57d497ba853c4a1378aa5343a66182e40b79c232))
* **agent/session:** use defaults.sessionId ([0f6d05f](https://github.com/folke/zaly/commit/0f6d05f9584a8652acc019a7ebd97030d355b86b))
* **agent/skills:** honor precedence of skills with the same name ([121043b](https://github.com/folke/zaly/commit/121043b8075aa48d67b54f4d4d5ce7387ac0ef36))
* **agent/swarm:** load swarm async and only when needed ([6f70096](https://github.com/folke/zaly/commit/6f70096f09559e14d86277f8f3130cf37719e5e2))
* **agent/tools:** cwd for grep/find ([3443e24](https://github.com/folke/zaly/commit/3443e24debc50649f690f273920f25ebd12dc2fb))
* **agent/tools:** make all tool args with defaults optional ([8ef6b99](https://github.com/folke/zaly/commit/8ef6b993877c719eac3eb57f4ca5cd9cdb9522ca))
* **agent/truncate:** make agent truncate ansi aware ([2d64270](https://github.com/folke/zaly/commit/2d64270b733f0a28d63f46c52c7d2a3335fbe701))
* **agent/usage:** add usages from all messages when seeding TokenUsage ([5391d61](https://github.com/folke/zaly/commit/5391d6194250f46b6ca98c72b976e63d356ac0bc))
* **agent:** clear abortController when starting a new run() ([1c3a29d](https://github.com/folke/zaly/commit/1c3a29dafee49499eaf9ab9e906d6106081e0a3b))
* **agent:** load swarm after loading tools ([893f6bf](https://github.com/folke/zaly/commit/893f6bf6308fbd42f5808450f5b8d6c035948363))
* **agent:** log context overflow ([98dc32f](https://github.com/folke/zaly/commit/98dc32f5525ab6d2f95fc28cd8a064624d553c26))
* **cli/session:** session filter for cwd ([172d4cc](https://github.com/folke/zaly/commit/172d4ccf33797c56f6dd3cb6e53454c106e0bf61))
* **config/skills:** order resources from highest to lowest precedence ([9868127](https://github.com/folke/zaly/commit/9868127363454bc63c33ade5f1af98671cb749f5))
* **dev/exports:** better exports report + added --node ([775d526](https://github.com/folke/zaly/commit/775d526f00ad6962b0681f7153cc246dfa5c4c06))
* **shared/glob:** skip empty patterns (same as `**/*`) ([c19fb2d](https://github.com/folke/zaly/commit/c19fb2d54751e8120bc0204e1c1dbb6235bb8f81))


### 🔥 Performance

* **agent:** don't export PermissionManager class ([c2e4351](https://github.com/folke/zaly/commit/c2e43519fb657ab249c5fa1b86014095a670eb67))
* **ai:** remove provider from ai build ([a97c53b](https://github.com/folke/zaly/commit/a97c53bed08166a6b3dfc7c7e54ef3ae76075603))
* **cli:** lazy load agent ([540c73b](https://github.com/folke/zaly/commit/540c73b91d89db1a21777868814371d0526d9472))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))


### 💅 Refactors

* **agent/context:** tools() and prompt() are now async ([f89afe8](https://github.com/folke/zaly/commit/f89afe8254592c36b3fa610fdf0c936a3fd28d41))
* **agent/notify:** simplify notifier ([110c221](https://github.com/folke/zaly/commit/110c22109f277cbccd0017d298a6315d7e157a79))
* **agent/skills:** SkillOptions skills -&gt; paths ([763bc5a](https://github.com/folke/zaly/commit/763bc5a1d5d8c9928d7b3454f34e75d0d04c1bb5))
* **agent/tools:** better extractToolResults/extractToolCalls ([e27a0be](https://github.com/folke/zaly/commit/e27a0befdaa6cbf14a3136ca10539876beba2063))
* **agent/tools:** get rid of ToolInit ([29b5e9b](https://github.com/folke/zaly/commit/29b5e9b00899deebfaddc9cc173f51d106aab3b3))
* **agent|cli:** use LazyCache for Context & AgentContext ([ccddf7e](https://github.com/folke/zaly/commit/ccddf7ea7f762bbf84d7a4e8d993275d170bf85e))
* **agent:** added createAgent that lazy-loads agent deps when needed ([bc8a851](https://github.com/folke/zaly/commit/bc8a851eec719c1e9665ff82248f07bee86c601f))
* **agent:** cleanup compaction ([f4add22](https://github.com/folke/zaly/commit/f4add2293873593e0ec784fb0120fc6d87af771f))
* **agent:** get rid of findResource and refactor skills loading ([906d37d](https://github.com/folke/zaly/commit/906d37dba241739b4aed007a0e80e7d86ed3e765))
* **agent:** load.ts -&gt; context.ts ([945b88b](https://github.com/folke/zaly/commit/945b88b633869132452202ec41de6babd52929a2))
* **agent:** make model optional so that it can be loaded later with /model ([09dc125](https://github.com/folke/zaly/commit/09dc1256c559f23a7bcfb5489b6d48fce5ef9f4c))
* **agent:** move token estimator to debug ([d1f7f10](https://github.com/folke/zaly/commit/d1f7f10540960872304f6372e40d6f2168e37893))
* **agent:** simplify agent status/stop ([4a14a50](https://github.com/folke/zaly/commit/4a14a50f0d0fef013598ea27ef7b9daa4cf7b5fd))
* **ai:** added Tool.preflight for perm checks and extra validation ([daa21a6](https://github.com/folke/zaly/commit/daa21a66a4225e4f10fdba2e6cdb9015df828dc9))
* **ai:** big refactor around ModelSpec/ModelInfo/ProviderInfo types ([7c10df5](https://github.com/folke/zaly/commit/7c10df58d6a05ff6a24e729909dee3682d1fe736))
* **ai:** Tool.validator with lazy typebox imports ([4cfc71c](https://github.com/folke/zaly/commit/4cfc71c98bf0207afdc6e23fbc1675191b2335f1))
* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* **demo:** demos should import from the actual packages ([cb750ac](https://github.com/folke/zaly/commit/cb750ac07ee7871dac381e7f6013601a6a99e51f))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* **shared/glob:** move glob from agent/utils to shared/glob ([18ff32e](https://github.com/folke/zaly/commit/18ff32e6ad1eff4c8fb117f5aa223f902674e816))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))
* **tui/keys:** simplified action and key patterns ([17e3c68](https://github.com/folke/zaly/commit/17e3c68c870967edacf300354a613a5939c821d4))
* void thing.emit() ([b1415ed](https://github.com/folke/zaly/commit/b1415eda9811f726d684c91ba3decf9d8d5935ec))


### 🎨 Styles

* **agent/bash:** fix desc of bash tool ([9960eec](https://github.com/folke/zaly/commit/9960eecdcc0759342601c29cae93c2e115ed06ed))
* **agent/compaction:** extractToolResults ([5ce8476](https://github.com/folke/zaly/commit/5ce847657070a855d432dade8692b325f4a7bc93))
* bun z fmt ([ee44708](https://github.com/folke/zaly/commit/ee44708904936135e18ba0de55d4ac620296304c))
* fmt ([7843193](https://github.com/folke/zaly/commit/784319311f67f9730f5c844dda80e0a690afcf70))
* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* grep tool desc ([72d17a8](https://github.com/folke/zaly/commit/72d17a8fe45166c64ca3fdc85097b3513caa8105))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
* oxfmt ([811a4ce](https://github.com/folke/zaly/commit/811a4cec28f363883286870aad5bfbda15e85916))


### 📖 Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* update api docs ([dad44d0](https://github.com/folke/zaly/commit/dad44d0bf2a4730afad81e88165582d7f4060cd0))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))
* updated zaly prompt ([adc8f31](https://github.com/folke/zaly/commit/adc8f3119dad5d49019570a6701f651c05375b1d))


### ✅ Tests

* debug CI issue ([1abc4a0](https://github.com/folke/zaly/commit/1abc4a05caa9bf61e42cdd3b33c8a2d0b848dd46))
* fix all the tests ([495ed6f](https://github.com/folke/zaly/commit/495ed6f026b3e3643cead5f4ee93badd7325061e))
* fix perm tests ([0266874](https://github.com/folke/zaly/commit/02668741a5e8f860ff34878d41ad606703d9e48c))
* fix slow notify tests ([f8b4a68](https://github.com/folke/zaly/commit/f8b4a68cd71f5a40c67df20e258e2ce4fdfda293))
* fix tests ([4e7144e](https://github.com/folke/zaly/commit/4e7144e7b010510103945a1bc7003e4fddcab0f4))
* fix tests ([1a5903a](https://github.com/folke/zaly/commit/1a5903a21e24df805f70537a138d84b417ec78ee))
* fix tests ([7c15b20](https://github.com/folke/zaly/commit/7c15b208adf76cadc71eac0f0b048b1edc984265))
* fix tests ([402d880](https://github.com/folke/zaly/commit/402d8807459335f39994ea0a1ffe76d8708975e4))
* fixed token usage agent tests ([72196a5](https://github.com/folke/zaly/commit/72196a594f63fe806f17cbc0ab8df5c2d6d35288))


### 📦 Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* refactor some deeps ([d4854f5](https://github.com/folke/zaly/commit/d4854f55f95738976feb763454e7b33ae08c4cfc))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* updated api docs ([6b8f4f1](https://github.com/folke/zaly/commit/6b8f4f1c72f714bd451d2049ea90e8e86608ae7a))
