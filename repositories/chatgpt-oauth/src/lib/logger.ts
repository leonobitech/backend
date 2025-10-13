import pino from "pino";
import { env } from "@/config/env";

const isProd = env.NODE_ENV === "production";

const transport = !isProd
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard"
      }
    }
  : undefined;

export const logger = pino({
  level: env.LOG_LEVEL,
  transport
});
