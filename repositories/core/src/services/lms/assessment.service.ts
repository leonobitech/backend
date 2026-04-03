import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";

// =============================================================================
// Types
// =============================================================================

interface Question {
  id: string;
  text: string;
  type: "multiple_choice" | "true_false";
  options: string[];
  correctAnswer: number; // index of correct option
}

// =============================================================================
// Admin — CRUD Assessments
// =============================================================================

export const createAssessmentService = async (
  courseId: string,
  data: { title: string; questions: Question[]; passingScore?: number }
) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const assessment = await prisma.assessment.create({
    data: {
      courseId,
      title: data.title,
      questions: data.questions as any,
      passingScore: data.passingScore ?? 70,
    },
  });

  logger.info("Assessment created", { assessmentId: assessment.id, courseId, event: "lms.assessment.created" });
  return assessment;
};

export const getAssessmentService = async (id: string) => {
  const assessment = await prisma.assessment.findUnique({ where: { id } });
  appAssert(assessment, HTTP_CODE.NOT_FOUND, "Assessment not found", ERROR_CODE.NOT_FOUND);
  return assessment;
};

export const updateAssessmentService = async (
  id: string,
  data: Partial<{ title: string; questions: Question[]; passingScore: number }>
) => {
  const assessment = await prisma.assessment.findUnique({ where: { id } });
  appAssert(assessment, HTTP_CODE.NOT_FOUND, "Assessment not found", ERROR_CODE.NOT_FOUND);

  const updated = await prisma.assessment.update({
    where: { id },
    data: data as any,
  });

  logger.info("Assessment updated", { assessmentId: id, event: "lms.assessment.updated" });
  return updated;
};

export const deleteAssessmentService = async (id: string) => {
  const assessment = await prisma.assessment.findUnique({ where: { id } });
  appAssert(assessment, HTTP_CODE.NOT_FOUND, "Assessment not found", ERROR_CODE.NOT_FOUND);

  await prisma.assessment.delete({ where: { id } });
  logger.info("Assessment deleted", { assessmentId: id, event: "lms.assessment.deleted" });
};

// =============================================================================
// Student — Access + Submit Assessment
// =============================================================================

export const getStudentAssessmentService = async (userId: string, courseSlug: string) => {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    include: { assessments: true },
  });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);

  // Check all lessons completed
  const totalLessons = await prisma.lesson.count({
    where: { module: { courseId: course.id } },
  });
  const completedLessons = await prisma.progress.count({
    where: { enrollmentId: enrollment.id, completed: true },
  });
  appAssert(
    completedLessons >= totalLessons,
    HTTP_CODE.FORBIDDEN,
    "You must complete all lessons before taking the assessment",
    ERROR_CODE.FORBIDDEN
  );

  const assessment = course.assessments[0];
  appAssert(assessment, HTTP_CODE.NOT_FOUND, "No assessment available for this course", ERROR_CODE.NOT_FOUND);

  // Get previous attempts
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { enrollmentId: enrollment.id, assessmentId: assessment.id },
    orderBy: { completedAt: "desc" },
  });

  // Return questions WITHOUT correct answers
  const questions = (assessment.questions as unknown as Question[]).map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options,
  }));

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      passingScore: assessment.passingScore,
      questionCount: questions.length,
      questions,
    },
    attempts,
    enrollmentId: enrollment.id,
  };
};

export const submitAssessmentService = async (
  userId: string,
  assessmentId: string,
  answers: Record<string, number> // { questionId: selectedOptionIndex }
) => {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  appAssert(assessment, HTTP_CODE.NOT_FOUND, "Assessment not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: assessment.courseId } },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);

  // Grade
  const questions = assessment.questions as unknown as Question[];
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctAnswer) {
      correct++;
    }
  }
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= assessment.passingScore;

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      enrollmentId: enrollment.id,
      assessmentId,
      answers: answers as any,
      score,
      passed,
    },
  });

  // If passed, mark enrollment as COMPLETED
  if (passed && enrollment.status === "ACTIVE") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    logger.info("Course completed via assessment", {
      userId,
      courseId: assessment.courseId,
      score,
      event: "lms.assessment.passed",
    });
  }

  logger.info("Assessment submitted", {
    userId,
    assessmentId,
    score,
    passed,
    event: "lms.assessment.submitted",
  });

  return {
    score,
    passed,
    correct,
    total: questions.length,
    passingScore: assessment.passingScore,
    attemptId: attempt.id,
  };
};
