import { describe, expect, test } from "vitest"
import { pluginUri } from "../src/plugin/uri.ts"

describe("parsePackUri", () => {
  test.each([
    ["npm:@foo/bar@1.0.0", { name: "@foo/bar", type: "npm", version: "1.0.0" }],
    ["npm:@foo/bar", { name: "@foo/bar", type: "npm", version: undefined }],
    ["git:github.com/user/repo@v1", { ref: "v1", repo: "git:github.com/user/repo", type: "git" }],
    [
      "git:github.com/user/repo@feat/foo",
      { ref: undefined, repo: "git:github.com/user/repo@feat/foo", type: "git" },
    ],
    [
      "https://github.com/user/repo",
      { ref: undefined, repo: "https://github.com/user/repo", type: "git" },
    ],
    ["/absolute/path/to/package", { path: "/absolute/path/to/package", type: "dir" }],
    ["./relative/path/to/package", { path: "./relative/path/to/package", type: "dir" }],
    [
      "https://user@github.com/org/repo@v1",
      { ref: "v1", repo: "https://user@github.com/org/repo", type: "git" },
    ],
    [
      "https://user@github.com/org/repo",
      { ref: undefined, repo: "https://user@github.com/org/repo", type: "git" },
    ],
  ] as const)("parses %s", (uri, expected) => {
    expect(pluginUri(uri)).toEqual(expected)
  })
})
