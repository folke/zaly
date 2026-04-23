// oxlint-disable sort-keys
import type { DefaultTheme } from "vitepress"

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitepress"
import { groupIconMdPlugin, groupIconVitePlugin } from "vitepress-plugin-group-icons"

const here = dirname(fileURLToPath(import.meta.url))

function loadTypedocSidebar(): DefaultTheme.SidebarItem[] {
  const file = resolve(here, "../api/typedoc-sidebar.json")
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DefaultTheme.SidebarItem[]
  } catch (error) {
    console.error("Failed to load typedoc sidebar:", error)
    return []
  }
}

const typedocSidebar = loadTypedocSidebar()

// One global sidebar — guide, concepts, recipes, and API reference
// (with the generated categories nested under it). Same list shows on
// every page, so navigation stays oriented.
const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: "Guide",
    base: "/guide",
    items: [
      { text: "Getting started", link: "/getting-started" },
      { text: "Architecture", link: "/architecture" },
    ],
  },
  {
    text: "Concepts",
    base: "/guide",
    items: [
      { text: "Surfaces", link: "/surfaces" },
      { text: "Nodes & state", link: "/nodes" },
      { text: "Reactivity", link: "/reactivity" },
      { text: "Styling", link: "/styling" },
      { text: "Theming", link: "/theming" },
      { text: "Input & actions", link: "/input" },
      { text: "Logger", link: "/logger" },
    ],
  },
  {
    text: "Widgets",
    base: "/widgets",
    items: [
      { text: "text", link: "/text" },
      { text: "box", link: "/box" },
      { text: "code", link: "/code" },
      { text: "diff", link: "/diff" },
      { text: "image", link: "/image" },
      { text: "markdown", link: "/markdown" },
      { text: "progress", link: "/progress" },
      { text: "spinner", link: "/spinner" },
      { text: "input", link: "/input" },
      { text: "menu", link: "/menu" },
      { text: "autocomplete", link: "/autocomplete" },
      { text: "log", link: "/log" },
      { text: "overlay", link: "/overlay" },
      { text: "widget", link: "/widget" },
    ],
  },
  {
    text: "Demos",
    base: "/demos",
    items: [
      { text: "Agent harness", link: "/agent" },
      { text: "Agent stream", link: "/stream" },
      { text: "Chat composer", link: "/input" },
      { text: "Autocomplete", link: "/autocomplete" },
      { text: "Logger", link: "/logger" },
    ],
  },
  {
    text: "Advanced",
    base: "/advanced",
    collapsed: true,
    items: [
      { text: "Direct-mode rendering", link: "/direct-mode" },
      { text: "Render pipeline", link: "/render-pipeline" },
      { text: "Invalidation", link: "/invalidation" },
    ],
  },
  {
    text: "API Reference",
    items: [
      { text: "Overview", link: "/api/" },
      // Each category from typedoc becomes a collapsible subsection so
      // the full symbol tree is browsable inline.
      ...typedocSidebar.map((item) => Object.assign(item, { collapsible: true })),
    ],
  },
]

export default defineConfig({
  title: "@zaly/tui",
  description: "Direct-mode terminal UI toolkit for agent interfaces",
  cleanUrls: true,
  ignoreDeadLinks: false,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo/zaly-a.svg" }]],
  markdown: {
    config(md) {
      md.use(groupIconMdPlugin)
    },
  },
  vite: {
    plugins: [
      groupIconVitePlugin({
        customIcon: {
          bun: "logos:bun",
          npm: "logos:npm-icon",
          pnpm: "logos:pnpm",
          yarn: "logos:yarn",
        },
      }),
    ],
  },
  themeConfig: {
    logo: "/logo/zaly-a.svg",
    siteTitle: "@zaly/tui",
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/" },
      { text: "GitHub", link: "https://github.com/folke/zaly" },
    ],
    sidebar,
    socialLinks: [{ icon: "github", link: "https://github.com/folke/zaly" }],
    search: { provider: "local" },
    outline: "deep",
    editLink: {
      pattern: "https://github.com/folke/zaly/edit/main/packages/tui/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
})
