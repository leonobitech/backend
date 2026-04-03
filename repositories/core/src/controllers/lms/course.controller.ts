import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import { createCourseSchema, updateCourseSchema } from "@schemas/lmsSchemas";
import {
  createCourseService,
  listCoursesService,
  getCourseByIdService,
  getCourseBySlugService,
  updateCourseService,
  publishCourseService,
  archiveCourseService,
} from "@services/lms/course.service";

// =============================================================================
// Admin Controllers
// =============================================================================

export const createCourse = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = createCourseSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const course = await createCourseService(parsed.data);
  return void res.status(HTTP_CODE.CREATED).json({
    status: "created",
    message: "Course created successfully",
    data: course,
    timestamp: new Date().toISOString(),
  });
});

export const listCourses = catchErrors(async (req: Request, res: Response) => {
  const courses = await listCoursesService(true); // Admin sees all
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: courses,
    timestamp: new Date().toISOString(),
  });
});

export const getCourse = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const course = await getCourseByIdService(id);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: course,
    timestamp: new Date().toISOString(),
  });
});

export const updateCourse = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const id = req.params.id as string;
  const parsed = updateCourseSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const course = await updateCourseService(id, parsed.data);
  return void res.status(HTTP_CODE.OK).json({
    status: "updated",
    message: "Course updated successfully",
    data: course,
    timestamp: new Date().toISOString(),
  });
});

export const deleteCourse = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await archiveCourseService(id);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Course archived successfully",
    timestamp: new Date().toISOString(),
  });
});

export const publishCourse = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const course = await publishCourseService(id);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Course published successfully",
    data: course,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Public Controllers
// =============================================================================

export const listPublicCourses = catchErrors(async (_req: Request, res: Response) => {
  const courses = await listCoursesService(false); // Only published
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: courses,
    timestamp: new Date().toISOString(),
  });
});

export const getPublicCourse = catchErrors(async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const course = await getCourseBySlugService(slug);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: course,
    timestamp: new Date().toISOString(),
  });
});
