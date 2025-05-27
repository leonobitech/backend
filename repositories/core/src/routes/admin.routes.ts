import { Router } from "express";
import { getAdminInfo } from "@controllers/admin.controller";

const adminRouter = Router();

// 🎯 Todas estas rutas están protegidas por authenticate + authorize en index.mjs
// Solo los administradores pueden acceder a este panel
adminRouter.get("/info", getAdminInfo);

adminRouter.post("/n8n", (req, res) => {
  res.json({ url: "https://n8n.leonobitech.com" });
});

adminRouter.post("/odoo", (req, res) => {
  res.json({ url: "https://odoo.leonobitech.com" });
});

adminRouter.post("/baserow", (req, res) => {
  res.json({ url: "https://br.leonobitech.com" });
});

export default adminRouter;
