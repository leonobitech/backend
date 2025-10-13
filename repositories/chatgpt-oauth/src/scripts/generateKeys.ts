import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { env } from "../config/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = resolve(__dirname, "../../keys");

async function main() {
  await mkdir(keysDir, { recursive: true });

  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true
  });

  const pkcs8 = await exportPKCS8(privateKey);
  const spki = await exportSPKI(publicKey);
  const jwk = await exportJWK(publicKey);

  jwk.kid = env.JWKS_KID;
  jwk.use = "sig";
  jwk.alg = "RS256";

  await writeFile(resolve(keysDir, "private.pem"), pkcs8, "utf-8");
  await writeFile(resolve(keysDir, "public.pem"), spki, "utf-8");

  const jwksPath = resolve(keysDir, "jwks.json");
  const jwks = { keys: [jwk] };

  await writeFile(jwksPath, JSON.stringify(jwks, null, 2), "utf-8");

  console.log("✔️  RSA keypair generado y JWKS actualizado.");
  console.log(`- private.pem / public.pem (no commitear)`);
  console.log(`- jwks.json con kid=${env.JWKS_KID}`);
}

main().catch((err) => {
  console.error("No se pudieron generar las llaves", err);
  process.exit(1);
});
