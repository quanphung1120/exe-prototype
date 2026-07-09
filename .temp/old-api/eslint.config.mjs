import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["dist/**", ".turbo/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
]
