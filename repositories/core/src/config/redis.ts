import { createClient } from "redis";
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB } from "@config/env";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { handleStartupError } from "@utils/http/handleStartupError";

/**
 * 🎯 Redis client preconfigurado para el microservicio `auth`.
 */
export const redis = createClient({
  socket: {
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT),
  },
  password: REDIS_PASSWORD,
  database: parseInt(REDIS_DB),
});

// 🔴 Errores generales durante el ciclo de vida
redis.on("error", (err) => {
  loggerEvent("redis.connection.error", {
    message: err.message,
    stack: err.stack,
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: REDIS_DB,
  });
});

// 🚀 Conexión con reintentos
(async () => {
  let retries = 3;

  while (retries > 0) {
    try {
      await redis.connect();
      loggerEvent("redis.connection.success", {
        host: REDIS_HOST,
        db: REDIS_DB,
      });
      break;
    } catch (err) {
      retries--;

      loggerEvent("redis.connection.retry", {
        error: (err as Error).message,
        retriesLeft: retries,
      });

      if (retries === 0) {
        handleStartupError("redis", err);
      } else {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
  }
})();
