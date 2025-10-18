import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "odoo-mcp",
    version: "2.0.0",
    description: "MCP server for Odoo"
  });
});
