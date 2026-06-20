import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["dist/**", ".turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
]
