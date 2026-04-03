import { Router } from "express";
import { createCourse, listCourses, getCourse, updateCourse, deleteCourse, publishCourse } from "@controllers/lms/course.controller";
import { createModule, updateModule, deleteModule, reorderModules } from "@controllers/lms/module.controller";
import { createLesson, updateLesson, deleteLesson, reorderLessons } from "@controllers/lms/lesson.controller";
import { listEnrollments } from "@controllers/lms/enrollment.controller";
import { createAssessment, getAssessment, updateAssessment, deleteAssessment } from "@controllers/lms/assessment.controller";

const lmsRouter = Router();

// =============================================================================
// Courses
// =============================================================================

lmsRouter.post("/courses", createCourse);
lmsRouter.get("/courses", listCourses);
lmsRouter.get("/courses/:id", getCourse);
lmsRouter.put("/courses/:id", updateCourse);
lmsRouter.delete("/courses/:id", deleteCourse);
lmsRouter.post("/courses/:id/publish", publishCourse);

// =============================================================================
// Modules
// =============================================================================

lmsRouter.post("/courses/:courseId/modules", createModule);
lmsRouter.put("/modules/:id", updateModule);
lmsRouter.delete("/modules/:id", deleteModule);
lmsRouter.put("/courses/:courseId/reorder-modules", reorderModules);

// =============================================================================
// Lessons
// =============================================================================

lmsRouter.post("/modules/:moduleId/lessons", createLesson);
lmsRouter.put("/lessons/:id", updateLesson);
lmsRouter.delete("/lessons/:id", deleteLesson);
lmsRouter.put("/modules/:moduleId/reorder-lessons", reorderLessons);

// =============================================================================
// Enrollments (admin view)
// =============================================================================

lmsRouter.get("/enrollments", listEnrollments);

// =============================================================================
// Assessments (admin CRUD)
// =============================================================================

lmsRouter.post("/courses/:courseId/assessments", createAssessment);
lmsRouter.get("/assessments/:id", getAssessment);
lmsRouter.put("/assessments/:id", updateAssessment);
lmsRouter.delete("/assessments/:id", deleteAssessment);

export default lmsRouter;
