import { defineConfig, globalIgnores } from "eslint/config"
import js from "@eslint/js"
import tseslint from "typescript-eslint"

// Flat ESLint config for the NestJS API. Prettier owns formatting (this
// package's .prettierrc + `pnpm format`), so no stylistic rules live here —
// this is correctness/lint only.
//
// `tsconfigRootDir` is pinned to this package so typescript-eslint's parser
// anchors to api's tsconfig instead of ambiguously auto-detecting between
// several roots (this repo has no monorepo tooling, but `web` sits alongside
// `api` at the repo root).
export default defineConfig([
  globalIgnores(["dist/**"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // eslint.config.mjs itself isn't part of the app's tsconfig
          // `include`, so the type-aware parser can't build a program for
          // it — fall back to its untyped default project instead of erroring.
          allowDefaultProject: ["eslint.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Runs under the default (non-type-checked) project above, so the
  // type-aware rules don't apply to this config file itself.
  {
    files: ["eslint.config.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    rules: {
      // In ESLint 10's recommended set, but its scope analysis doesn't see
      // reads inside parameter decorators (`@Body(new ZodValidationPipe(x))`),
      // which NestJS controllers use everywhere — false positives.
      "no-useless-assignment": "off",
    },
  },
])
