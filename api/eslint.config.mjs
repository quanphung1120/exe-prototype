import js from "@eslint/js"
import tseslint from "typescript-eslint"

// Flat ESLint config for the NestJS API. Prettier owns formatting (root
// .prettierrc + `pnpm format`), so no stylistic rules live here — this is
// correctness/lint only.
//
// `tsconfigRootDir` is pinned to this package so typescript-eslint's parser
// anchors to api's tsconfig instead of ambiguously auto-detecting
// between the monorepo's several `apps/*` roots.
export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Nest DI + Mongoose lean() surface plenty of framework-typed values;
      // an explicit empty-object/`any` here and there is idiomatic, not a smell.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
)
