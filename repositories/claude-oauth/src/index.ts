import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ensureRedisConnection } from "@/lib/redis";
import { healthRouter } from "@/routes/health";
import { mcpRouter } from "@/routes/mcp";
import { oauthRouter } from "@/routes/oauth";
import { wellKnownRouter } from "@/routes/well-known";

const app = express();

app.set("trust proxy", true);
app.use((req, _res, next) => {
  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      headers: {
        host: req.headers.host,
        "user-agent": req.headers["user-agent"],
        accept: req.headers.accept,
        "content-type": req.headers["content-type"]
      }
    },
    "incoming request"
  );
  next();
});
app.use(helmet());
app.use(
  cors({
    origin: ["https://claude.ai", "https://app.claude.ai", "https://desktop.claude.ai", env.PUBLIC_URL]
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/healthz", healthRouter);
app.use("/.well-known", wellKnownRouter);
app.use("/oauth", oauthRouter);
app.use("/mcp", mcpRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  await ensureRedisConnection();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "[claude-oauth] listening");
  });
}

start().catch((err) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
