import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import fs from "fs/promises";
import path from "path";

// n8n internal Docker URL (comunicación por red interna)
const N8N_WEBHOOK_URL = process.env.N8N_INTERNAL_URL || "http://n8n_webhook_1:5678";
const N8N_WEBHOOK_KEY = process.env.N8N_WEBHOOK_KEY || "";

// Directorio temporal para archivos
const TEMP_DIR = path.join(process.cwd(), "temp-uploads");

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
  const { title, artist, description, duration } = req.body;

  // Validar campos requeridos
  if (!title || !artist) {
    try {
      await fs.unlink(video.tempFilePath);
    } catch {}

    res.status(HTTP_CODE.BAD_REQUEST).json({
      success: false,
      message: "title y artist son requeridos",
    });
    return;
  }

  try {
    console.log(`📤 Uploading podcast: ${title} by ${artist}`);
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
        artist,
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
    console.log(`✅ Podcast uploaded successfully:`, result);

    res.status(HTTP_CODE.OK).json({
      success: true,
      message: "Podcast subido exitosamente",
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      duration: result.duration,
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
