import prisma from "@config/prisma";
import logger from "@utils/logging/logger";

export const listEnrollmentsService = async (courseId?: string) => {
  const where = courseId ? { courseId } : {};

  return prisma.enrollment.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, avatar: true } },
      course: { select: { id: true, title: true, slug: true } },
      _count: { select: { progress: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });
};
