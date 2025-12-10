import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { prisma } from "@config/prisma";
import fs from "fs/promises";
import path from "path";
import {
  generateUploadToken,
  validateAndConsumeUploadToken,
} from "@utils/auth/uploadToken";

// n8n internal Docker URL (comunicación por red interna)
const N8N_WEBHOOK_URL = process.env.N8N_INTERNAL_URL || "http://n8n_webhook_1:5678";
const N8N_WEBHOOK_KEY = process.env.N8N_WEBHOOK_KEY || "";

// Directorio temporal para archivos
const TEMP_DIR = "/tmp/uploads";

// Asegurar que el directorio temporal existe
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // Ignorar si ya existe
  }
}

/**
 * Upload podcast video to n8n
 * POST /admin/upload-podcast
 */
export const uploadPodcast = async (req: Request, res: Response): Promise<void> => {
  await ensureTempDir();

  // Verificar que hay archivo
  if (!req.files?.video) {
    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "No se recibió ningún archivo de video",
    });
    return;
  }

  const video = req.files.video as {
    name: string;
    mimetype: string;
    tempFilePath: string;
    size: number;
  };

  // Extraer metadata del body
  const { title, description, duration } = req.body;

  // Validar campos requeridos
  if (!title) {
    try {
      await fs.unlink(video.tempFilePath);
    } catch {}

    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "title es requerido",
    });
    return;
  }

  try {
    console.log(`📤 Uploading podcast: ${title}`);
    console.log(`📁 Temp file: ${video.tempFilePath} (${(video.size / 1024 / 1024).toFixed(2)} MB)`);

    // Leer el archivo y convertir a base64
    const fileBuffer = await fs.readFile(video.tempFilePath);
    const base64Data = fileBuffer.toString("base64");

    // Enviar a n8n via red Docker interna
    const n8nUrl = `${N8N_WEBHOOK_URL}/webhook/upload-podcast`;
    console.log(`🔗 Sending to n8n: ${n8nUrl}`);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_WEBHOOK_KEY && { "x-n8n-webhook-key": N8N_WEBHOOK_KEY }),
      },
      body: JSON.stringify({
        userId: req.userId,
        title,
        description: description || "",
        duration: duration || "",
        filename: video.name,
        mimeType: video.mimetype,
        fileData: base64Data,
      }),
    });

    // Limpiar archivo temporal
    try {
      await fs.unlink(video.tempFilePath);
      console.log(`🧹 Temp file cleaned: ${video.tempFilePath}`);
    } catch (cleanupError) {
      console.error(`⚠️ Failed to clean temp file:`, cleanupError);
    }

    // Verificar respuesta de n8n
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`❌ n8n error (${n8nResponse.status}):`, errorText);

      res.status(n8nResponse.status).json({
        success: false,
        message: `Error de n8n: ${n8nResponse.statusText}`,
        details: errorText,
      });
      return;
    }

    const result = await n8nResponse.json();
    console.log(`✅ n8n response:`, result);

    // Guardar en base de datos
    const podcast = await prisma.podcast.create({
      data: {
        title,
        description: description || "",
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl || null,
        duration: parseInt(duration) || 0,
        createdBy: req.userId!,
      },
    });

    console.log(`💾 Podcast saved to DB:`, podcast.id);

    res.status(HTTP_CODE.OK).json({
      success: true,
      message: "Podcast subido exitosamente",
      podcast,
    });
  } catch (error) {
    console.error(`❌ Upload error:`, error);

    try {
      await fs.unlink(video.tempFilePath);
    } catch {}

    res.status(HTTP_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * 🎫 Generate upload token for authenticated admin
 * POST /admin/upload-token
 *
 * Returns a single-use token that can be used to upload
 * directly to Core without x-core-access-key header.
 */
export const getUploadToken = async (req: Request, res: Response): Promise<void> => {
  const { action } = req.body;

  // Validar action
  if (action !== "upload-podcast") {
    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "Invalid action. Supported: upload-podcast",
    });
    return;
  }

  try {
    const token = await generateUploadToken(
      req.userId!,
      req.sessionId!,
      action
    );

    res.status(HTTP_CODE.OK).json({
      success: true,
      token,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error("❌ Error generating upload token:", error);
    res.status(HTTP_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error al generar token de upload",
    });
  }
};

/**
 * 📹 Upload podcast with pre-auth token
 * POST /upload/podcast
 *
 * This route is BEFORE apiKeyGuard, authentication is done
 * via X-Upload-Token header (single-use, pre-validated).
 */
export const uploadPodcastWithToken = async (req: Request, res: Response): Promise<void> => {
  await ensureTempDir();

  // 1) Validar upload token
  const uploadToken = req.headers["x-upload-token"] as string;

  if (!uploadToken) {
    res.status(HTTP_CODE.UNAUTHORIZED).json({
      success: false,
      message: "X-Upload-Token header requerido",
    });
    return;
  }

  const tokenPayload = await validateAndConsumeUploadToken(uploadToken, "upload-podcast");

  if (!tokenPayload) {
    res.status(HTTP_CODE.UNAUTHORIZED).json({
      success: false,
      message: "Token inválido, expirado o ya utilizado",
    });
    return;
  }

  // Token válido - extraer userId
  const { userId } = tokenPayload;

  // 2) Verificar que hay archivo
  if (!req.files?.video) {
    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "No se recibió ningún archivo de video",
    });
    return;
  }

  const video = req.files.video as {
    name: string;
    mimetype: string;
    tempFilePath: string;
    size: number;
  };

  // 3) Extraer metadata del body
  const { title, description, duration, width, height } = req.body;

  if (!title) {
    try {
      await fs.unlink(video.tempFilePath);
    } catch {}

    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "title es requerido",
    });
    return;
  }

  try {
    console.log(`📤 [Token Auth] Uploading podcast: ${title} (user: ${userId})`);
    console.log(`📊 Duration received: "${duration}" (type: ${typeof duration}, parsed: ${parseInt(duration)})`);
    console.log(`📁 Temp file: ${video.tempFilePath} (${(video.size / 1024 / 1024).toFixed(2)} MB)`);

    // 4) Leer archivo y convertir a base64
    const fileBuffer = await fs.readFile(video.tempFilePath);
    const base64Data = fileBuffer.toString("base64");

    // 5) Enviar a n8n
    const n8nUrl = `${N8N_WEBHOOK_URL}/webhook/upload-podcast`;
    console.log(`🔗 Sending to n8n: ${n8nUrl}`);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_WEBHOOK_KEY && { "x-n8n-webhook-key": N8N_WEBHOOK_KEY }),
      },
      body: JSON.stringify({
        userId,
        title,
        description: description || "",
        duration: duration || "",
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        filename: video.name,
        mimeType: video.mimetype,
        fileData: base64Data,
      }),
    });

    // 6) Limpiar archivo temporal
    try {
      await fs.unlink(video.tempFilePath);
      console.log(`🧹 Temp file cleaned: ${video.tempFilePath}`);
    } catch (cleanupError) {
      console.error(`⚠️ Failed to clean temp file:`, cleanupError);
    }

    // 7) Verificar respuesta de n8n
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`❌ n8n error (${n8nResponse.status}):`, errorText);

      res.status(n8nResponse.status).json({
        success: false,
        message: `Error de n8n: ${n8nResponse.statusText}`,
        details: errorText,
      });
      return;
    }

    const result = await n8nResponse.json();
    console.log(`✅ n8n response:`, result);

    // 8) Guardar en base de datos
    const podcast = await prisma.podcast.create({
      data: {
        title,
        description: description || "",
        videoUrl: result.videoUrl,
        duration: parseInt(duration) || 0,
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        createdBy: userId,
      },
    });

    console.log(`💾 Podcast saved to DB:`, podcast.id);

    res.status(HTTP_CODE.OK).json({
      success: true,
      message: "Podcast subido exitosamente",
      podcast,
    });
  } catch (error) {
    console.error(`❌ Upload error:`, error);

    try {
      await fs.unlink(video.tempFilePath);
    } catch {}

    res.status(HTTP_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
