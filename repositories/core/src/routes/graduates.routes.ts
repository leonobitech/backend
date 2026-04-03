import { Router } from "express";
import { listPublicGraduates, getPublicGraduate } from "@controllers/lms/graduate.controller";

const graduatesRouter = Router();

// Public endpoints — no auth required
graduatesRouter.get("/", listPublicGraduates);
graduatesRouter.get("/:slug", getPublicGraduate);

export default graduatesRouter;
