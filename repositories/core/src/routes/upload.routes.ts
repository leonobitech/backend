import { Router } from "express";
import fileUpload from "express-fileupload";
import { uploadPodcastWithToken } from "@controllers/upload.controller";

const uploadRouter = Router();

// Middleware para upload de archivos
const uploadMiddleware = fileUpload({
  useTempFiles: true,
  tempFileDir: "./temp-uploads",
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

/**
 * 📹 POST /upload/podcast
 *
 * Upload de podcast usando X-Upload-Token (pre-autenticado).
 * Esta ruta está ANTES de apiKeyGuard porque el token ya fue
 * validado contra un usuario autenticado admin.
 *
 * Headers requeridos:
 * - X-Upload-Token: Token de un solo uso obtenido de /admin/upload-token
 *
 * Body (multipart/form-data):
 * - video: Archivo MP4
 * - title: Título del podcast
 * - description: Descripción (opcional)
 * - duration: Duración en segundos
 */
uploadRouter.post("/podcast", uploadMiddleware, uploadPodcastWithToken);

export default uploadRouter;
