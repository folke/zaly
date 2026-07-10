# Changelog

## [0.0.4](https://github.com/folke/zaly/compare/config-v0.0.3...config-v0.0.4) (2026-07-10)


### 📦 Build

* Node 22.11 compat ([e69afd8](https://github.com/folke/zaly/commit/e69afd83a4719117ebd5e7a2a104d7503f53a18b))

## [0.0.3](https://github.com/folke/zaly/compare/config-v0.0.2...config-v0.0.3) (2026-07-10)


### 🚀 Enhancements

* **ai/masking:** made masking configurable ([bd9d51d](https://github.com/folke/zaly/commit/bd9d51d900a0aac98b2397e3e258a51b574f5db1))
* **ai/models:** model/provider overrides rework + hook up with config ([9ea2ae4](https://github.com/folke/zaly/commit/9ea2ae4069925bc3b22586f2dabf1ae3d1c6c831))
* **ai:** big rework of oauth/authentication/model catalog ([a4b8cbc](https://github.com/folke/zaly/commit/a4b8cbc35158237e3a3e32ad0c583bb2d6b4b2e1))
* **cli/config:** configure terminal mode: `"scrollback" | "fullscreen"` ([11234ae](https://github.com/folke/zaly/commit/11234ae035d56b41cfde63412ba26238c33af07d))
* **cli/stream:** configure which tools to show as collapsed ([524e33a](https://github.com/folke/zaly/commit/524e33a854d6c1750f892750201d865640f44387))
* **cli/tree:** tree filter settings ([862ff1d](https://github.com/folke/zaly/commit/862ff1d3256a05878d8eab9ef6a2b97fe00b8a09))
* **cli/ui:** allow disabling reasoning in the ui ([7ccf951](https://github.com/folke/zaly/commit/7ccf95101509770ae2135dfd64a24afb50ef05a7))
* **cli:** more lenient error handling in config files ([47cea3c](https://github.com/folke/zaly/commit/47cea3c2317eab04ea608cb822b9ab2d7b277816))
* **config/plugin:** add scope to PluginRef ([6868e73](https://github.com/folke/zaly/commit/6868e735939ed235aee3ab4318d963b0a7e2a84f))
* **config/resource:** allow getting unfiltered resources ([55534b5](https://github.com/folke/zaly/commit/55534b5e98041550175b66649aa2f62865867fc4))
* **config/resource:** get resources for a given scope ([0369626](https://github.com/folke/zaly/commit/036962605eeb373d0d6f0c4669cff8b12d565bcd))
* **config/resources:** propagate scope to resource paths/packs ([ca69ec7](https://github.com/folke/zaly/commit/ca69ec7d2d05b020ae6d67b38a3fe26dbd58573c))
* **config:** add state:JsonFile to ConfigManager ([190e789](https://github.com/folke/zaly/commit/190e78965ae64f8f8e5cf3eb55a782bd529185ce))
* **config:** added `ui.copyOnSelect` config option ([f886a11](https://github.com/folke/zaly/commit/f886a114c5c252414eb0a3968c1d20b0b72717fc))
* **config:** added Config.update() ([ed050ba](https://github.com/folke/zaly/commit/ed050ba290c9f8e8bb30894ed4160ef8d451303c))
* **config:** added resource filters ([4bb1f03](https://github.com/folke/zaly/commit/4bb1f036fdd8776577c2c1bdfd09cd190db7efe0))
* **config:** allow configuring a skill/command action prefix ([e9502db](https://github.com/folke/zaly/commit/e9502dbec293050cbae2bfed149e8edc65d2bba7))
* **config:** bump keepTurns for masker from 20 -&gt; 40 ([a71ddba](https://github.com/folke/zaly/commit/a71ddba63f67c7e9fceb698d45b7fd3bfd61b61b))
* **config:** change default terminal mode to "fullscreen" ([f58c878](https://github.com/folke/zaly/commit/f58c8787fca65f927d7f97781ef1b0d492ea2fc3))
* **config:** made session tree sections configurable ([e17e40e](https://github.com/folke/zaly/commit/e17e40e5a6c23287232b8343fcca123dbfb7442e))
* **config:** make bash/git/npm paths configurable ([bd552f3](https://github.com/folke/zaly/commit/bd552f3335c06feb06b7a2be0f3c630fdcba1018))
* **config:** MOAR config options ([0ba1911](https://github.com/folke/zaly/commit/0ba191157d9cae9a0b0600c165cb19cd50effca1))
* **config:** packages support (npm & git) ([2fbe300](https://github.com/folke/zaly/commit/2fbe30074676f7bebd8541379fbda2e95de0dc88))
* **config:** pass resource excludes from flags ([696fdb3](https://github.com/folke/zaly/commit/696fdb3148f1e350cf59213116e1230e0f8b6bb3))
* **config:** propagate compaction settings ([9c78f0a](https://github.com/folke/zaly/commit/9c78f0a6fb732c944beb6344aee79a00d3dc0b79))
* **config:** resource management ([6b5b561](https://github.com/folke/zaly/commit/6b5b561237fa14b4c94e02ab465fff83b7d7c5b2))
* **config:** ui.listHeight and ui.treeHeight ([673b265](https://github.com/folke/zaly/commit/673b26515286041a5015e8104f9763a6b2dc99df))
* **config:** updated default tools ([744a6c2](https://github.com/folke/zaly/commit/744a6c24b16b616d73ae5158fcc950234895a6d5))
* **dev:** initial publishing ([30b54fa](https://github.com/folke/zaly/commit/30b54fab50a94e9c4ee62d01f8f96a23ce04f87d))
* **shared/json:** added JsonFile to easily manage json files (config/state/etc) ([00649a8](https://github.com/folke/zaly/commit/00649a8eced29074182124a1957ae0d12db97085))
* **shared/prop:** added propSet/propGet to set/get object values based on a key path ([4bc09b4](https://github.com/folke/zaly/commit/4bc09b4a180173e519561bd01671ed61a0db7eb5))
* **shared/types:** moved DeepPartial/Simplify to shared/types ([7e9317c](https://github.com/folke/zaly/commit/7e9317cd8021f40ade0f508f9b7b1263e37b574e))
* **tui/images:** allow disabling image rendering ([3fb7282](https://github.com/folke/zaly/commit/3fb7282e75ea7fb9a56d768cb749bd795ef0e7ea))


### 🩹 Fixes

* **config/git:** only do npm install when plugins dir exists ([9de64d7](https://github.com/folke/zaly/commit/9de64d7c9cd1ccd85d9002b089c89e96ae99071c))


### 💅 Refactors

* **config/resource:** got rid of ResourcePaths ([67bd922](https://github.com/folke/zaly/commit/67bd9225605e7395c101c95a863467fd8d40a08a))
* **config:** added ResolvedSettings inferred from default settings ([fd8660d](https://github.com/folke/zaly/commit/fd8660def74a22c83907f9faae34e8207540476a))
* **config:** ConfigManager ([149a353](https://github.com/folke/zaly/commit/149a353de12a5e973172e5fead9120de7bec0bc7))


### 🎨 Styles

* **config:** defaults ([e281bd9](https://github.com/folke/zaly/commit/e281bd92704e05a626be99783031ebca922e0ece))
* oxfmt ([52369c7](https://github.com/folke/zaly/commit/52369c7d22a000c16fb4953a9c4744c55b34652d))
* oxfmt ([be0afec](https://github.com/folke/zaly/commit/be0afecf4459405fdef168c3f72d322c74fe5c48))
* **shared/glob:** doc strings for glob options ([b76bfa0](https://github.com/folke/zaly/commit/b76bfa0684aa42f56c2529654986dbf4932be8bb))


### 📖 Documentation

* basic docs before publishing v0 ([c9c4fc3](https://github.com/folke/zaly/commit/c9c4fc34e1bddae7432abec7fcc7bf1336b27999))


### ✅ Tests

* **config:** config tests ([6bf26c7](https://github.com/folke/zaly/commit/6bf26c72a885233422a58b635d8853112ee889b9))
* fix uri tests ([a18370d](https://github.com/folke/zaly/commit/a18370d8e08a63295a62ff63888e817a77b3ddcf))
* fix uri.test ([8bbe3ef](https://github.com/folke/zaly/commit/8bbe3ef178365694751a8a84983ba232fae2d2e7))


### 📦 Build

* fix build ([995e599](https://github.com/folke/zaly/commit/995e599eb4a46f3a55ece54dd0ea1f8e256f29cd))
* update package.json files and add homepage/bugs/repository.directory ([81576dd](https://github.com/folke/zaly/commit/81576ddca3fbf8bdc4044f4a1f1b29445b524e4d))

## [0.0.2](https://github.com/folke/zaly/compare/config-v0.0.1...config-v0.0.2) (2026-06-17)


### 🚀 Enhancements

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


### 🩹 Fixes

* **cli:** session settings resolution ([75897db](https://github.com/folke/zaly/commit/75897dbc1864c2024166433a275d32bc9a453d4b))
* **config/skills:** order resources from highest to lowest precedence ([9868127](https://github.com/folke/zaly/commit/9868127363454bc63c33ade5f1af98671cb749f5))
* **config/state:** double file name ([ff28bd3](https://github.com/folke/zaly/commit/ff28bd36536633727f7eae9850a69841c4bd7fcc))
* **config:** default tools ([3d4df46](https://github.com/folke/zaly/commit/3d4df466ff7fe2c2c848e674a27f348a980ef346))


### 💅 Refactors

* cleanup ([60b96a8](https://github.com/folke/zaly/commit/60b96a8593462fd194ddddb5328642ab63f35152))
* **config:** Config.resources and can be false to skip ([845af72](https://github.com/folke/zaly/commit/845af720ceab0c742b838a5891bd855ae7ae7326))
* **config:** mergeSettings -&gt; utils.ts: merge() ([0762441](https://github.com/folke/zaly/commit/0762441b5641f5e08f83a31c1414d60456e95a4c))
* **config:** prompts -&gt; commands ([4b75716](https://github.com/folke/zaly/commit/4b75716f4f536092f465ffbbd9f3ef941c482112))
* **tui/keys:** simplified action and key patterns ([17e3c68](https://github.com/folke/zaly/commit/17e3c68c870967edacf300354a613a5939c821d4))


### 🎨 Styles

* oxfmt ([4219989](https://github.com/folke/zaly/commit/42199891d11d888e141eba82bff7437c4ffdc94a))
