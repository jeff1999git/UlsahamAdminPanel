import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Vite reads .env files from envDir. The project root has .env.local with
  // production credentials, so point it at test/, which has none.
  envDir: fileURLToPath(new URL("./test", import.meta.url)),
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Fail instead of passing silently when a filter or a moved folder leaves
    // nothing to run.
    passWithNoTests: false,
  },
})
