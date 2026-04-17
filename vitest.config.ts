import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    projects: ["packages/*"],
    update: "new",
  },
})
