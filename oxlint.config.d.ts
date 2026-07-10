declare const _default: {
    categories: {
        correctness: "error";
        perf: "warn";
        style: "warn";
        suspicious: "warn";
    };
    env: {
        node: true;
    };
    ignorePatterns: string[];
    options: {
        reportUnusedDisableDirectives: "warn";
        typeAware: true;
        typeCheck: true;
    };
    plugins: ("eslint" | "import" | "oxc" | "typescript" | "unicorn")[];
    rules: {
        "capitalized-comments": "off";
        curly: "off";
        eqeqeq: ["error", "always", {
            null: "ignore";
        }];
        "func-style": "off";
        "id-length": "off";
        "import/consistent-type-specifier-style": ["error", "prefer-top-level"];
        "import/exports-last": "off";
        "import/group-exports": "off";
        "import/no-cycle": ["error"];
        "import/no-duplicates": "error";
        "import/no-named-as-default-member": "error";
        "import/no-named-export": "off";
        "import/no-namespace": ["error", {
            ignore: string[];
        }];
        "import/no-nodejs-modules": "off";
        "import/prefer-default-export": "off";
        "init-declarations": "off";
        "max-params": ["warn", number];
        "max-statements": "off";
        "new-cap": ["warn", {
            capIsNewExceptionPattern: string;
        }];
        "no-console": "warn";
        "no-continue": "off";
        "no-control-regex": "off";
        "no-duplicate-imports": ["warn", {
            allowSeparateTypeImports: true;
        }];
        "no-implicit-coercion": "off";
        "no-labels": "off";
        "no-magic-numbers": "off";
        "no-restricted-imports": ["error", {
            paths: {
                name: string;
                message: string;
            }[];
            patterns: {
                regex: string;
                message: string;
            }[];
        }];
        "no-ternary": "off";
        "no-underscore-dangle": "off";
        "no-unnecessary-type-assertion": "off";
        "no-unused-vars": "warn";
        "no-warning-comments": ["warn", {
            location: "start";
            terms: string[];
        }];
        "oxc/no-barrel-file": "off";
        "prefer-destructuring": "off";
        "prefer-named-capture-group": "off";
        "prefer-template": "warn";
        "sort-imports": "off";
        "sort-keys": ["warn", "asc", {
            caseSensitive: true;
            natural: false;
        }];
        "typescript/consistent-return": "off";
        "typescript/consistent-type-definitions": "off";
        "typescript/consistent-type-imports": ["error", {
            fixStyle: "separate-type-imports";
        }];
        "typescript/no-deprecated": "error";
        "typescript/no-floating-promises": "error";
        "typescript/no-misused-promises": "error";
        "typescript/no-unnecessary-condition": "error";
        "typescript/no-unsafe-type-assertion": "off";
        "typescript/parameter-properties": "off";
        "typescript/prefer-nullish-coalescing": "error";
        "typescript/prefer-optional-chain": "error";
        "typescript/prefer-readonly": "off";
        "typescript/prefer-regexp-exec": "off";
        "typescript/strict-boolean-expressions": "off";
        "unicorn/max-nested-calls": "off";
        "unicorn/no-null": "error";
        "unicorn/number-literal-case": "off";
        "unicorn/prefer-module": "error";
        "unicorn/prefer-node-protocol": "error";
    };
    overrides: ({
        files: string[];
        rules: {
            "no-restricted-imports": ["error", {
                paths: {
                    name: string;
                    message: string;
                }[];
                patterns: {
                    regex: string;
                    message: string;
                }[];
            }];
            "eslint/no-await-in-loop"?: undefined;
            "eslint/no-console"?: undefined;
            "eslint/sort-keys"?: undefined;
            "sort-keys"?: undefined;
            "unicorn/filename-case"?: undefined;
        };
    } | {
        files: string[];
        rules: {
            "eslint/no-await-in-loop": "off";
            "eslint/no-console": "off";
            "eslint/sort-keys": "off";
            "no-restricted-imports": "off";
            "sort-keys"?: undefined;
            "unicorn/filename-case"?: undefined;
        };
    } | {
        files: string[];
        rules: {
            "eslint/no-await-in-loop"?: undefined;
            "eslint/no-console"?: undefined;
            "eslint/sort-keys"?: undefined;
            "sort-keys": ["warn", "asc", {
                caseSensitive: true;
                natural: false;
            }];
            "no-restricted-imports": ["error", {
                paths: {
                    name: string;
                    message: string;
                }[];
                patterns: {
                    regex: string;
                    message: string;
                }[];
            }];
            "unicorn/filename-case"?: undefined;
        };
    } | {
        files: string[];
        rules: {
            "eslint/no-await-in-loop"?: undefined;
            "eslint/no-console"?: undefined;
            "eslint/sort-keys"?: undefined;
            "sort-keys"?: undefined;
            "no-restricted-imports"?: undefined;
            "unicorn/filename-case": "off";
        };
    })[];
};
export default _default;
//# sourceMappingURL=oxlint.config.d.ts.map