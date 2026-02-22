import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

// Singleton Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on("beforeExit", async () => {
  logger.info("Disconnecting Prisma client...");
  await prisma.$disconnect();
});

// Test database connection on startup
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    logger.info("✅ Database connection successful");
    return true;
  } catch (error) {
    logger.error({ err: error }, "❌ Database connection failed");
    return false;
  }
}
