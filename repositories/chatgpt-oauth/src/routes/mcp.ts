import { Router } from "express";

export const mcpRouter = Router();

mcpRouter.post("/ping", (_req, res) => {
  res.json({ result: "pong" });
});
