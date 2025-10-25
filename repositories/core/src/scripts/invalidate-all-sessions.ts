// scripts/invalidate-all-sessions.ts
/**
 * 🚨 Script de emergencia para invalidar todas las sesiones
 * Usar solo cuando hay cambios incompatibles en clientKey o tokens
 *
 * Uso: npx tsx src/scripts/invalidate-all-sessions.ts
 */

import prisma from "../config/prisma";
import { redis } from "../config/redis";

async function invalidateAllSessions() {
  console.log("🚨 INVALIDANDO TODAS LAS SESIONES...");

  try {
    // 1. Revocar todos los tokens en DB
    const revokedTokens = await prisma.tokenRecord.updateMany({
      where: { revoked: false },
      data: { revoked: true },
    });

    console.log(`✅ ${revokedTokens.count} tokens revocados en DB`);

    // 2. Limpiar Redis completamente
    const keys = await redis.keys("access_token:*");
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✅ ${keys.length} tokens eliminados de Redis`);
    }

    // 3. Revocar todas las sesiones activas
    const revokedSessions = await prisma.session.updateMany({
      where: { isRevoked: false },
      data: { isRevoked: true },
    });

    console.log(`✅ ${revokedSessions.count} sesiones revocadas en DB`);

    console.log("🎉 TODAS LAS SESIONES HAN SIDO INVALIDADAS");
    console.log("👉 Los usuarios deberán hacer login nuevamente");

  } catch (error) {
    console.error("❌ Error al invalidar sesiones:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await redis.disconnect();
  }
}

invalidateAllSessions()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
