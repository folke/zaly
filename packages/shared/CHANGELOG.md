# Changelog

## [0.0.4](https://github.com/folke/zaly/compare/shared-v0.0.3...shared-v0.0.4) (2026-07-10)


### 📦 Build

* Node 22.11 compat ([e69afd8](https://github.com/folke/zaly/commit/e69afd83a4719117ebd5e7a2a104d7503f53a18b))

## [0.0.3](https://github.com/folke/zaly/compare/shared-v0.0.2...shared-v0.0.3) (2026-07-10)


### 🚀 Enhancements

* **ai/models:** model/provider overrides rework + hook up with config ([9ea2ae4](https://github.com/folke/zaly/commit/9ea2ae4069925bc3b22586f2dabf1ae3d1c6c831))
* **ai:** big rework of oauth/authentication/model catalog ([a4b8cbc](https://github.com/folke/zaly/commit/a4b8cbc35158237e3a3e32ad0c583bb2d6b4b2e1))
* **cli:** added `/session` with session info ([8189809](https://github.com/folke/zaly/commit/81898097cd2e729f78dfe3cb1c06143c0d67e7fc))
* **cli:** more lenient error handling in config files ([47cea3c](https://github.com/folke/zaly/commit/47cea3c2317eab04ea608cb822b9ab2d7b277816))
* **shared/args:** added support for positional args ([f700065](https://github.com/folke/zaly/commit/f700065284d98e8c6eb8750cfdee1a88e55164aa))
* **shared/args:** added support for required options ([a84c7a3](https://github.com/folke/zaly/commit/a84c7a3504fffc52e2a756d8648457f8f16bbdb0))
* **shared/glob:** added globber runtime ([ab4a3bf](https://github.com/folke/zaly/commit/ab4a3bf390abfeae9a749ff04acf8b8a998587cf))
* **shared/json:** added JsonFile to easily manage json files (config/state/etc) ([00649a8](https://github.com/folke/zaly/commit/00649a8eced29074182124a1957ae0d12db97085))
* **shared/paths:** env paths for projects ([ed1cd71](https://github.com/folke/zaly/commit/ed1cd718d2ddccdb4b39c802313973f0858b1b23))
* **shared/process:** proper support for executing bash commands with bash path resolving ([1e6c002](https://github.com/folke/zaly/commit/1e6c002f0948df470ee03a9336f995256bcbc5c1))
* **shared/process:** spawnCmd ([648783f](https://github.com/folke/zaly/commit/648783fc61026e33f9d93ea0c96365fb266cfa76))
* **shared/prop:** added propSet/propGet to set/get object values based on a key path ([4bc09b4](https://github.com/folke/zaly/commit/4bc09b4a180173e519561bd01671ed61a0db7eb5))
* **shared/template:** added opts.helpers ([91eb019](https://github.com/folke/zaly/commit/91eb0190ccf4814a382a205a0cf9bbb0496a142a))
* **shared/template:** custom formatters, compiled expressions, white space control, env(), $(), json() ([c47ac62](https://github.com/folke/zaly/commit/c47ac6216dabb1428581f7cc6ec8d4ebc7ee547a))
* **shared/types:** moved DeepPartial/Simplify to shared/types ([7e9317c](https://github.com/folke/zaly/commit/7e9317cd8021f40ade0f508f9b7b1263e37b574e))
* **shared/utils:** MaybeGetter and toValue ([b991ec3](https://github.com/folke/zaly/commit/b991ec3aa2ab2fc86c97cc8ab1c8577e97e8f855))
* **shared:** added `template.ts` for template interpolation with js expressions ([5765fee](https://github.com/folke/zaly/commit/5765feed68aaf9be158a8f9aed33bc7f13221fb5))
* **tui/process:** allow disabling stdout/stderr (fix for wl-copy) ([0109f2b](https://github.com/folke/zaly/commit/0109f2bd9deeb1a8da9c37afa9dc66b899854ade))
* **tui/prompt:** generic prompt service that integrates with the composer ([189e125](https://github.com/folke/zaly/commit/189e125388bedae2d549c8c0d8b2a503e9039b00))


### 🩹 Fixes

* **shared/ansi:** handle KGP diacritic clusters for Bun in sliceAnsi and stringWidth + replace by space in stripAnsi ([74bf8a3](https://github.com/folke/zaly/commit/74bf8a3df7136dcfb3afe390a759461d5d465b8e))
* **shared/images:** sharp types ([68387b0](https://github.com/folke/zaly/commit/68387b0a5eb82dbcc7d12914e6c008a54436538b))
* **shared/types:** dont expand strings in Simplify ([ece712f](https://github.com/folke/zaly/commit/ece712fd2c436a2546407858f60209cc5d15eacb))
* **shared/utils:** fixed clamp() with optional max ([06b2d79](https://github.com/folke/zaly/commit/06b2d79eecbbd34e1099594dc3da702806837750))


### 🎨 Styles

* oxfmt ([52369c7](https://github.com/folke/zaly/commit/52369c7d22a000c16fb4953a9c4744c55b34652d))
* oxfmt ([be0afec](https://github.com/folke/zaly/commit/be0afecf4459405fdef168c3f72d322c74fe5c48))
* **shared/glob:** doc strings for glob options ([b76bfa0](https://github.com/folke/zaly/commit/b76bfa0684aa42f56c2529654986dbf4932be8bb))


### 📖 Documentation

* basic docs before publishing v0 ([c9c4fc3](https://github.com/folke/zaly/commit/c9c4fc34e1bddae7432abec7fcc7bf1336b27999))


### ✅ Tests

* fix spawnCmd tests ([a497173](https://github.com/folke/zaly/commit/a49717389fc4ca58b2225d759405a148b482cf00))
* **shared:** more tests ([cc53a54](https://github.com/folke/zaly/commit/cc53a543e424f8d30d158aea5955fc3dc408602d))
* **shared:** more tests for shared ([2005574](https://github.com/folke/zaly/commit/200557469e3a1de1034776430c6433ae0d2f5709))
* **tui:** more tui tests ([69c3d53](https://github.com/folke/zaly/commit/69c3d531a5e6ee29c4b35c1824a798c669b1c8ef))


### 📦 Build

* fix build ([995e599](https://github.com/folke/zaly/commit/995e599eb4a46f3a55ece54dd0ea1f8e256f29cd))
* update package.json files and add homepage/bugs/repository.directory ([81576dd](https://github.com/folke/zaly/commit/81576ddca3fbf8bdc4044f4a1f1b29445b524e4d))

## [0.0.2](https://github.com/folke/zaly/compare/shared-v0.0.1...shared-v0.0.2) (2026-06-17)


### 🚀 Enhancements

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


### 🩹 Fixes

* **cli:** session settings resolution ([75897db](https://github.com/folke/zaly/commit/75897dbc1864c2024166433a275d32bc9a453d4b))
* **shared/glob:** skip empty patterns (same as `**/*`) ([c19fb2d](https://github.com/folke/zaly/commit/c19fb2d54751e8120bc0204e1c1dbb6235bb8f81))
* **shared/registry:** export Registry type ([09c1537](https://github.com/folke/zaly/commit/09c15378ce0b1dcaecd0f64a81dfd39d9bdb2ef0))
* **shared/registry:** return keys() in insertion order ([8541128](https://github.com/folke/zaly/commit/8541128e932ac66087bd161ab9b143c48104299f))
* **shared/utils:** allow passing spaces to safeStringify ([069ad5a](https://github.com/folke/zaly/commit/069ad5afc3751a96b65487a985965636e3fc9a8c))
* **shared/utils:** dropped safeAsyncFn in favor of safeFn that now also handles promises ([ccfc70c](https://github.com/folke/zaly/commit/ccfc70cc91a29df326c8f9a744d37e3ee5d7f023))


### 🔥 Performance

* **agent:** don't export PermissionManager class ([c2e4351](https://github.com/folke/zaly/commit/c2e43519fb657ab249c5fa1b86014095a670eb67))
* **shared/ansi:** much faster splitAnsi ([ba48356](https://github.com/folke/zaly/commit/ba483562be3f41acb616b04cd0969285555172fd))
* **shared/glob:** optimized glob and find ([c9f623d](https://github.com/folke/zaly/commit/c9f623d513af1e625aecd2faf716ca1f4cca9aa6))
* **shared/system:** cache which() by default ([ad28c77](https://github.com/folke/zaly/commit/ad28c7730701a07068a9c9d14064a0339fb8b2fa))
* **shared:** image/detect exports ([caa81db](https://github.com/folke/zaly/commit/caa81dbe9ce0e202a34435cbe59826b3733ff5d0))
* **shared:** lazy load image-data ([8102e02](https://github.com/folke/zaly/commit/8102e02193d90a9104150803a2651c99f9188ab9))
* **shared:** use shared/registry directly ([7e92c6f](https://github.com/folke/zaly/commit/7e92c6f09fe726b36920cecaa1129cb9e5417dd1))
* **tui/stream:** throttle scroll events ([11790d0](https://github.com/folke/zaly/commit/11790d033f97c39c9ea4d91e1a4f6db9f14b01cd))


### 💅 Refactors

* **ansi:** move ansi primitives to shared ([a403442](https://github.com/folke/zaly/commit/a403442aa93f616cbc6ba742ada2dfbb710f26c4))
* cleanup ([60b96a8](https://github.com/folke/zaly/commit/60b96a8593462fd194ddddb5328642ab63f35152))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* **shared/glob:** move glob from agent/utils to shared/glob ([18ff32e](https://github.com/folke/zaly/commit/18ff32e6ad1eff4c8fb117f5aa223f902674e816))
* **shared/registry:** refactored registry ([3da5d3f](https://github.com/folke/zaly/commit/3da5d3f5e5296c42f9e6908ca29a427f534b92d1))
* **shared:** move logger to shared and split logging from reporting ([f7bf75e](https://github.com/folke/zaly/commit/f7bf75e4dafd9c1c6e401ed1c053cf647963308e))
* **tui/picker:** refactor/cleanup select/picker/autocomplete/tree ([aadcc2d](https://github.com/folke/zaly/commit/aadcc2de3967a4be8b6f33e02e7477baf5c09f2d))


### 🎨 Styles

* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))


### 📖 Documentation

* **api:** updated api ([f2c5e14](https://github.com/folke/zaly/commit/f2c5e148bd5ae2c8f0878e554326d467fd381617))
* exports ([52e2fc1](https://github.com/folke/zaly/commit/52e2fc19ffbc3eda2e69e759a2f498eb1da65f38))
* generated exports ([52945c6](https://github.com/folke/zaly/commit/52945c657719e046cf787cb16e8ffa7b7db9d9b5))
* updated api ([87702d9](https://github.com/folke/zaly/commit/87702d9b1c190e64a02e26f34ce40cb249c9e652))


### ✅ Tests

* fix all the tests ([495ed6f](https://github.com/folke/zaly/commit/495ed6f026b3e3643cead5f4ee93badd7325061e))
* fix tests ([402d880](https://github.com/folke/zaly/commit/402d8807459335f39994ea0a1ffe76d8708975e4))
* fixed image test ([2edd64e](https://github.com/folke/zaly/commit/2edd64ebc0acaf524b973dea844577888d4c257c))
* **shared/emitter:** added more emitter tests ([f3e3fc6](https://github.com/folke/zaly/commit/f3e3fc6292a8254bfbce550ea80eaf3d922a37f1))


### 📦 Build

* **dev:** added z command for dev stuff ([19819e2](https://github.com/folke/zaly/commit/19819e20098bc551f76b526b991646c4bdc9c878))
* fix spurious d.ts files created by build ([16e9cf4](https://github.com/folke/zaly/commit/16e9cf4a6e5cab0a9ff40a530b26da8c92326617))
* fixed trustedDependencies ([887a7d2](https://github.com/folke/zaly/commit/887a7d2bafe641b41e4102f8667689b77b7a79ef))
* integrate API Extractor ([0f9e198](https://github.com/folke/zaly/commit/0f9e1980c29dda73821162b705e41f9ee11cfe0e))
* **shared:** move image-data to dev deps ([a10d6f8](https://github.com/folke/zaly/commit/a10d6f8c66bf4fb6fd0821ef501a2d643fa79262))
* **shared:** tsdown config ([ad27488](https://github.com/folke/zaly/commit/ad27488ec2ed8aedda0f599081c0c605ed31023d))
* testing with conditions:source ([6c91452](https://github.com/folke/zaly/commit/6c914525129deccbf02579d1cb8d33c3c5e38ffd))
* tsdown config for cli ([7280956](https://github.com/folke/zaly/commit/72809568581c7976a81c540a6faa6d43ac279852))
