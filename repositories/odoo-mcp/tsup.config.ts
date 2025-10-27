import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  outExtension: () => ({ js: ".mjs" }),
  // Mark all node_modules as external - don't bundle them
  external: [/node_modules/],
  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
});
