import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { prisma } from "@config/prisma";

/**
 * Get all podcasts (public endpoint)
 * GET /podcasts
 */
export const getPodcasts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const podcasts = await prisma.podcast.findMany({
      orderBy: { publishedAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    res.status(HTTP_CODE.OK).json({
      success: true,
      podcasts,
    });
  } catch (error) {
    console.error("❌ Error fetching podcasts:", error);
    res.status(HTTP_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error al obtener los podcasts",
    });
  }
};

/**
 * Get single podcast by ID (public endpoint)
 * GET /podcasts/:id
 */
export const getPodcastById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    const podcast = await prisma.podcast.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    if (!podcast) {
      res.status(HTTP_CODE.NOT_FOUND).json({
        success: false,
        message: "Podcast no encontrado",
      });
      return;
    }

    res.status(HTTP_CODE.OK).json({
      success: true,
      podcast,
    });
  } catch (error) {
    console.error("❌ Error fetching podcast:", error);
    res.status(HTTP_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error al obtener el podcast",
    });
  }
};
