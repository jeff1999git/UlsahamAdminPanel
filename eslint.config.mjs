import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { FlatCompat } from "@eslint/eslintrc"

const rootDir = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: rootDir })

// `npm run lint` is the gate; `next build` skips lint (next.config.ts), so a
// warning never blocks a deploy.
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "public/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The code drops fields with rest destructuring ({ secret, ...rest }) and
      // marks deliberately unused parameters with a leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Typed rules: an un-awaited database write or log call fails silently.
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
]

export default eslintConfig
