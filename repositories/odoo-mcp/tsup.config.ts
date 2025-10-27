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
  external: ["pino"],
  noExternal: [
    "@prisma/client",
    "bcrypt",
    "cookie-parser",
    "cors",
    "dotenv",
    "express",
    "express-rate-limit",
    "helmet",
    "jose",
    "qs",
    "redis",
    "uuid",
    "xmlrpc",
    "zod",
  ],
  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
});
