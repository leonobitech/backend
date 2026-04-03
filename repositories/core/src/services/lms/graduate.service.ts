import prisma from "@config/prisma";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import logger from "@utils/logging/logger";

// =============================================================================
// Student — Submit Project
// =============================================================================

export const submitGraduateProjectService = async (
  userId: string,
  courseSlug: string,
  data: {
    projectTitle: string;
    projectDescription: string;
    projectDemoUrl?: string;
    projectScreenshots?: string[];
  }
) => {
  const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
  appAssert(course, HTTP_CODE.NOT_FOUND, "Course not found", ERROR_CODE.NOT_FOUND);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  appAssert(enrollment, HTTP_CODE.FORBIDDEN, "You are not enrolled in this course", ERROR_CODE.FORBIDDEN);
  appAssert(
    enrollment.status === "COMPLETED",
    HTTP_CODE.FORBIDDEN,
    "You must complete the course and pass the assessment before submitting a project",
    ERROR_CODE.FORBIDDEN
  );

  // Check if already submitted
  const existing = await prisma.graduate.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });

  if (existing) {
    // Update existing submission
    const updated = await prisma.graduate.update({
      where: { id: existing.id },
      data: {
        projectTitle: data.projectTitle,
        projectDescription: data.projectDescription,
        projectDemoUrl: data.projectDemoUrl || null,
        projectScreenshots: data.projectScreenshots || [],
        verified: false, // Reset verification on resubmit
        publishedAt: null,
      },
    });
    logger.info("Graduate project resubmitted", { userId, courseId: course.id, event: "lms.graduate.resubmitted" });
    return updated;
  }

  // Generate slug from user name + course slug
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const baseName = (user?.name || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const slug = `${baseName}-${course.slug}`;

  const graduate = await prisma.graduate.create({
    data: {
      userId,
      courseId: course.id,
      slug,
      projectTitle: data.projectTitle,
      projectDescription: data.projectDescription,
      projectDemoUrl: data.projectDemoUrl || null,
      projectScreenshots: data.projectScreenshots || [],
    },
  });

  logger.info("Graduate project submitted", { userId, courseId: course.id, event: "lms.graduate.submitted" });
  return graduate;
};

// =============================================================================
// Admin — List & Verify
// =============================================================================

export const listGraduatesAdminService = async (verified?: boolean) => {
  const where = verified !== undefined ? { verified } : {};

  return prisma.graduate.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, avatar: true } },
      course: { select: { id: true, title: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const verifyGraduateService = async (id: string, verified: boolean) => {
  const graduate = await prisma.graduate.findUnique({ where: { id } });
  appAssert(graduate, HTTP_CODE.NOT_FOUND, "Graduate not found", ERROR_CODE.NOT_FOUND);

  const updated = await prisma.graduate.update({
    where: { id },
    data: {
      verified,
      publishedAt: verified ? new Date() : null,
    },
  });

  logger.info("Graduate verification updated", {
    graduateId: id,
    verified,
    event: verified ? "lms.graduate.verified" : "lms.graduate.unverified",
  });

  return updated;
};

// =============================================================================
// Public — Directory
// =============================================================================

export const listPublicGraduatesService = async () => {
  return prisma.graduate.findMany({
    where: { verified: true },
    include: {
      user: { select: { name: true, avatar: true } },
      course: { select: { title: true, slug: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
};

export const getPublicGraduateService = async (slug: string) => {
  const graduate = await prisma.graduate.findUnique({
    where: { slug },
    include: {
      user: { select: { name: true, avatar: true, bio: true, website: true, socialTwitter: true, socialGithub: true, socialInstagram: true } },
      course: { select: { title: true, slug: true, description: true } },
    },
  });
  appAssert(graduate, HTTP_CODE.NOT_FOUND, "Graduate not found", ERROR_CODE.NOT_FOUND);
  appAssert(graduate.verified, HTTP_CODE.NOT_FOUND, "Graduate not published", ERROR_CODE.NOT_FOUND);

  return graduate;
};
