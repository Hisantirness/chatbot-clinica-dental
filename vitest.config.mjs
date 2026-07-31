import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["./src/test-setup.mjs"],
  },
});
