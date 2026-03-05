import { Router } from "express";
import fileUpload from "express-fileupload";
import { getAdminInfo } from "@controllers/admin.controller";
import { uploadPodcast, getUploadToken } from "@controllers/upload.controller";

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

// 🔐 Todas las rutas de admin ahora retornan sessionId para binding con clientMeta
adminRouter.post("/n8n", (req, res) => {
  res.json({ url: "https://n8n.leonobitech.com", sessionId: req.sessionId });
});

adminRouter.post("/odoo", (req, res) => {
  res.json({ url: "https://odoo.leonobitech.com", sessionId: req.sessionId });
});

adminRouter.post("/baserow", (req, res) => {
  res.json({ url: "https://br.leonobitech.com", sessionId: req.sessionId });
});

// 📹 Upload podcast video (legacy - requires apiKeyGuard)
adminRouter.post("/upload-podcast", uploadMiddleware, uploadPodcast);

// 🎫 Get upload token for direct uploads (bypasses Vercel 4.5MB limit)
adminRouter.post("/upload-token", getUploadToken);

export default adminRouter;
