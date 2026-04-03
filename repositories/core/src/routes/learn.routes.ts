import { Router } from "express";
import {
  myCourses,
  getCourseContent,
  getLessonContent,
  completeLesson,
} from "@controllers/lms/learn.controller";
import { getStudentAssessment, submitStudentAssessment } from "@controllers/lms/assessment.controller";

const learnRouter = Router();

// All routes require authentication (applied in index.ts)
learnRouter.get("/courses", myCourses);
learnRouter.get("/courses/:slug", getCourseContent);
learnRouter.get("/courses/:courseSlug/lessons/:lessonSlug", getLessonContent);
learnRouter.post("/lessons/:lessonId/complete", completeLesson);

// Assessments (student)
learnRouter.get("/courses/:courseSlug/assessment", getStudentAssessment);
learnRouter.post("/assessments/:assessmentId/submit", submitStudentAssessment);

export default learnRouter;
