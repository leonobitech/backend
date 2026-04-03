import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";
import type { CourseStatus } from "@prisma/client";

// =============================================================================
// Admin — Course CRUD
// =============================================================================

export const createCourseService = async (data: {
  title: string;
  slug: string;
  description: string;
  thumbnailUrl?: string;
  price: number;
  currency: string;
}) => {
  const existing = await prisma.course.findUnique({ where: { slug: data.slug } });
  appAssert(!existing, HTTP_CODE.CONFLICT, "A course with this slug already exists", ERROR_CODE.CONFLICT);

  const course = await prisma.course.create({
    data: {
      title: data.title,
      slug: data.slug,
      description: data.description,
      thumbnailUrl: data.thumbnailUrl || null,
      price: data.price,
      currency: data.currency,
    },
  });

  logger.info("Course created", { courseId: course.id, slug: course.slug, event: "lms.course.created" });
  return course;
};

export const listCoursesService = async (includeUnpublished = false) => {
  const where = includeUnpublished ? {} : { status: "PUBLISHED" as CourseStatus };

  return prisma.course.findMany({
    where,
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, slug: true, type: true, duration: true, order: true } },
        },
      },
      _count: { select: { enrollments: true, graduates: true } },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getCourseByIdService = async (id: string) => {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
        },
      },
      _count: { select: { enrollments: true, graduates: true } },
    },
  });

  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);
  return course;
};

export const getCourseBySlugService = async (slug: string) => {
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, slug: true, type: true, duration: true, order: true, description: true },
          },
        },
      },
      _count: { select: { enrollments: true, graduates: true } },
    },
  });

  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);
  return course;
};

export const updateCourseService = async (id: string, data: Partial<{
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string;
  price: number;
  currency: string;
}>) => {
  const course = await prisma.course.findUnique({ where: { id } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  if (data.slug && data.slug !== course.slug) {
    const slugTaken = await prisma.course.findUnique({ where: { slug: data.slug } });
    appAssert(!slugTaken, HTTP_CODE.CONFLICT, "Slug already taken", ERROR_CODE.CONFLICT);
  }

  const updated = await prisma.course.update({ where: { id }, data });
  logger.info("Course updated", { courseId: id, event: "lms.course.updated" });
  return updated;
};

export const publishCourseService = async (id: string) => {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { modules: { include: { lessons: true } } },
  });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
  appAssert(totalLessons > 0, HTTP_CODE.BAD_REQUEST, "Course must have at least one lesson to publish", ERROR_CODE.BAD_REQUEST);

  const updated = await prisma.course.update({
    where: { id },
    data: { status: "PUBLISHED" },
  });

  logger.info("Course published", { courseId: id, event: "lms.course.published" });
  return updated;
};

export const archiveCourseService = async (id: string) => {
  const course = await prisma.course.findUnique({ where: { id } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const updated = await prisma.course.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });

  logger.info("Course archived", { courseId: id, event: "lms.course.archived" });
  return updated;
};
