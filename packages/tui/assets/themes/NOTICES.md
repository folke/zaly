# Theme attribution

The theme JSON files in this directory are derived from upstream VS Code
themes distributed via [`@shikijs/themes`][shiki-themes] (MIT).
`scripts/build-shiki-themes.ts` maps each upstream theme's color slots
(`editor.*`, `terminal.ansi*`, `charts.*`, `diffEditor.*`, …) into the
TUI's `Theme` shape. The mapping is the only portion we author; colors
and palette choices belong to the original theme authors.

Each generated file carries a `"shiki": "<id>"` field pointing back at
its source.

[shiki-themes]: https://github.com/shikijs/shiki/tree/main/packages/themes

---

## Included themes

Most themes are derived from upstream VS Code themes via
[`@shikijs/themes`][shiki-themes]; the `tokyonight-*` set is generated
directly from the source project via `scripts/build-themes.ts`.

> **Tokyonight** is Apache-2.0. The full license text lives in
> [`LICENSE-tokyonight.txt`](./LICENSE-tokyonight.txt) alongside this
> file, per Apache §4.a (copy of the License must accompany the
> Work). Copyright © Folke Lemaitre.

| Theme                 | Upstream                                                                                              | Author(s)         | License    | Via               |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------- | ---------- | ----------------- |
| `tokyonight-day`      | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim)                                     | Folke Lemaitre    | Apache-2.0 | `build-themes.ts` |
| `tokyonight-moon`     | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim)                                     | Folke Lemaitre    | Apache-2.0 | `build-themes.ts` |
| `tokyonight-night`    | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim)                                     | Folke Lemaitre    | Apache-2.0 | `build-themes.ts` |
| `tokyonight-storm`    | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim)                                     | Folke Lemaitre    | Apache-2.0 | `build-themes.ts` |
| `catppuccin-mocha`    | [catppuccin/vscode](https://github.com/catppuccin/vscode)                                             | Catppuccin Org    | MIT        | Shiki             |
| `catppuccin-latte`    | [catppuccin/vscode](https://github.com/catppuccin/vscode)                                             | Catppuccin Org    | MIT        | Shiki             |
| `dracula`             | [dracula/visual-studio-code](https://github.com/dracula/visual-studio-code)                           | Zeno Rocha        | MIT        | Shiki             |
| `nord`                | [arcticicestudio/nord-visual-studio-code](https://github.com/arcticicestudio/nord-visual-studio-code) | Arctic Ice Studio | MIT        | Shiki             |
| `github-dark`         | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme)                           | GitHub            | MIT        | Shiki             |
| `github-light`        | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme)                           | GitHub            | MIT        | Shiki             |
| `gruvbox-dark-medium` | [jdinhify/vscode-theme-gruvbox](https://github.com/jdinhify/vscode-theme-gruvbox)                     | Joe Dinh          | MIT        | Shiki             |
| `one-dark-pro`        | [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro)                                     | Binaryify         | MIT        | Shiki             |
| `rose-pine`           | [rose-pine/vscode](https://github.com/rose-pine/vscode)                                               | Rosé Pine         | MIT        | Shiki             |

## MIT License (Shiki aggregator)

Copyright (c) 2021 Pine Wu
Copyright (c) 2023 Anthony Fu <https://github.com/antfu>

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Each upstream theme carries its own copyright notice under the MIT
license; follow the repository links above for the full text.
