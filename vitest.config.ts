import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@improvement": path.resolve(__dirname, "agent-improvement"),
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    environment: "node"
  }
});
