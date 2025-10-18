#!/usr/bin/env node

// Fuerza perfil prod al usar el bin
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

// Flag --port=8010
const pf = process.argv.find((a) => a.startsWith("--port="));
if (pf) {
  const v = pf.split("=")[1];
  if (v) process.env.PORT = v;
}

// Import estático para el bundle final (dist/cli.mjs -> dist/index.js)
// Nota: en src no existe index.js; silenciamos el chequeo de tipos.
/* @ts-ignore -- this exists after build */
import("./index.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
