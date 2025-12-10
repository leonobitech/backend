import { Router } from "express";
import { getPodcasts, getPodcastById } from "@controllers/podcast.controller";

const podcastRouter = Router();

/**
 * 📻 GET /podcasts
 * Public endpoint - returns all podcasts ordered by publishedAt desc
 */
podcastRouter.get("/", getPodcasts);

/**
 * 📻 GET /podcasts/:id
 * Public endpoint - returns single podcast by ID
 */
podcastRouter.get("/:id", getPodcastById);

export default podcastRouter;
