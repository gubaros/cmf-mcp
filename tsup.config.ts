import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    "cli/scrape": "src/cli/scrape.ts",
  },
  format: ["cjs"],
  target: "node20",
  clean: true,
  dts: false,
});
