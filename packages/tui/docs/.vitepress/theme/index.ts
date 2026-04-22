// oxlint-disable import/no-unassigned-import
import DefaultTheme from "vitepress/theme"
// @ts-ignore
import "virtual:group-icons.css"
// @ts-ignore -- CSS side-effect import, no .d.ts
import "./custom.css"
// @ts-ignore -- Vue SFC, no .d.ts generated
import Layout from "./Layout.vue"

// oxlint-disable-next-line import/no-anonymous-default-export
export default {
  ...DefaultTheme,
  Layout,
}
