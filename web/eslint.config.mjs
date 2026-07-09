import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Type-checked rules (unsafe-any-usage, unnecessary-condition, etc.) on top
  // of eslint-config-next's non-type-checked `recommended` set. Requires
  // `languageOptions.parserOptions.projectService` below so the parser can
  // build the TS program for each linted file.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level *.config.mjs tooling files aren't part of the app's
          // tsconfig `include`, so the type-aware parser can't build a
          // program for them — fall back to its untyped default project
          // instead of erroring.
          allowDefaultProject: ["eslint.config.mjs", "postcss.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // These tooling configs run under the default (non-type-checked) project
  // above, so the type-aware rules don't apply to them.
  {
    files: ["eslint.config.mjs", "postcss.config.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
