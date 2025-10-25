// scripts/migrate-client-keys.ts
/**
 * 🔄 Migración de clientKeys de formato /24 a IP completa
 *
 * Contexto: Cambiamos de usar primeros 3 octetos (181.47.137)
 * a usar IP completa (181.47.137.24) para mayor seguridad
 *
 * Este script regenera todos los clientKeys de sesiones activas
 *
 * Uso: npx tsx src/scripts/migrate-client-keys.ts
 */

import prisma from "../config/prisma";
import { generateClientKeyFromMeta } from "../utils/auth/generateClientKey";

async function migrateClientKeys() {
  console.log("🔄 INICIANDO MIGRACIÓN DE CLIENT KEYS...\n");

  try {
    // 1. Obtener todas las sesiones activas
    const activeSessions = await prisma.session.findMany({
      where: {
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        device: true,
        user: true,
      },
    });

    console.log(`📊 Sesiones activas encontradas: ${activeSessions.length}\n`);

    if (activeSessions.length === 0) {
      console.log("✅ No hay sesiones activas para migrar");
      return;
    }

    let migratedCount = 0;
    let errorCount = 0;

    for (const session of activeSessions) {
      try {
        // Reconstruir metadata desde Device
        const meta: RequestMeta = {
          ipAddress: session.device.ipAddress,
          deviceInfo: {
            device: session.device.device,
            os: session.device.os,
            browser: session.device.browser,
          },
          userAgent: session.device.userAgent,
          language: session.device.language,
          platform: session.device.platform,
          timezone: session.device.timezone,
          screenResolution: session.device.screenResolution,
          label: session.device.label,
          path: "",
          method: "",
          host: "",
        };

        // Generar nuevo clientKey con formato IP completa
        const newClientKey = await generateClientKeyFromMeta(
          meta,
          session.userId,
          session.id,
          false // No verbose en migración
        );

        // Actualizar session y todos sus tokens
        await prisma.session.update({
          where: { id: session.id },
          data: { clientKey: newClientKey },
        });

        await prisma.tokenRecord.updateMany({
          where: { sessionId: session.id },
          data: { publicKey: newClientKey },
        });

        console.log(`✅ Sesión ${session.id.substring(0, 8)}... migrada`);
        console.log(`   Usuario: ${session.user.email}`);
        console.log(`   Device: ${session.device.device} (${session.device.os})\n`);

        migratedCount++;

      } catch (error) {
        console.error(`❌ Error migrando sesión ${session.id}:`, error);
        errorCount++;
      }
    }

    console.log("\n📈 RESUMEN DE MIGRACIÓN:");
    console.log(`   ✅ Migradas exitosamente: ${migratedCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);
    console.log(`   📊 Total procesadas: ${activeSessions.length}\n`);

    if (migratedCount > 0) {
      console.log("🎉 MIGRACIÓN COMPLETADA");
      console.log("👉 Las sesiones existentes ahora funcionarán con el nuevo formato");
    }

  } catch (error) {
    console.error("❌ Error crítico en migración:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateClientKeys()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
