<script setup lang="ts">
import { useData } from "vitepress"
import DefaultTheme from "vitepress/theme"
import HomePage from "./HomePage.vue"

// Replace the body when the page opts into the custom landing via
// `layout: home` frontmatter. Nav + search + theme-toggle stay from
// the default layout via the `page-top` slot; everything below it is
// ours. Non-home pages fall through untouched.
const { frontmatter } = useData()
</script>

<template>
  <DefaultTheme.Layout>
    <template v-if="frontmatter.customHome" #page-top>
      <HomePage />
    </template>
  </DefaultTheme.Layout>
</template>
