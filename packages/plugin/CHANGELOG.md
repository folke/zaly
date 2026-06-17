# Changelog

## [0.0.2](https://github.com/folke/zaly/compare/plugin-v0.0.1...plugin-v0.0.2) (2026-06-17)


### 🚀 Enhancements

* **agent:** better Agent.send Api ([0ffcdfa](https://github.com/folke/zaly/commit/0ffcdfa1293f7f713538925bc0637377fde22ad8))
* **agent:** tool collection + cli refactor ([df97d22](https://github.com/folke/zaly/commit/df97d2283a0d957fa80522a6123f26ea7e8fa5a2))
* **ai:** simplify model loading API ([a063088](https://github.com/folke/zaly/commit/a063088e348d657f8564095b0f8a0e0c11d407c1))
* **cli:** added --help for slash commands + skills + template commands ([e6c0f37](https://github.com/folke/zaly/commit/e6c0f375f4b5d63442eb498c089dbfca9967f693))
* **cli:** plugin support!! ([df85809](https://github.com/folke/zaly/commit/df858094a18a2d7c3e20d4946b7f0a31195c65ff))
* **plugins:** plugin API. WIP ([2c11d64](https://github.com/folke/zaly/commit/2c11d64652294282360a68cfe5a8fceb9aeb6fc3))
* **plugins:** simple context debug plugin ([c6df060](https://github.com/folke/zaly/commit/c6df06012d722948d99788f0537fd4469ff117d7))


### 🩹 Fixes

* **plugin/agent:** registerTool just takes Tool def ([e733ec4](https://github.com/folke/zaly/commit/e733ec45845543f000148a952062b197f71da381))
* **plugin/ui:** allow registering multiple actions at the same time ([d25b142](https://github.com/folke/zaly/commit/d25b14299a42b64557c7735e2791f6300676519d))
* **plugins:** better notif for ollama & lm-studio when not running ([0371c4b](https://github.com/folke/zaly/commit/0371c4be95fb06d7a4bfc742af5913a07a6eee25))
* **plugins:** proper error notif when a plugin fails loading ([9e0f8c3](https://github.com/folke/zaly/commit/9e0f8c38b2911975d6270b276a8ea17d273e6bdc))
* **plugins:** track emitter errors for plugins ([9cc30ac](https://github.com/folke/zaly/commit/9cc30ac3f645d81ecca0580ca2e5dc3c753c98ce))
* **tui/autocomplete:** menu select vs complete ([c70ad2f](https://github.com/folke/zaly/commit/c70ad2f122a314823d35994519fc5bca090b49a4))


### 💅 Refactors

* ActionInfo =&gt; ActionDef ([aeec920](https://github.com/folke/zaly/commit/aeec92050b505eb08bd43de96fb1dea8b834e690))
* **ai:** big refactor around ModelSpec/ModelInfo/ProviderInfo types ([7c10df5](https://github.com/folke/zaly/commit/7c10df58d6a05ff6a24e729909dee3682d1fe736))
* refactor ALL THE THINGS!! ([87e2400](https://github.com/folke/zaly/commit/87e240041ba5723317ef1ce8ffa2f57c6400e5b7))
* split up widgets/services exports in tui ([84d81ad](https://github.com/folke/zaly/commit/84d81ad31e6fe2072782e990e6f35c5e0ce16153))
* **tui/picker:** refactored shared code between picking from a tree / select ([8c117fc](https://github.com/folke/zaly/commit/8c117fc4a116bd42129269d0c8b5723029f5371d))
* **tui:** menu() =&gt; select() ([8670217](https://github.com/folke/zaly/commit/86702176c072655b2ebb9edb88e9f79eca378b01))


### 🎨 Styles

* format ([505f641](https://github.com/folke/zaly/commit/505f6415761b3203cb1c4182edbd23528ecc6999))
