import { defineConfig } from "oxlint"

function restrictedImport(kind: "name" | "regex", values: string | string[], message: string) {
  const vv = Array.isArray(values) ? values : [values]
  return vv.map((value) => ({
    [kind]: value,
    message,
  }))
}

function restrictedImports(opts: { allowIndex?: boolean } = {}) {
  return {
    paths: [
      ...restrictedImport(
        "name",
        ["slice-ansi", "string-width", "wrap-ansi"],
        "Import ANSI helpers from `#ansi` (runtime-conditional re-export across Bun and Node)."
      ),
      ...restrictedImport(
        "name",
        ["node:path", "path"],
        "Import from `pathe` instead — cross-platform path normalization."
      ),
    ],
    patterns: [
      ...restrictedImport(
        "regex",
        String.raw`marked\.[tj]s`,
        "Don't import the `marked` source directly; use `#md` so the bundler picks the runtime-appropriate renderer."
      ),
      ...restrictedImport(
        "regex",
        String.raw`runtime/.*\.[tj]s`,
        "Don't import `runtime/*` source files directly; use the `#runtime` alias so Bun and Node resolve to the right impl."
      ),
      ...restrictedImport(
        "regex",
        "schemas/(tpl|gen)/",
        "Don't import generated schema files; use the public `schemas/index.ts` exports."
      ),
      ...(!opts.allowIndex
        ? restrictedImport(
            "regex",
            [String.raw`(^|/)index(\.ts)?$`],
            "Inside a package, import from the actual source file. Barrels (`index.ts`) are reserved for external consumers"
          )
        : []),
    ],
  }
}

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "warn",
  },
  env: {
    node: true,
  },
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import"],
  ignorePatterns: ["foo*.ts"],
  rules: {
    "capitalized-comments": "off", // 98
    "new-cap": ["warn", { capIsNewExceptionPattern: "(Intl|Value|Type|Schema|compiled\\w*)\\." }],
    curly: "off", // 154
    eqeqeq: ["error", "always", { null: "ignore" }],
    "func-style": "off", // 58
    "id-length": "off", // 185
    "oxc/no-barrel-file": "off",
    "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    "import/exports-last": "off", // 41
    "import/group-exports": "off", // 106
    "import/no-cycle": ["error", { maxDepth: 3 }],
    "import/no-duplicates": "error",
    "import/no-named-as-default-member": "error",
    "import/no-named-export": "off", // 165
    "import/no-namespace": ["error", { ignore: ["node:*"] }],
    "import/no-nodejs-modules": "off",
    "import/prefer-default-export": "off", // 10
    "init-declarations": "off", // 4
    "max-statements": "off", // 26
    "max-params": ["warn", 4],
    "no-console": "warn",
    "no-continue": "off", // 24
    "no-control-regex": "off", // 2
    "no-duplicate-imports": ["warn", { allowSeparateTypeImports: true }], // 16
    "no-implicit-coercion": "off", // 4
    "no-labels": "off", // 4
    "no-magic-numbers": "off", // 278
    "no-restricted-imports": ["error", restrictedImports({ allowIndex: false })],
    "no-ternary": "off",
    "no-underscore-dangle": "off", // 4
    "no-unused-vars": "warn",
    "no-warning-comments": ["warn", { terms: ["todo", "fixme", "bug"], location: "start" }],
    "prefer-destructuring": "off", // 3
    "prefer-template": "warn",
    "sort-imports": "off", // 64
    "sort-keys": ["warn", "asc", { caseSensitive: true, natural: false }],
    "typescript/consistent-return": "off",
    "typescript/consistent-type-definitions": "off", // 32
    "typescript/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/parameter-properties": "off", // 20
    "typescript/prefer-nullish-coalescing": "error",
    "typescript/prefer-optional-chain": "error",
    "typescript/prefer-readonly": "off", // 22
    "typescript/prefer-regexp-exec": "off", // 6
    "typescript/strict-boolean-expressions": "off",
    "unicorn/no-null": "error", // 13
    "unicorn/number-literal-case": "off", // disable, since oxfmt formats number literals in lowercase
    "unicorn/prefer-module": "error",
    "unicorn/prefer-node-protocol": "error",
  },
  categories: {
    correctness: "error",
    suspicious: "warn",
    // "pedantic": "warn",
    perf: "warn",
    style: "warn",
    // "restriction": "error"
    // "nursery": "error"
  },
  overrides: [
    {
      files: ["**/index.ts"],
      rules: {
        "no-restricted-imports": ["error", restrictedImports({ allowIndex: true })],
      },
    },
    {
      files: ["!src/**/*.ts"],
      rules: {
        "eslint/no-console": "off",
        "eslint/sort-keys": "off",
        "eslint/no-await-in-loop": "off",
        "no-restricted-imports": "off",
      },
    },
    {
      files: ["*.vue"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
  ],
})
