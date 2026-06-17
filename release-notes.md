:robot: I have created a release *beep* *boop*
---


<details><summary>agent: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/agent-v0.0.1...agent-v0.0.2) (2026-06-17)


### =€ Enhancements

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


### >y Fixes

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


### =% Performance

* **agent:** don't export PermissionManager class ([c2e4351](https://github.com/folke/zaly/commit/c2e43519fb657ab249c5fa1b86014095a670eb67))
* **ai:** remove provider from ai build ([a97c53b](https://github.com/folke/zaly/commit/a97c53bed08166a6b3dfc7c7e54ef3ae76075603))
* **cli:** lazy load agent ([540c73b](https://github.com/folke/zaly/commit/540c73b91d89db1a21777868814371d0526d9472))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))


### =… Refactors

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


### <¨ Styles

* **agent/bash:** fix desc of bash tool ([9960eec](https://github.com/folke/zaly/commit/9960eecdcc0759342601c29cae93c2e115ed06ed))
* **agent/compaction:** extractToolResults ([5ce8476](https://github.com/folke/zaly/commit/5ce847657070a855d432dade8692b325f4a7bc93))
* bun z fmt ([ee44708](https://github.com/folke/zaly/commit/ee44708904936135e18ba0de55d4ac620296304c))
* fmt ([7843193](https://github.com/folke/zaly/commit/784319311f67f9730f5c844dda80e0a690afcf70))
* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* grep tool desc ([72d17a8](https://github.com/folke/zaly/commit/72d17a8fe45166c64ca3fdc85097b3513caa8105))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
* oxfmt ([811a4ce](https://github.com/folke/zaly/commit/811a4cec28f363883286870aad5bfbda15e85916))


### =Ö Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* update api docs ([dad44d0](https://github.com/folke/zaly/commit/dad44d0bf2a4730afad81e88165582d7f4060cd0))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))
* updated zaly prompt ([adc8f31](https://github.com/folke/zaly/commit/adc8f3119dad5d49019570a6701f651c05375b1d))


###  Tests

* debug CI issue ([1abc4a0](https://github.com/folke/zaly/commit/1abc4a05caa9bf61e42cdd3b33c8a2d0b848dd46))
* fix all the tests ([495ed6f](https://github.com/folke/zaly/commit/495ed6f026b3e3643cead5f4ee93badd7325061e))
* fix perm tests ([0266874](https://github.com/folke/zaly/commit/02668741a5e8f860ff34878d41ad606703d9e48c))
* fix slow notify tests ([f8b4a68](https://github.com/folke/zaly/commit/f8b4a68cd71f5a40c67df20e258e2ce4fdfda293))
* fix tests ([4e7144e](https://github.com/folke/zaly/commit/4e7144e7b010510103945a1bc7003e4fddcab0f4))
* fix tests ([1a5903a](https://github.com/folke/zaly/commit/1a5903a21e24df805f70537a138d84b417ec78ee))
* fix tests ([7c15b20](https://github.com/folke/zaly/commit/7c15b208adf76cadc71eac0f0b048b1edc984265))
* fix tests ([402d880](https://github.com/folke/zaly/commit/402d8807459335f39994ea0a1ffe76d8708975e4))
* fixed token usage agent tests ([72196a5](https://github.com/folke/zaly/commit/72196a594f63fe806f17cbc0ab8df5c2d6d35288))


### =æ Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* refactor some deeps ([d4854f5](https://github.com/folke/zaly/commit/d4854f55f95738976feb763454e7b33ae08c4cfc))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* updated api docs ([6b8f4f1](https://github.com/folke/zaly/commit/6b8f4f1c72f714bd451d2049ea90e8e86608ae7a))
</details>

<details><summary>ai: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/ai-v0.0.1...ai-v0.0.2) (2026-06-17)


### =€ Enhancements

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


### >y Fixes

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


### =% Performance

* **ai:** remove provider from ai build ([a97c53b](https://github.com/folke/zaly/commit/a97c53bed08166a6b3dfc7c7e54ef3ae76075603))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))


### =… Refactors

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


### <¨ Styles

* fmt ([7843193](https://github.com/folke/zaly/commit/784319311f67f9730f5c844dda80e0a690afcf70))
* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))


### =Ö Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))


###  Tests

* fix tests ([4e7144e](https://github.com/folke/zaly/commit/4e7144e7b010510103945a1bc7003e4fddcab0f4))
* fix tests ([1a5903a](https://github.com/folke/zaly/commit/1a5903a21e24df805f70537a138d84b417ec78ee))


### =æ Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* models.dev ([9ccf902](https://github.com/folke/zaly/commit/9ccf902781802dadd927d0f1e1708401d3a73f36))
* optimized ai build ([b539b31](https://github.com/folke/zaly/commit/b539b31b21d7e3667824999cebeb44a1021ba47c))
* refactor some deeps ([d4854f5](https://github.com/folke/zaly/commit/d4854f55f95738976feb763454e7b33ae08c4cfc))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* updated api docs ([6b8f4f1](https://github.com/folke/zaly/commit/6b8f4f1c72f714bd451d2049ea90e8e86608ae7a))
</details>

<details><summary>cli: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/cli-v0.0.1...cli-v0.0.2) (2026-06-17)


### =€ Enhancements

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


### >y Fixes

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


### =% Performance

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


### =… Refactors

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


### <¨ Styles

* action descs ([4c635b2](https://github.com/folke/zaly/commit/4c635b22b5347f3a120368a533ef200d3c96f7b9))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
* **tui:** proper types for MenuItem ([fd08788](https://github.com/folke/zaly/commit/fd087888efa9cf1b6938f8e2af9d24b6832e9b87))


### =æ Build

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
</details>

<details><summary>config: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/config-v0.0.1...config-v0.0.2) (2026-06-17)


### =€ Enhancements

* added @zaly/config ([e136e4c](https://github.com/folke/zaly/commit/e136e4c44e7a89478a3da6db01b9ba0510998725))
* **agent:** grep/find tool ([7df18b6](https://github.com/folke/zaly/commit/7df18b62caca622bbd74c8301f3c6f09185890c4))
* **ai:** added secrets AuthProvider ([145a243](https://github.com/folke/zaly/commit/145a243ca1cdd87095a1d6450fb9f8d2e893cd82))
* **cli:** better zaly models ([cafcc1f](https://github.com/folke/zaly/commit/cafcc1f7f64812d92703ba15449002e224ed58b2))
* **cli:** big actions refactor + added model/reasoning pickder ([612ba75](https://github.com/folke/zaly/commit/612ba7584b17a8737212899c3a4f33feda60d356))
* **cli:** wire up cli flags with config ([52a9b5d](https://github.com/folke/zaly/commit/52a9b5d4ef817829dcc1de60dfb05d48afb07899))
* **config/state:** state for transient settings ([e0c7d73](https://github.com/folke/zaly/commit/e0c7d7309f1e70ae8ca436e31d200b746782432d))
* **config:** added permissions to settings ([2ff04cd](https://github.com/folke/zaly/commit/2ff04cd3b8a15fbcacb27f45635a365f228ebbfc))
* **config:** env var json reviver and show missing env vars with --print-config ([66d4447](https://github.com/folke/zaly/commit/66d444705afb329db84aa614aa0ac36da3d3a914))
* **tui/input:** added input history ([57c8029](https://github.com/folke/zaly/commit/57c8029ce838c01288bfdc80c7fd3621f27016ce))


### >y Fixes

* **cli:** session settings resolution ([75897db](https://github.com/folke/zaly/commit/75897dbc1864c2024166433a275d32bc9a453d4b))
* **config/skills:** order resources from highest to lowest precedence ([9868127](https://github.com/folke/zaly/commit/9868127363454bc63c33ade5f1af98671cb749f5))
* **config/state:** double file name ([ff28bd3](https://github.com/folke/zaly/commit/ff28bd36536633727f7eae9850a69841c4bd7fcc))
* **config:** default tools ([3d4df46](https://github.com/folke/zaly/commit/3d4df466ff7fe2c2c848e674a27f348a980ef346))


### =… Refactors

* cleanup ([60b96a8](https://github.com/folke/zaly/commit/60b96a8593462fd194ddddb5328642ab63f35152))
* **config:** Config.resources and can be false to skip ([845af72](https://github.com/folke/zaly/commit/845af720ceab0c742b838a5891bd855ae7ae7326))
* **config:** mergeSettings -&gt; utils.ts: merge() ([0762441](https://github.com/folke/zaly/commit/0762441b5641f5e08f83a31c1414d60456e95a4c))
* **config:** prompts -&gt; commands ([4b75716](https://github.com/folke/zaly/commit/4b75716f4f536092f465ffbbd9f3ef941c482112))
* **tui/keys:** simplified action and key patterns ([17e3c68](https://github.com/folke/zaly/commit/17e3c68c870967edacf300354a613a5939c821d4))


### <¨ Styles

* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
</details>

<details><summary>plugin: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/plugin-v0.0.1...plugin-v0.0.2) (2026-06-17)


### =€ Enhancements

* **agent:** better Agent.send Api ([0ffcdfa](https://github.com/folke/zaly/commit/0ffcdfa1293f7f713538925bc0637377fde22ad8))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **ai:** simplify model loading API ([a063088](https://github.com/folke/zaly/commit/a063088e348d657f8564095b0f8a0e0c11d407c1))
* **cli:** added --help for slash commands + skills + template commands ([e6c0f37](https://github.com/folke/zaly/commit/e6c0f375f4b5d63442eb498c089dbfca9967f693))
* **cli:** plugin support!! ([df85809](https://github.com/folke/zaly/commit/df858094a18a2d7c3e20d4946b7f0a31195c65ff))
* **plugins:** plugin API. WIP ([2c11d64](https://github.com/folke/zaly/commit/2c11d64652294282360a68cfe5a8fceb9aeb6fc3))
* **plugins:** simple context debug plugin ([c6df060](https://github.com/folke/zaly/commit/c6df06012d722948d99788f0537fd4469ff117d7))


### >y Fixes

* **plugin/agent:** registerTool just takes Tool def ([e733ec4](https://github.com/folke/zaly/commit/e733ec45845543f000148a952062b197f71da381))
* **plugin/ui:** allow registering multiple actions at the same time ([d25b142](https://github.com/folke/zaly/commit/d25b14299a42b64557c7735e2791f6300676519d))
* **plugins:** better notif for ollama & lm-studio when not running ([0371c4b](https://github.com/folke/zaly/commit/0371c4be95fb06d7a4bfc742af5913a07a6eee25))
* **plugins:** proper error notif when a plugin fails loading ([9e0f8c3](https://github.com/folke/zaly/commit/9e0f8c38b2911975d6270b276a8ea17d273e6bdc))
* **plugins:** track emitter errors for plugins ([9cc30ac](https://github.com/folke/zaly/commit/9cc30ac3f645d81ecca0580ca2e5dc3c753c98ce))
* **tui/autocomplete:** menu select vs complete ([c70ad2f](https://github.com/folke/zaly/commit/c70ad2f122a314823d35994519fc5bca090b49a4))


### =… Refactors

* ActionInfo =&gt; ActionDef ([aeec920](https://github.com/folke/zaly/commit/aeec92050b505eb08bd43de96fb1dea8b834e690))
* **ai:** big refactor around ModelSpec/ModelInfo/ProviderInfo types ([7c10df5](https://github.com/folke/zaly/commit/7c10df58d6a05ff6a24e729909dee3682d1fe736))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* split up widgets/services exports in tui ([84d81ad](https://github.com/folke/zaly/commit/84d81ad31e6fe2072782e990e6f35c5e0ce16153))
* **tui/picker:** refactored shared code between picking from a tree / select ([8c117fc](https://github.com/folke/zaly/commit/8c117fc4a116bd42129269d0c8b5723029f5371d))
* **tui:** menu() =&gt; select() ([8670217](https://github.com/folke/zaly/commit/86702176c072655b2ebb9edb88e9f79eca378b01))


### <¨ Styles

* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
</details>

<details><summary>shared: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/shared-v0.0.1...shared-v0.0.2) (2026-06-17)


### =€ Enhancements

* **agent/tools:** added proper truncate and used it for the bash tool ([f7a720b](https://github.com/folke/zaly/commit/f7a720b8e80b25a89888fc0bd51898fc0794f924))
* **agent:** markdown prompt template commands ([16bbb67](https://github.com/folke/zaly/commit/16bbb67bc334e099ade52822e94ccc590b47162a))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **cli/app:** split agent loading from model loading to give plugins a chance to register models before loading ([a796f14](https://github.com/folke/zaly/commit/a796f147b734df5075b11c63e57fc2592a11a853))
* **cli:** added --help for slash commands + skills + template commands ([e6c0f37](https://github.com/folke/zaly/commit/e6c0f375f4b5d63442eb498c089dbfca9967f693))
* **cli:** added !bash commands to composer ([31c5378](https://github.com/folke/zaly/commit/31c53786d584591220b1c1c234aa0b7f7e5ce8ae))
* **cli:** better zaly models ([cafcc1f](https://github.com/folke/zaly/commit/cafcc1f7f64812d92703ba15449002e224ed58b2))
* **cli:** plugin support!! ([df85809](https://github.com/folke/zaly/commit/df858094a18a2d7c3e20d4946b7f0a31195c65ff))
* **config:** env var json reviver and show missing env vars with --print-config ([66d4447](https://github.com/folke/zaly/commit/66d444705afb329db84aa614aa0ac36da3d3a914))
* **dev:** added update commmand ([b4252bf](https://github.com/folke/zaly/commit/b4252bfc966f50245e4ae9d4174b3daa7e2bae68))
* **dev:** added z exports ([d8491a9](https://github.com/folke/zaly/commit/d8491a9170f2c8cd141d80c7cb5df47e3a58fa9b))
* **logger:** wire up the logger in all the places ([72cc4e0](https://github.com/folke/zaly/commit/72cc4e0360d1c9353f25feb3230ae876b23310b8))
* **shared/emitter:** add abort support ([52834bb](https://github.com/folke/zaly/commit/52834bb7fa0f4cd061c15f1bfce988e4a42e0556))
* **shared/emitter:** added Emitter.clear() ([907f63c](https://github.com/folke/zaly/commit/907f63c68015ad93960d0cbd3394788d3eb8cd4b))
* **shared/emitter:** allow passing an abort signal to automatically unsubscribe listeners ([fff8b85](https://github.com/folke/zaly/commit/fff8b85a2287aaa32cb8ebd700f139e229967fa1))
* **shared/emitter:** emit() is now fully async. Also added emitSerial() ([8d8d8d4](https://github.com/folke/zaly/commit/8d8d8d4de43fe71d18122e89d864a3b9f42d2258))
* **shared/env:** added isBun ([1629897](https://github.com/folke/zaly/commit/16298978e54f5046624be05d2dfe24e100e88c1c))
* **shared/find:** extract find() functionality to shared ([cfb7b97](https://github.com/folke/zaly/commit/cfb7b9708f404cafc1d13f156e62ee3b53f335af))
* **shared/format:** better relative time ([6dbf159](https://github.com/folke/zaly/commit/6dbf159d11dbd7e16bfd17407597a098c787414c))
* **shared/glob:** optimized and improved glob ([846bf74](https://github.com/folke/zaly/commit/846bf7443a94eedc1ab14d9fa9c4e1617d628f73))
* **shared/json:** atomic/locked json file updates ([106e1c9](https://github.com/folke/zaly/commit/106e1c9bba4966af04db8c99083327848b6a8c1e))
* **shared/json:** return updated data for writeJson ([6c6ebab](https://github.com/folke/zaly/commit/6c6ebabe1786168a2214f5a35eb6506fa7d2c1b5))
* **shared/path:** better path pretty print ([bc3c840](https://github.com/folke/zaly/commit/bc3c8408bde5cb483c2607095cc9bad636c8a362))
* **shared/paths:** move zalyPaths to shared and use XDG ([54145f0](https://github.com/folke/zaly/commit/54145f07f06538798ca85f452e65e419aa3be0c2))
* **shared/paths:** projectPaths ([18afef7](https://github.com/folke/zaly/commit/18afef7576c1b469bbe9429b1f69d1a7e8558c93))
* **shared/registry:** replace old entry on dispose ([6a34ae3](https://github.com/folke/zaly/commit/6a34ae3e80490097f5464b8d8dff2c4d23ac0c76))
* **shared/utils:** added atomicWriteFile() ([295345c](https://github.com/folke/zaly/commit/295345c792bba4ed8dc8a2d7cc891e7fb3879e5d))
* **shared/utils:** better findUp ([937de00](https://github.com/folke/zaly/commit/937de001a8dfe1e84879bbea6364c4b5ac22aea7))
* **shared/utils:** findUp can now check multiple names at once ([2f2339e](https://github.com/folke/zaly/commit/2f2339e2f294a37e59ab0d239cdd80c54e2d35f2))
* **shared/utils:** withLock ([df63b10](https://github.com/folke/zaly/commit/df63b10137ba4032ffbe2ee06fdfee191807c190))
* **shared/utils:** wrapError() ([db44219](https://github.com/folke/zaly/commit/db4421968e353abcc9a76dd4542956cc71cc7b1b))
* **shared:** added lazy cache impl ([ff9b885](https://github.com/folke/zaly/commit/ff9b885e2563d266cdb1af1e366f19494bf6a761))
* **shared:** added minheap and topk ([a10d618](https://github.com/folke/zaly/commit/a10d6180a1322c63bba19d144cbf5f5875f64553))
* **shared:** added Registry.fork() ([7072828](https://github.com/folke/zaly/commit/707282896c101cecf31632c1720fbe1fa43f9cce))
* **shared:** args parsing and shell split ([ef73840](https://github.com/folke/zaly/commit/ef738402cc093db1b4a8744f3021a4d14af5715e))
* **shared:** collection ([27432d7](https://github.com/folke/zaly/commit/27432d7ef2f82a06e8132e2feed63095211a34b9))
* **shared:** proper leanient yaml parsing and frontmatter for skills ([14d8073](https://github.com/folke/zaly/commit/14d80735c9fa80d89811ef9007d238cc7d1e4596))
* **tui/reactive:** phase 1 of detaching reactive owner from Node ([8c92a2f](https://github.com/folke/zaly/commit/8c92a2f0494e214de51d6b04156259abfb923ccb))
* **tui/renderer:** setup the renderer rootOwner and use that for all widgets' parent owner ([14b39d1](https://github.com/folke/zaly/commit/14b39d17ff230c8e7b68d37047dfd5b161113312))


### >y Fixes

* **cli:** session settings resolution ([75897db](https://github.com/folke/zaly/commit/75897dbc1864c2024166433a275d32bc9a453d4b))
* **shared/glob:** skip empty patterns (same as `**/*`) ([c19fb2d](https://github.com/folke/zaly/commit/c19fb2d54751e8120bc0204e1c1dbb6235bb8f81))
* **shared/registry:** export Registry type ([09c1537](https://github.com/folke/zaly/commit/09c15378ce0b1dcaecd0f64a81dfd39d9bdb2ef0))
* **shared/registry:** return keys() in insertion order ([8541128](https://github.com/folke/zaly/commit/8541128e932ac66087bd161ab9b143c48104299f))
* **shared/utils:** allow passing spaces to safeStringify ([069ad5a](https://github.com/folke/zaly/commit/069ad5afc3751a96b65487a985965636e3fc9a8c))
* **shared/utils:** dropped safeAsyncFn in favor of safeFn that now also handles promises ([ccfc70c](https://github.com/folke/zaly/commit/ccfc70cc91a29df326c8f9a744d37e3ee5d7f023))


### =% Performance

* **agent:** don't export PermissionManager class ([c2e4351](https://github.com/folke/zaly/commit/c2e43519fb657ab249c5fa1b86014095a670eb67))
* **shared/ansi:** much faster splitAnsi ([ba48356](https://github.com/folke/zaly/commit/ba483562be3f41acb616b04cd0969285555172fd))
* **shared/glob:** optimized glob and find ([c9f623d](https://github.com/folke/zaly/commit/c9f623d513af1e625aecd2faf716ca1f4cca9aa6))
* **shared/system:** cache which() by default ([ad28c77](https://github.com/folke/zaly/commit/ad28c7730701a07068a9c9d14064a0339fb8b2fa))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))
* **tui/stream:** throttle scroll events ([11790d0](https://github.com/folke/zaly/commit/11790d033f97c39c9ea4d91e1a4f6db9f14b01cd))


### =… Refactors

* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* cleanup ([60b96a8](https://github.com/folke/zaly/commit/60b96a8593462fd194ddddb5328642ab63f35152))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* **shared/glob:** move glob from agent/utils to shared/glob ([18ff32e](https://github.com/folke/zaly/commit/18ff32e6ad1eff4c8fb117f5aa223f902674e816))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))
* **shared:** move logger to shared and split logging from reporting ([f7bf75e](https://github.com/folke/zaly/commit/f7bf75e4dafd9c1c6e401ed1c053cf647963308e))
* **tui/picker:** refactor/cleanup select/picker/autocomplete/tree ([aadcc2d](https://github.com/folke/zaly/commit/aadcc2de3967a4be8b6f33e02e7477baf5c09f2d))


### <¨ Styles

* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))


### =Ö Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))


###  Tests

* fix all the tests ([495ed6f](https://github.com/folke/zaly/commit/495ed6f026b3e3643cead5f4ee93badd7325061e))
* fix tests ([402d880](https://github.com/folke/zaly/commit/402d8807459335f39994ea0a1ffe76d8708975e4))
* fixed image test ([2edd64e](https://github.com/folke/zaly/commit/2edd64ebc0acaf524b973dea844577888d4c257c))
* **shared/emitter:** added more emitter tests ([f3e3fc6](https://github.com/folke/zaly/commit/f3e3fc6292a8254bfbce550ea80eaf3d922a37f1))


### =æ Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* fixed trustedDependencies ([887a7d2](https://github.com/folke/zaly/commit/887a7d2bafe641b41e4102f8667689b77b7a79ef))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* **shared:** move image-data to dev deps ([a10d6f8](https://github.com/folke/zaly/commit/a10d6f8c66bf4fb6fd0821ef501a2d643fa79262))
* **shared:** tsdown config ([ad27488](https://github.com/folke/zaly/commit/ad27488ec2ed8aedda0f599081c0c605ed31023d))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
</details>

<details><summary>tui: 0.0.2</summary>

## [0.0.2](https://github.com/folke/zaly/compare/tui-v0.0.1...tui-v0.0.2) (2026-06-17)


### =€ Enhancements

* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **cli:** added --help for slash commands + skills + template commands ([e6c0f37](https://github.com/folke/zaly/commit/e6c0f375f4b5d63442eb498c089dbfca9967f693))
* **cli:** added !bash commands to composer ([31c5378](https://github.com/folke/zaly/commit/31c53786d584591220b1c1c234aa0b7f7e5ce8ae))
* **cli:** added /theme ([49c2baf](https://github.com/folke/zaly/commit/49c2bafcb1c62fa5dd37ecbee38f3a972e53e8ce))
* **cli:** added input history picker ([351bc90](https://github.com/folke/zaly/commit/351bc90566af585af63b3458d68c17720100e834))
* **cli:** added scroll to top/bottom ([fc7ef24](https://github.com/folke/zaly/commit/fc7ef24e04a54fcc6808b0bd81be1414e15eeb5a))
* **cli:** better zaly models cli sub-command ([5614502](https://github.com/folke/zaly/commit/5614502aae265867c48db988ade52ac53568d9b5))
* **cli:** composer plugins refactor ([d7becd7](https://github.com/folke/zaly/commit/d7becd78085478cd174eee423177131a99d14b04))
* **cli:** move autocomplete in an overlay ([38b2044](https://github.com/folke/zaly/commit/38b20447470bddeb5f7ba63819052b2e479e11d0))
* **cli:** scrolling indicator in statusline ([71066a3](https://github.com/folke/zaly/commit/71066a3500748f79d4bed6e1b23b3dca3cbcac59))
* **cli:** show permission ask details ([a623c3b](https://github.com/folke/zaly/commit/a623c3b50326634c6436fb015458b70871c8e926))
* **cli:** wire up cli flags with config ([52a9b5d](https://github.com/folke/zaly/commit/52a9b5d4ef817829dcc1de60dfb05d48afb07899))
* **dev:** added build:* to z build ([ec41286](https://github.com/folke/zaly/commit/ec412866985ffd1c44cd5261b51f24e0c2da8198))
* **dev:** added import benching ([a66f32e](https://github.com/folke/zaly/commit/a66f32ea6eb48dc9d99425aa750de2189e33637b))
* **dev:** added typia schema gen to build ([b1f5dfc](https://github.com/folke/zaly/commit/b1f5dfca2d180e26d9435e27ce490fc944371f57))
* **dev:** added z exports ([d8491a9](https://github.com/folke/zaly/commit/d8491a9170f2c8cd141d80c7cb5df47e3a58fa9b))
* **logger:** wire up the logger in all the places ([72cc4e0](https://github.com/folke/zaly/commit/72cc4e0360d1c9353f25feb3230ae876b23310b8))
* **tui/autocomplete:** let autocomplete grow/shrink when needed ([3420a79](https://github.com/folke/zaly/commit/3420a79b909de805cadf4d8d4d06005b126346d0))
* **tui/box:** implemented height + verticalAlign ([62e31c7](https://github.com/folke/zaly/commit/62e31c7b99c4401a49654e287c9b71c09150716c))
* **tui/builder:** added support for a StyleBuilder with all styling disabled ([7158ab6](https://github.com/folke/zaly/commit/7158ab6f0922e6e37c14cb05a7a88881e91a80c0))
* **tui/core:** added createRender to resolve all asyncs before rendering ([2c9cbf3](https://github.com/folke/zaly/commit/2c9cbf3d4947550394f10cea58defdf6b255b549))
* **tui/input:** added input history ([57c8029](https://github.com/folke/zaly/commit/57c8029ce838c01288bfdc80c7fd3621f27016ce))
* **tui/input:** atomic delete for attachment markers and custom formatters ([4dc0275](https://github.com/folke/zaly/commit/4dc0275509f3c76ad7420eb293b38c573beb42f1))
* **tui/input:** optional validate before submit ([3da8510](https://github.com/folke/zaly/commit/3da85103c479b549165ce59050364a24469c5eda))
* **tui/inspect:** inspect() using zaly themes ([11f84e9](https://github.com/folke/zaly/commit/11f84e91f27046ca090fff5787f8252a5f6186aa))
* **tui/logger:** allow wrapping logger nodes before adding to the stream ([1ba4a0c](https://github.com/folke/zaly/commit/1ba4a0c861b6d9a3d0699b2c17e153e06369f543))
* **tui/markdown:** added support for progressive streaming updates to markdown code blocks (shiki) ([e6d2a52](https://github.com/folke/zaly/commit/e6d2a5270eb567bdad05716128f2d56ad1f32405))
* **tui/markdown:** async rendering for markdown ([048266b](https://github.com/folke/zaly/commit/048266bb60c82905b7aa819164f4d1b00f45d892))
* **tui/menu:** page up/down for menu ([9ffc8c2](https://github.com/folke/zaly/commit/9ffc8c27482b043a96f3e15681dc1bb07f7aeb8e))
* **tui/node:** emit show/hide events ([ce12a99](https://github.com/folke/zaly/commit/ce12a99f33704b2e61dd0d5ad123990c3751912b))
* **tui/node:** execute node actions directly ([8e98bf8](https://github.com/folke/zaly/commit/8e98bf8a92c6986855c052dac271c2978bdaaa5d))
* **tui/node:** extend events/actions of a Node instance ([186fb3f](https://github.com/folke/zaly/commit/186fb3f1d4cc2148c335ee228816d9cf5be95a51))
* **tui/node:** Node.state now uses a createStore for reactivity ([bc6b637](https://github.com/folke/zaly/commit/bc6b6373f0734e9f1280b86f5447f8336226136a))
* **tui/notifier:** stacked notifications ([2072fc0](https://github.com/folke/zaly/commit/2072fc0abc1e4ad9529002ce58baa43887e3c37b))
* **tui/overlay:** added relative positioning to screen/ui/stream ([58257f3](https://github.com/folke/zaly/commit/58257f3145b413ec16b0914de630a5988afdf9a5))
* **tui/overlay:** simplify overlay management ([9356f77](https://github.com/folke/zaly/commit/9356f772c0dbf7d06489f3473abe9754dae584cf))
* **tui/picker|menu:** added support for non-filtering picker and match prev/next ([ef0162e](https://github.com/folke/zaly/commit/ef0162eba0e041f19236aaf5aad601d152d8d4f5))
* **tui/picker:** go to matching line when not filtering ([ce13803](https://github.com/folke/zaly/commit/ce138036aa17138101f4217210e616fc8b460d94))
* **tui/reactive:** added createRef and Node.ref() ([dca7ab9](https://github.com/folke/zaly/commit/dca7ab99370dde2b25a91d6ee92f26c102f650c2))
* **tui/reactive:** added createStore ([2525a9a](https://github.com/folke/zaly/commit/2525a9a47793101a8a715129f68659d9517ff6de))
* **tui/reactive:** added lazy() ([57180c7](https://github.com/folke/zaly/commit/57180c7a345de4c2957c6154383bdb3f26e459f1))
* **tui/reactive:** createContext overloads ([529ae16](https://github.com/folke/zaly/commit/529ae1690607c2c5c6de80ab5c17af078004bde4))
* **tui/reactive:** createProgressive now returns an overloaded Progressive&lt;T&gt; object ([d181293](https://github.com/folke/zaly/commit/d181293c1230aafb0758311e6acb44089ed7a795))
* **tui/reactive:** createProgressive/createIterable ([4b41e1f](https://github.com/folke/zaly/commit/4b41e1ffacbe540c9a3eabcf8fda3b800be4eb59))
* **tui/reactive:** phase 1 of detaching reactive owner from Node ([8c92a2f](https://github.com/folke/zaly/commit/8c92a2f0494e214de51d6b04156259abfb923ccb))
* **tui/reactive:** properly working createAsync ([c55821d](https://github.com/folke/zaly/commit/c55821d9bb69d8238ebd595d57c07e7f18dc5c35))
* **tui/renderer:** debug mode ([cea4dbe](https://github.com/folke/zaly/commit/cea4dbe92a6dc8213458fbc397807378a80937e6))
* **tui/renderer:** optional mouse and altScreen support ([6c623d4](https://github.com/folke/zaly/commit/6c623d41e6c4ca4633792c5a9c5fbb91082960ae))
* **tui/renderer:** propagate Node emitter listener errors to the stream ([a16c39b](https://github.com/folke/zaly/commit/a16c39bf9b9eee4bcaee329fbf5146234dc4e84f))
* **tui/renderer:** render surfaces now accept ()-&gt;Node, which runs the fn inside a new root context ([8cdab82](https://github.com/folke/zaly/commit/8cdab82f632c97a6660626f1237193bdc11067aa))
* **tui/renderer:** rendering stats ([483ab04](https://github.com/folke/zaly/commit/483ab040129fa49a6e8cc1bf2be3abb984fe815c))
* **tui/renderer:** setup the renderer rootOwner and use that for all widgets' parent owner ([14b39d1](https://github.com/folke/zaly/commit/14b39d17ff230c8e7b68d37047dfd5b161113312))
* **tui/search:** better sort field spec ([ae23150](https://github.com/folke/zaly/commit/ae231501a2cffd3545c1671da7bcdcf9d17744a6))
* **tui/search:** fzf like search/matcher/scores ([b224c87](https://github.com/folke/zaly/commit/b224c87461efddea46a99810891e3f09b81cecb8))
* **tui/select:** reverse select ([f68b562](https://github.com/folke/zaly/commit/f68b56273ce31c382ae864bd991eede543966077))
* **tui/shiki:** added shiki.createLoader ([33f7df6](https://github.com/folke/zaly/commit/33f7df61a603170494ee034afa433b8092ee918a))
* **tui/shiki:** shiki refactor + progressive markdown code block highlighting ([d5be284](https://github.com/folke/zaly/commit/d5be2843127279b19c72ffb0e4cfaa07d03d6ebf))
* **tui/show:** better show(): branches/gates/fallbacks and lazy node creation ([ea6760a](https://github.com/folke/zaly/commit/ea6760a405c2ed6d8725f40fba5bfee41b59069a))
* **tui/spinner:** make spinner color reactive ([d1e58dc](https://github.com/folke/zaly/commit/d1e58dc47221b43a3432192747d1e6a502b76969))
* **tui/spinner:** optional idle char (instead of space) ([6ad5aa6](https://github.com/folke/zaly/commit/6ad5aa690909c613cd5f5b1178b807cd9bbfcc14))
* **tui/stream:** added sticky option for nodes to remain at the bottom of the stream ([b9d1133](https://github.com/folke/zaly/commit/b9d1133c18cd3fc4ac1a5233fdab3376d4c7eb59))
* **tui/stream:** added Stream.reset() to clear the streaming area ([1cb95b3](https://github.com/folke/zaly/commit/1cb95b3cc5f7e0ded4e63491614ab6cff7fe1889))
* **tui/stream:** make scrolling return a promise that resolves when the scroll anim is done ([40bcb6e](https://github.com/folke/zaly/commit/40bcb6e85058025165c0e73b90fcfef4835f9e7b))
* **tui/stream:** re-use createRender for sync rendering in stream ([f4df885](https://github.com/folke/zaly/commit/f4df8850b00517d483afb040f3264f5ed9c6fc7b))
* **tui/stream:** scrolling now uses CSI scroll sequences ([3848873](https://github.com/folke/zaly/commit/3848873881fea10c52c51bfa71be20ab0781dfa0))
* **tui/stream:** separate viewport from scrollback queue. Realtime rendering now ([49a6a44](https://github.com/folke/zaly/commit/49a6a44b9c87231660174df2a05f3a5953b9bce8))
* **tui/stream:** simplify stream rendering ([f30defe](https://github.com/folke/zaly/commit/f30defebb6f4624f2213667bdbc344aa143655d2))
* **tui/stream:** virtual stream scrolling ([9190f1e](https://github.com/folke/zaly/commit/9190f1ec22c0544c5f8a6baa5d8c2fae7d69c21d))
* **tui/terminal:** terminal progress support (ghossty and others) ([a0680f1](https://github.com/folke/zaly/commit/a0680f1331f56b1d4c37cc43c0162968703777c4))
* **tui/themes:** added syntax theme slots ([eba0845](https://github.com/folke/zaly/commit/eba0845377a7d48efb92e63268ed368b74017a13))
* **tui/tree:** select active tree node ([9a83c3e](https://github.com/folke/zaly/commit/9a83c3ef3ca796afb63d6abe7c2ea02872340e4e))
* **tui:** added divider() ([be1364a](https://github.com/folke/zaly/commit/be1364aa59f5e44ac3bb1932b6f67f2c88770561))
* **tui:** added log notify style that shows a notification ([e581fb2](https://github.com/folke/zaly/commit/e581fb2219e32481fcba73427fa99a5e7f4b0e95))
* **tui:** added tree() ([4d5dece](https://github.com/folke/zaly/commit/4d5dece599ccb1bbf2e34fde2917dbb0aa711d0b))
* **tui:** get rid of the live nodes concept. No longer needed. Nodes are live as long as they are not in scrollback. then they get dropped ([6ef75fd](https://github.com/folke/zaly/commit/6ef75fd3eae5dd1328fada8274d1e9be4b1449a0))
* **tui:** hide input cursor when losing terminal focus ([9543f7e](https://github.com/folke/zaly/commit/9543f7e004f2da8b87437facafb3e54cbd2705f3))
* **tui:** improved and simplified paste and attachments ([96df15a](https://github.com/folke/zaly/commit/96df15a7a92a97eb4f5a3269f4918f1f5f3635a7))
* **tui:** picker ([77ab49c](https://github.com/folke/zaly/commit/77ab49c50f87d69eab8f53c365ec916aff1ed3ca))
* **tui:** picker ([32f2cf6](https://github.com/folke/zaly/commit/32f2cf6862f221e05e683968678aa88995d4e764))
* **tui:** picker/notifier service ([0661686](https://github.com/folke/zaly/commit/0661686d6f46691998759092972cea77711ae27b))
* **tui:** progressive item search for huge items lists ([855a574](https://github.com/folke/zaly/commit/855a574627ab068ab745277c60eac73b091261dc))
* **tui:** refactored key bindings / actions (simplified) ([de28902](https://github.com/folke/zaly/commit/de2890219d260b09034b3284a633c361a62733f9))
* **tui:** shiki worker threads ([75d106c](https://github.com/folke/zaly/commit/75d106c6faa7612b087f6fb2a01d3249082a2135))


### >y Fixes

* **agent/read:** read tool should check freshness taking masked results into account ([2215b38](https://github.com/folke/zaly/commit/2215b3852b9dbad0b7e706fc87b076d7030e6bb3))
* **cli/replay:** bump repllay overlay to last 8 messages ([974c01d](https://github.com/folke/zaly/commit/974c01dfe8fd697052f36daaabc6afbc5dee14ce))
* **dev/exports:** better exports report + added --node ([775d526](https://github.com/folke/zaly/commit/775d526f00ad6962b0681f7153cc246dfa5c4c06))
* **markdown:** prevent flickering when streaming markdown ([343a43d](https://github.com/folke/zaly/commit/343a43d7c06ab7dc7919c77ba7cf8a7c5244ffde))
* **plugins:** better notif for ollama & lm-studio when not running ([0371c4b](https://github.com/folke/zaly/commit/0371c4be95fb06d7a4bfc742af5913a07a6eee25))
* **plugins:** proper error notif when a plugin fails loading ([9e0f8c3](https://github.com/folke/zaly/commit/9e0f8c38b2911975d6270b276a8ea17d273e6bdc))
* **reactive:** allow setting reactive store values to undefined ([e127005](https://github.com/folke/zaly/commit/e127005036effd11b479cbacc4601353e9916f7c))
* **shared/registry:** export Registry type ([09c1537](https://github.com/folke/zaly/commit/09c15378ce0b1dcaecd0f64a81dfd39d9bdb2ef0))
* **tui/actions:** action dispatch should check node is visible including parents ([7aee24a](https://github.com/folke/zaly/commit/7aee24a8a75ec7eed1c671bf621f963f90e5de3a))
* **tui/autocomplete:** hide select explicitely ([01edb60](https://github.com/folke/zaly/commit/01edb60baafd7660fa286cd68ee9c5120bb71a08))
* **tui/autocomplete:** menu select vs complete ([c70ad2f](https://github.com/folke/zaly/commit/c70ad2f122a314823d35994519fc5bca090b49a4))
* **tui/box:** resolveWidth with width:fit ([f6727e7](https://github.com/folke/zaly/commit/f6727e789df1a4ba8cd22bde745b0bb4bc6f9c26))
* **tui/box:** skip visible:false nodes from layout calculations ([17b3412](https://github.com/folke/zaly/commit/17b34120ba0c611f7e28839649fcc9d2452fcd48))
* **tui/completion:** only show actions with a cmd ([31773cc](https://github.com/folke/zaly/commit/31773ccd9679f3df391af70482086a340b5ad1c8))
* **tui/completion:** refresh files picker every 10s on re-open ([61d7fc9](https://github.com/folke/zaly/commit/61d7fc947a29cfbb0370388aead5c431eee10b62))
* **tui/diff:** allow setting FlexState ([20b3632](https://github.com/folke/zaly/commit/20b3632a916956b6cc438890a98d1e0d4e0d1876))
* **tui/diff:** default width:fit for diffs ([cd98847](https://github.com/folke/zaly/commit/cd988470ba19ec2400b3b5a8d90284e67730e001))
* **tui/diff:** forward shiki theme ([f91cd66](https://github.com/folke/zaly/commit/f91cd66b08c3dd16c7ced86b6bcf938aa6513ef7))
* **tui/divider:** use divider for divider style ([0e2e167](https://github.com/folke/zaly/commit/0e2e167bcdf4ef3e13ce32b2e3276fda3e21b611))
* **tui/input:** fixed virtual cursor rendering and vertical movement ([66c17ad](https://github.com/folke/zaly/commit/66c17ad25f7aba142bb1714a4341d6b6d5148b02))
* **tui/input:** soft-wrapping ([a3f1461](https://github.com/folke/zaly/commit/a3f146197546e7f6a3f32458485335c70528cd5a))
* **tui/input:** use quiet style for placeholder ([fca92d1](https://github.com/folke/zaly/commit/fca92d1612fa4f117939a5c4165be97de224d8e4))
* **tui/input:** word-wrap ([0a89d51](https://github.com/folke/zaly/commit/0a89d51802f222ddac8fd09e5f841a325b96791a))
* **tui/kitty:** bump/delete kitty image placements for virtual rows (scroll) ([48d1a19](https://github.com/folke/zaly/commit/48d1a19ff383bff0dff1e63d5d97c87021c706b9))
* **tui/log:** content can now be reactive ([e534b22](https://github.com/folke/zaly/commit/e534b22d07962f500a89895b1532b5d108d33ae0))
* **tui/log:** flex shrink log prefix ([66bb4cd](https://github.com/folke/zaly/commit/66bb4cd53acb99551e2309bfcf02530dedc2e055))
* **tui/logger:** await markdown renderer for log entries ([7f292bb](https://github.com/folke/zaly/commit/7f292bbd8966c9d6ecfada203e0e10dbd0adc549))
* **tui/logger:** dont render as markdown when log text contains ansi ([a40ecd5](https://github.com/folke/zaly/commit/a40ecd578ddd9c888fe4779cac3060f2549c65f0))
* **tui/markdown:** move shrink work-around for markdown, since stream handles that now for all Nodes ([7f19d46](https://github.com/folke/zaly/commit/7f19d4614dce6368f68549b2ceeabe865fd2fa52))
* **tui/markdown:** normalizeEol for markdown ([ec998aa](https://github.com/folke/zaly/commit/ec998aa55333d6ee4c194e0ceb0108b03fb0da6a))
* **tui/markdown:** trim leading blank lines ([0f79c98](https://github.com/folke/zaly/commit/0f79c98a7ac9b278251438b6c2b8f02707e2e457))
* **tui/markdown:** wrap with indent and wrapped lines bg ([10aeaa4](https://github.com/folke/zaly/commit/10aeaa419f70084ca92a051e992df073925915a3))
* **tui/menu:** trim label whitespace for default menu item renderer ([af74d02](https://github.com/folke/zaly/commit/af74d0209fe22216ea6cf1b9a04250c08523e33c))
* **tui/node:** Node.ref can now reference sub-classes ([135cd79](https://github.com/folke/zaly/commit/135cd79b6e29fa0c22d15ea0d9ac8cc8ca429b6e))
* **tui/overlay:** always render overlays when an overlay is open ([102cb52](https://github.com/folke/zaly/commit/102cb5258f5c3a9a5690b226d24b1fe907794eff))
* **tui/picker:** close previous picker and diable automcplete when picking ([a194fcb](https://github.com/folke/zaly/commit/a194fcb67ce406b75ca5046b6d9fed023b3a797d))
* **tui/reactive:** use set(() -&gt; fn()) in effect to properly update the signal ([cd39216](https://github.com/folke/zaly/commit/cd392165411c5d77c35aae6222235a2a6dfca88d))
* **tui/renderer:** stop render loop on error and propagate error to main loop ([89bf91d](https://github.com/folke/zaly/commit/89bf91d6cd0d5ff49f12e9cc5c4ab8daabe55bf6))
* **tui/renderer:** untrack render scheduling to prevent reactive dep leakage ([55d3cc3](https://github.com/folke/zaly/commit/55d3cc36bfa0fd8957bc8b50be206a14b2915dbe))
* **tui/renderer:** wire dirt events accross surfaces ([bd804ac](https://github.com/folke/zaly/commit/bd804ac26e5fd4c31b895e96204087be8ddcb08e))
* **tui/search:** child matchers should check parent tick ([f79238f](https://github.com/folke/zaly/commit/f79238f97b9098e254269727454f9fe5128018f7))
* **tui/select:** rename Theme.menu* to Theme.option* ([39667f5](https://github.com/folke/zaly/commit/39667f58cca906399455b655a63f882086df836c))
* **tui/shiki:** return undefined on Shiki.createLoader without any langs ([9a81c0b](https://github.com/folke/zaly/commit/9a81c0b0c312a0eec563dbda44c280a7b2653ab8))
* **tui/shiki:** unref shiki worker ([d85d22a](https://github.com/folke/zaly/commit/d85d22a1a9bacf92c421ae5b940b8761cffa7dfb))
* **tui/spinner:** cleanup timer ([22beab8](https://github.com/folke/zaly/commit/22beab8c3d4d8c8d7d098f0268b985c57c8acd82))
* **tui/stream:** don't drain render live nodes ([030aaba](https://github.com/folke/zaly/commit/030aaba45f9ccc43816062c9a0d8aeb0d1ad8fab))
* **tui/stream:** dont optimize clearing stale rows when commitCount &gt; 0 ([8cc186a](https://github.com/folke/zaly/commit/8cc186a2dbae1622dc135f1c76de2ab2c7c470a2))
* **tui/stream:** drain async at least once if there were any active asyncs at the render cycle start ([5228400](https://github.com/folke/zaly/commit/5228400489e2e4cf0e4a581617a7ee4a2618adaa))
* **tui/stream:** track commit count per render state instead of globally ([0dc2749](https://github.com/folke/zaly/commit/0dc2749bf5907eadae8f8d073ca179cda2a5b3bb))
* **tui/terminal:** add exception/rejection handler ([3bbfd08](https://github.com/folke/zaly/commit/3bbfd08a31c7f6636e769d2f3dc9e60c79f9ea78))
* **tui/terminal:** write crashes directly to stdout ([fc785a2](https://github.com/folke/zaly/commit/fc785a2ce14b458935de83094268ffeb10e4e5e2))
* **tui/text:** expandTabs() ([7048ef5](https://github.com/folke/zaly/commit/7048ef54452768226c01ec9a15ea28660d2b1350))
* **tui/themes:** allow overriding default theme ([193974d](https://github.com/folke/zaly/commit/193974df42a384ebf50f948c0194d71edc0d2af7))
* **tui/themes:** make md headings for shiki themes always bold ([7dccdce](https://github.com/folke/zaly/commit/7dccdce2cfee4fd54a0853ab83e8db8ac65281b2))
* **tui/worker:** fixed compat for bun/web/node workers ([9326e36](https://github.com/folke/zaly/commit/9326e365016b6e423b8f61e7e51b08a0a7d25bff))
* **tui:** get rid of uiMaxHeight ([6ba2826](https://github.com/folke/zaly/commit/6ba28268ec1fb4561376496ba774b4cfb42d9620))
* **tui:** prevent render re-entry ([f6ad59f](https://github.com/folke/zaly/commit/f6ad59feb403514524f4546ce0ebc448394961b4))
* **tui:** trim break-space on wrapped lines (not the first) in formatText ([67f14d7](https://github.com/folke/zaly/commit/67f14d7b1b4e8e3c7d8d1bd4a1d8000250725e0c))


### =% Performance

* **agent:** don't export PermissionManager class ([c2e4351](https://github.com/folke/zaly/commit/c2e43519fb657ab249c5fa1b86014095a670eb67))
* **shared/glob:** optimized glob and find ([c9f623d](https://github.com/folke/zaly/commit/c9f623d513af1e625aecd2faf716ca1f4cca9aa6))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))
* **shiki:** don't lock up the main loop when a bunch of shiki workers resolve ([60aaea1](https://github.com/folke/zaly/commit/60aaea1feab0523ebdf600422f7e44c09b72e891))
* **tui/code:** no need to spllit code lines with splitAnsi ([beb6ee6](https://github.com/folke/zaly/commit/beb6ee6026edf4af166ef4d033ea1b08766945b5))
* **tui/frame:** trimEnd for writing terminal lines ([06f4fce](https://github.com/folke/zaly/commit/06f4fce929a970f544bb7e4dc09d1d9f70a2f1e1))
* **tui/input:** input formatters will now progressively render (shiki loading etc) ([4d7a6c1](https://github.com/folke/zaly/commit/4d7a6c169f311e658d18b31760df7556ca35642f))
* **tui/spinner:** global spinner and manage from reactive context, not render ([ac4b170](https://github.com/folke/zaly/commit/ac4b170289d5479ef44e45c1f65f8684e962acd6))
* **tui/stream:** don't rebuild history to get proper history slices ([5cd8d74](https://github.com/folke/zaly/commit/5cd8d740385776b91105f3ae90981b973c3d0d88))
* **tui/stream:** never await async rendering in the stream render ([415f2b8](https://github.com/folke/zaly/commit/415f2b8dab6d2887817c3a4955e894150f48d553))
* **tui/stream:** only clear kitty placements when needed ([7ae0e24](https://github.com/folke/zaly/commit/7ae0e24d0b396d2c927ce15b165f88b42c490edb))
* **tui/stream:** throttle scroll events ([11790d0](https://github.com/folke/zaly/commit/11790d033f97c39c9ea4d91e1a4f6db9f14b01cd))
* **tui/themes:** fast path for default theme ([08b4c16](https://github.com/folke/zaly/commit/08b4c16172dc0dc48c172784691a66bc86a7e0bd))
* **tui:** export tui/themes ([705ea45](https://github.com/folke/zaly/commit/705ea4597f04fd95fb540e666eadc3a91cd7b67a))
* **tui:** make exported createCtx async ([333e9c5](https://github.com/folke/zaly/commit/333e9c522cf651306eaa94f0a40f51c0faecafe5))
* **tui:** optimized progressive shiki highlighting ([0a33da6](https://github.com/folke/zaly/commit/0a33da67bf866cc534973189189a8c94829c6525))
* **tui:** restructured markdown imports ([1b893e0](https://github.com/folke/zaly/commit/1b893e0a058c438f666a22b09bb3ba45c172b46b))


### =… Refactors

* ActionInfo =&gt; ActionDef ([aeec920](https://github.com/folke/zaly/commit/aeec92050b505eb08bd43de96fb1dea8b834e690))
* **ai:** added Tool.preflight for perm checks and extra validation ([daa21a6](https://github.com/folke/zaly/commit/daa21a66a4225e4f10fdba2e6cdb9015df828dc9))
* **all:** Node.setState() -&gt; Node.state.set() ([ac18f63](https://github.com/folke/zaly/commit/ac18f6316d8379c50af5784260f7bd2532450c1c))
* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* **autocomplete:** simplify input bind ([3515790](https://github.com/folke/zaly/commit/3515790b6cb3f08c807943c12d233a067339c527))
* **demo:** demos should import from the actual packages ([cb750ac](https://github.com/folke/zaly/commit/cb750ac07ee7871dac381e7f6013601a6a99e51f))
* more refactoring ([ced76fb](https://github.com/folke/zaly/commit/ced76fbc349571561fa6732e2e2dc9af5bfcaa68))
* render diffing ([dcfae28](https://github.com/folke/zaly/commit/dcfae287cdbeef93e7bf5ca854a67dae5e42bc89))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))
* **shared:** move logger to shared and split logging from reporting ([f7bf75e](https://github.com/folke/zaly/commit/f7bf75e4dafd9c1c6e401ed1c053cf647963308e))
* split up widgets/services exports in tui ([84d81ad](https://github.com/folke/zaly/commit/84d81ad31e6fe2072782e990e6f35c5e0ce16153))
* **tui/actions:** ActionInfo.name -&gt; ActionInfo.cmd ([7034b9a](https://github.com/folke/zaly/commit/7034b9a64ab1e300777e5c2aaf6b6c9a99f70a28))
* **tui/actions:** move default actions to defaults.ts ([72aabe5](https://github.com/folke/zaly/commit/72aabe57cfb65c2aab7f514b29c1c8da3aff7dac))
* **tui/autocomplete:** use menu.bind ([99cc2a4](https://github.com/folke/zaly/commit/99cc2a4742427383f2da22c38a09c9ea4ba37c4a))
* **tui/input:** use fornatText instead of a Text node for input text ([6d2d210](https://github.com/folke/zaly/commit/6d2d21040de23eeaaa9482c96bc1439ff3c4f525))
* **tui/inspect:** split in inspectFormat & inspect ([781e5eb](https://github.com/folke/zaly/commit/781e5eb6cfbf7f25ed89fe183eba658c1284fc8f))
* **tui/keys:** simplified action and key patterns ([17e3c68](https://github.com/folke/zaly/commit/17e3c68c870967edacf300354a613a5939c821d4))
* **tui/logger:** move logger install to base class ([e22411e](https://github.com/folke/zaly/commit/e22411e12347082a096f5f1ed896c565f30d1f2d))
* **tui/markdown:** added MarkdownRenderer as single entry point for markdown rendering ([47ac028](https://github.com/folke/zaly/commit/47ac028115c50f7efaac1bfaadb9729cd7580f99))
* **tui/overlay:** overlay.add(Node) =&gt; overlay.add(() =&gt; Node) ([fb30fa5](https://github.com/folke/zaly/commit/fb30fa54c946b8f523e30a183dedac3c5349dcea))
* **tui/picker:** refactor/cleanup select/picker/autocomplete/tree ([aadcc2d](https://github.com/folke/zaly/commit/aadcc2de3967a4be8b6f33e02e7477baf5c09f2d))
* **tui/picker:** refactored shared code between picking from a tree / select ([8c117fc](https://github.com/folke/zaly/commit/8c117fc4a116bd42129269d0c8b5723029f5371d))
* **tui/reactive:** useContext / provideContext ([0cf7ed7](https://github.com/folke/zaly/commit/0cf7ed76ea9420f9a33450c38f3572d9659e8d71))
* **tui/renderer:** do render diffing in one pass at the root render ([39744e1](https://github.com/folke/zaly/commit/39744e1557cc63bd311d30d583a242855e156c2b))
* **tui/renderer:** made createRenderer async ([37ad5e3](https://github.com/folke/zaly/commit/37ad5e385bb2947c22e54afa30e4d0caf58d2444))
* **tui/select:** get rid of Option.value in favor of Option.text ([0164575](https://github.com/folke/zaly/commit/016457509bd472eb532858cf38c3de5478082026))
* **tui/stream:** cleanup dead code ([3226654](https://github.com/folke/zaly/commit/3226654e944a29cfcc35edac6aab37615eacf38a))
* **tui/stream:** simplify history slicing ([474079d](https://github.com/folke/zaly/commit/474079d3a36f0b21d79ebca13a6827770d9f25a6))
* **tui/stream:** split up _render() ([2164677](https://github.com/folke/zaly/commit/2164677a655c57b3db468f9f44edaae3e1d459ca))
* **tui/stream:** Stream.append(Node) =&gt; Stream.append(() =&gt; Node) ([699cf59](https://github.com/folke/zaly/commit/699cf59b7a4e11492d84c9edfb19ce7caa1ed0a7))
* **tui/widget:** simplify widget types ([a42ed32](https://github.com/folke/zaly/commit/a42ed32c2dfe5e9c782323f3c54b6146d2795ba9))
* **tui:** autocomplete now uses Ref&lt;Input&gt; ([d9817df](https://github.com/folke/zaly/commit/d9817df83033018e259c8cfe6e7f6a6d14da7e99))
* **tui:** logger/logger.ts -&gt; services/logger.ts ([f1aad5a](https://github.com/folke/zaly/commit/f1aad5a1a17a0f994262e0320c5d1e5276aa971a))
* **tui:** menu() =&gt; select() ([8670217](https://github.com/folke/zaly/commit/86702176c072655b2ebb9edb88e9f79eca378b01))
* **tui:** optimize imports ([982aa66](https://github.com/folke/zaly/commit/982aa66a68d726b2e709f94d67bbba10d81bb2d9))
* **tui:** refactor renderer surfaces and only render a surface when it's actually dirty ([6d4039e](https://github.com/folke/zaly/commit/6d4039ea1cf900d7a0376fa156b85fb3735104dc))
* **tui:** remove some things from the public API ([2d78de3](https://github.com/folke/zaly/commit/2d78de379ee3c91e0ea7eba37cd5f95977e1e747))
* **tui:** ui.add(Node) -&gt; ui.add(() =&gt; Node) ([0fbe96e](https://github.com/folke/zaly/commit/0fbe96e8a47c8dd914c02a1963821c53c3612fc1))
* void thing.emit() ([b1415ed](https://github.com/folke/zaly/commit/b1415eda9811f726d684c91ba3decf9d8d5935ec))


### <¨ Styles

* bun z fmt ([ee44708](https://github.com/folke/zaly/commit/ee44708904936135e18ba0de55d4ac620296304c))
* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
* oxfmt ([811a4ce](https://github.com/folke/zaly/commit/811a4cec28f363883286870aad5bfbda15e85916))
* renamed ActionMap =&gt; NodeActionMap ([21b3378](https://github.com/folke/zaly/commit/21b337849b5cc66cecba8bf59def2001dc1fbc2b))
* **tui:** proper types for MenuItem ([fd08788](https://github.com/folke/zaly/commit/fd087888efa9cf1b6938f8e2af9d24b6832e9b87))


### =Ö Documentation

* api ([295c206](https://github.com/folke/zaly/commit/295c206657b71f50f7c4b70a0fd9d46ff26f2b10))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* **tui:** gen api exports ([72ab0a6](https://github.com/folke/zaly/commit/72ab0a6cf5bc65873acf67f520701069c5466a82))
* update api docs ([dad44d0](https://github.com/folke/zaly/commit/dad44d0bf2a4730afad81e88165582d7f4060cd0))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))


###  Tests

* fix all the tests ([790220c](https://github.com/folke/zaly/commit/790220c9b1c66e419f0b269c697d59d5e360c543))
* fix all the tests ([e565b6a](https://github.com/folke/zaly/commit/e565b6ad0a4ba3de06e106f6fc0d3e983c0468b5))
* fix tests ([65ccbcf](https://github.com/folke/zaly/commit/65ccbcf9f7291faecd62ffc79503371b5726c63c))
* fix tests ([d385175](https://github.com/folke/zaly/commit/d385175a06d0508b7fc00f79485f7a4d4ac64544))
* fix tests ([1a5903a](https://github.com/folke/zaly/commit/1a5903a21e24df805f70537a138d84b417ec78ee))
* fix tests ([9378205](https://github.com/folke/zaly/commit/9378205a3da50482b3e62bf15ded4c5b332eb002))
* fix tests ([8399a78](https://github.com/folke/zaly/commit/8399a78512cb7b4da436763180f6c9d8229b34d4))
* remove incorrect test ([c70bf72](https://github.com/folke/zaly/commit/c70bf724e74d120c3505865fd9db8ed3ddaab007))
* **tui:** fix tests ([880b912](https://github.com/folke/zaly/commit/880b912a1dfefa2b9e9fc342a18abb3e720aa99e))


### =æ Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* fixed trustedDependencies ([887a7d2](https://github.com/folke/zaly/commit/887a7d2bafe641b41e4102f8667689b77b7a79ef))
* fixed tui imports and vitest config ([137b6c8](https://github.com/folke/zaly/commit/137b6c829ad446c4530bd7eef1126194cf204cb1))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* optimize tui build ([5ab871a](https://github.com/folke/zaly/commit/5ab871a914f69ba863cf46fa989d698933c7a0c4))
* skip tokyonight build on CI ([ea7248f](https://github.com/folke/zaly/commit/ea7248f7042e7eb48f924e763514ed1741179a38))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
* **tui:** export ansi ([a85e135](https://github.com/folke/zaly/commit/a85e13547725367c09377945f9b31611e350d4bc))
* **tui:** export logger|markdown ([90807cd](https://github.com/folke/zaly/commit/90807cd717fca85d1b2b9494eeb54e7cd25ab78d))
* **tui:** moved sharp to optional dependencies ([e06f3c1](https://github.com/folke/zaly/commit/e06f3c1590f2a9cb8ed37e4256f5416fb4b6697a))
* updated api docs ([6b8f4f1](https://github.com/folke/zaly/commit/6b8f4f1c72f714bd451d2049ea90e8e86608ae7a))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).