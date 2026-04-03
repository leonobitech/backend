import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";
import type { LessonType } from "@prisma/client";

// =============================================================================
// Admin — Lesson CRUD
// =============================================================================

export const createLessonService = async (
  moduleId: string,
  data: {
    title: string;
    slug: string;
    description?: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    type: LessonType;
    content?: string;
  }
) => {
  const module = await prisma.module.findUnique({ where: { id: moduleId } });
  appAssert(module, HTTP_CODE.NOT_FOUND, "Module not found", ERROR_CODE.NOT_FOUND);

  // Check slug uniqueness within module
  const existing = await prisma.lesson.findUnique({
    where: { moduleId_slug: { moduleId, slug: data.slug } },
  });
  appAssert(!existing, HTTP_CODE.CONFLICT, "A lesson with this slug already exists in this module", ERROR_CODE.CONFLICT);

  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      title: data.title,
      slug: data.slug,
      description: data.description || null,
      videoUrl: data.videoUrl || null,
      duration: data.duration || null,
      order: data.order,
      type: data.type,
      content: data.content || null,
    },
  });

  logger.info("Lesson created", { lessonId: lesson.id, moduleId, event: "lms.lesson.created" });
  return lesson;
};

export const updateLessonService = async (
  id: string,
  data: Partial<{
    title: string;
    slug: string;
    description: string;
    videoUrl: string;
    duration: number;
    order: number;
    type: LessonType;
    content: string;
  }>
) => {
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  appAssert(lesson, HTTP_CODE.NOT_FOUND, "Lesson not found", ERROR_CODE.NOT_FOUND);

  if (data.slug && data.slug !== lesson.slug) {
    const slugTaken = await prisma.lesson.findUnique({
      where: { moduleId_slug: { moduleId: lesson.moduleId, slug: data.slug } },
    });
    appAssert(!slugTaken, HTTP_CODE.CONFLICT, "Slug already taken in this module", ERROR_CODE.CONFLICT);
  }

  const updated = await prisma.lesson.update({ where: { id }, data });
  logger.info("Lesson updated", { lessonId: id, event: "lms.lesson.updated" });
  return updated;
};

export const deleteLessonService = async (id: string) => {
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  appAssert(lesson, HTTP_CODE.NOT_FOUND, "Lesson not found", ERROR_CODE.NOT_FOUND);

  await prisma.lesson.delete({ where: { id } });
  logger.info("Lesson deleted", { lessonId: id, moduleId: lesson.moduleId, event: "lms.lesson.deleted" });
};

export const reorderLessonsService = async (items: { id: string; order: number }[]) => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.lesson.update({ where: { id: item.id }, data: { order: item.order } })
    )
  );
  logger.info("Lessons reordered", { count: items.length, event: "lms.lessons.reordered" });
};
