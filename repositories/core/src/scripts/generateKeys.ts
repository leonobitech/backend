import { generateKeyPair } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// 🔧 Solución ESM para __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Corrección de ruta
const keysDir = path.resolve(__dirname, "../../keys");

const generateKeys = async () => {
  await mkdir(keysDir, { recursive: true });

  generateKeyPair(
    "rsa",
    {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    },
    async (err, publicKey, privateKey) => {
      if (err) {
        console.error("❌ Error generating keys:", err);
        process.exit(1);
      }

      await writeFile(path.join(keysDir, "private.pem"), privateKey);
      await writeFile(path.join(keysDir, "public.pem"), publicKey);

      console.log("✅ RSA 4096 key pair generated in:", keysDir);
    }
  );
};

generateKeys();
