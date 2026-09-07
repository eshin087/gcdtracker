import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/*.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
