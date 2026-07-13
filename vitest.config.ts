import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "meshova/pcg": fileURLToPath(new URL("./pcg/index.ts", import.meta.url)),
      "meshova/content": fileURLToPath(new URL("./content/index.ts", import.meta.url)),
      meshova: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
