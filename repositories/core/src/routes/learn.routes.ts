import { Router } from "express";
import {
  myCourses,
  getCourseContent,
  getLessonContent,
  completeLesson,
} from "@controllers/lms/learn.controller";

const learnRouter = Router();

// All routes require authentication (applied in index.ts)
learnRouter.get("/courses", myCourses);
learnRouter.get("/courses/:slug", getCourseContent);
learnRouter.get("/courses/:courseSlug/lessons/:lessonSlug", getLessonContent);
learnRouter.post("/lessons/:lessonId/complete", completeLesson);

export default learnRouter;
