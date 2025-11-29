import { Router } from "express";
import fileUpload from "express-fileupload";
import { getAdminInfo } from "@controllers/admin.controller";
import { uploadPodcast } from "@controllers/upload.controller";

const adminRouter = Router();

// Middleware para upload de archivos (solo en la ruta de podcast)
const uploadMiddleware = fileUpload({
  useTempFiles: true,
  tempFileDir: "./temp-uploads",
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// 🎯 Todas estas rutas están protegidas por authenticate + authorize en index.mjs
// Solo los administradores pueden acceder a este panel
adminRouter.get("/info", getAdminInfo);

adminRouter.post("/n8n", (_req, res) => {
  res.json({ url: "https://n8n.leonobitech.com" });
});

adminRouter.post("/odoo", (_req, res) => {
  res.json({ url: "https://odoo.leonobitech.com" });
});

adminRouter.post("/baserow", (_req, res) => {
  res.json({ url: "https://br.leonobitech.com" });
});

adminRouter.post("/chatwoot", (_req, res) => {
  res.json({ url: "https://chat.leonobitech.com" });
});

adminRouter.post("/leonobit", (_req, res) => {
  res.json({ url: "https://leonobit.leonobitech.com" });
});

// 📹 Upload podcast video
adminRouter.post("/upload-podcast", uploadMiddleware, uploadPodcast);

export default adminRouter;
