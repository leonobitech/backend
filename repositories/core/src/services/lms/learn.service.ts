import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";

// =============================================================================
// My Courses — list enrolled courses with progress %
// =============================================================================

export const myCoursesService = async (userId: string) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                select: { id: true, title: true, slug: true, type: true, duration: true, order: true },
              },
            },
          },
        },
      },
      progress: true,
    },
    orderBy: { enrolledAt: "desc" },
  });

  return enrollments.map((enrollment) => {
    const totalLessons = enrollment.course.modules.reduce(
      (acc, m) => acc + m.lessons.length,
      0
    );
    const completedLessons = enrollment.progress.filter((p) => p.completed).length;
    const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    return {
      id: enrollment.id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      progressPercent,
      completedLessons,
      totalLessons,
      course: {
        id: enrollment.course.id,
        title: enrollment.course.title,
        slug: enrollment.course.slug,
        thumbnailUrl: enrollment.course.thumbnailUrl,
        modules: enrollment.course.modules,
      },
    };
  });
};

// =============================================================================
// Course Content — full course with progress per lesson
// =============================================================================

export const courseContentService = async (userId: string, courseSlug: string) => {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
    include: { progress: true },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);

  const progressMap = new Map(
    enrollment.progress.map((p) => [p.lessonId, p])
  );

  return {
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      modules: course.modules.map((mod) => ({
        id: mod.id,
        title: mod.title,
        order: mod.order,
        lessons: mod.lessons.map((lesson) => {
          const progress = progressMap.get(lesson.id);
          return {
            ...lesson,
            completed: progress?.completed || false,
            completedAt: progress?.completedAt || null,
          };
        }),
      })),
    },
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
    },
  };
};

// =============================================================================
// Lesson Content — single lesson with video URL
// =============================================================================

export const lessonContentService = async (
  userId: string,
  courseSlug: string,
  lessonSlug: string
) => {
  const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);

  // Find lesson by slug across all modules
  const lesson = await prisma.lesson.findFirst({
    where: {
      slug: lessonSlug,
      module: { courseId: course.id },
    },
    include: { module: { select: { title: true, order: true } } },
  });
  appAssert(lesson, HTTP_CODE.NOT_FOUND, "Lesson not found", ERROR_CODE.NOT_FOUND);

  // Get progress
  const progress = await prisma.progress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
  });

  return {
    lesson: {
      ...lesson,
      completed: progress?.completed || false,
      completedAt: progress?.completedAt || null,
    },
    enrollmentId: enrollment.id,
  };
};

// =============================================================================
// Mark Lesson Complete
// =============================================================================

export const completeLessonService = async (userId: string, lessonId: string) => {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { select: { courseId: true } } },
  });
  appAssert(lesson, HTTP_CODE.NOT_FOUND, "Lesson not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lesson.module.courseId } },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);

  await prisma.progress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: {
      enrollmentId: enrollment.id,
      lessonId,
      completed: true,
      completedAt: new Date(),
    },
    update: {
      completed: true,
      completedAt: new Date(),
    },
  });

  // Check if all lessons completed → mark enrollment as COMPLETED
  const courseId = lesson.module.courseId;
  const totalLessons = await prisma.lesson.count({
    where: { module: { courseId } },
  });
  const completedLessons = await prisma.progress.count({
    where: { enrollmentId: enrollment.id, completed: true },
  });

  if (completedLessons >= totalLessons && enrollment.status === "ACTIVE") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    logger.info("Course completed", { userId, courseId, event: "lms.course.completed" });
  }

  logger.info("Lesson completed", { userId, lessonId, event: "lms.lesson.completed" });

  return { completed: true, completedLessons, totalLessons };
};
