import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Reprend les alias `@/*` de tsconfig.json plutôt que de les redéclarer.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
