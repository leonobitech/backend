import { createClient } from "redis";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const authSegment = env.REDIS_PASSWORD ? `:${encodeURIComponent(env.REDIS_PASSWORD)}@` : "";

export const redis = createClient({
  url: `redis://${authSegment}${env.REDIS_HOST}:${env.REDIS_PORT}`,
  database: env.REDIS_DB,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000)
  }
});

redis.on("error", (err) => {
  logger.error({ err }, "[redis] connection error");
});

export async function ensureRedisConnection() {
  if (!redis.isOpen) {
    logger.debug("Connecting to Redis…");
    await redis.connect();
    logger.info({ host: env.REDIS_HOST, db: env.REDIS_DB }, "Redis connection established");
  }
}
