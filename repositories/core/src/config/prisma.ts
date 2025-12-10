import { PrismaClient } from "@prisma/client";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { handleStartupError } from "@utils/http/handleStartupError";

export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

try {
  await prisma.$connect();
  loggerEvent("prisma.connection.success", {
    service: "prisma",
  });
} catch (err) {
  handleStartupError("prisma", err);
}

export default prisma;
