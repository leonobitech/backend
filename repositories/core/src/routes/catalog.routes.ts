import { Router } from "express";
import { listPublicCourses, getPublicCourse } from "@controllers/lms/course.controller";

const catalogRouter = Router();

// Public endpoints — no auth required
catalogRouter.get("/", listPublicCourses);
catalogRouter.get("/:slug", getPublicCourse);

export default catalogRouter;
