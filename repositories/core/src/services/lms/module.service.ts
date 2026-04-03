import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";

// =============================================================================
// Admin — Module CRUD
// =============================================================================

export const createModuleService = async (courseId: string, data: { title: string; order: number }) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const module = await prisma.module.create({
    data: {
      courseId,
      title: data.title,
      order: data.order,
    },
  });

  logger.info("Module created", { moduleId: module.id, courseId, event: "lms.module.created" });
  return module;
};

export const updateModuleService = async (id: string, data: Partial<{ title: string; order: number }>) => {
  const module = await prisma.module.findUnique({ where: { id } });
  appAssert(module, HTTP_CODE.NOT_FOUND, "Module not found", ERROR_CODE.NOT_FOUND);

  const updated = await prisma.module.update({ where: { id }, data });
  logger.info("Module updated", { moduleId: id, event: "lms.module.updated" });
  return updated;
};

export const deleteModuleService = async (id: string) => {
  const module = await prisma.module.findUnique({ where: { id } });
  appAssert(module, HTTP_CODE.NOT_FOUND, "Module not found", ERROR_CODE.NOT_FOUND);

  await prisma.module.delete({ where: { id } });
  logger.info("Module deleted", { moduleId: id, courseId: module.courseId, event: "lms.module.deleted" });
};

export const reorderModulesService = async (items: { id: string; order: number }[]) => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.module.update({ where: { id: item.id }, data: { order: item.order } })
    )
  );
  logger.info("Modules reordered", { count: items.length, event: "lms.modules.reordered" });
};
