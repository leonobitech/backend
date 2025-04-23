import fs from "fs/promises";
import path from "path";
import { importSPKI, importPKCS8 } from "jose";

// 📁 Ruta absoluta a la carpeta /keys dentro del contenedor Docker
const keysDir = path.join(process.cwd(), "keys");

export const loadRsaKeys = async () => {
  const publicKeyPath = path.join(keysDir, "public.pem");
  const privateKeyPath = path.join(keysDir, "private.pem");

  const publicKeyPem = await fs.readFile(publicKeyPath, "utf8");
  const privateKeyPem = await fs.readFile(privateKeyPath, "utf8");

  const publicKey = await importSPKI(publicKeyPem, "RSA-OAEP-256");
  const privateKey = await importPKCS8(privateKeyPem, "RSA-OAEP-256");

  return { publicKey, privateKey };
};
