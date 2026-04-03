import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import { createLessonSchema, updateLessonSchema, reorderSchema } from "@schemas/lmsSchemas";
import {
  createLessonService,
  updateLessonService,
  deleteLessonService,
  reorderLessonsService,
} from "@services/lms/lesson.service";

export const createLesson = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = createLessonSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const moduleId = req.params.moduleId as string;
  const lesson = await createLessonService(moduleId, parsed.data);
  return void res.status(HTTP_CODE.CREATED).json({
    status: "created",
    message: "Lesson created successfully",
    data: lesson,
    timestamp: new Date().toISOString(),
  });
});

export const updateLesson = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = updateLessonSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const id = req.params.id as string;
  const lesson = await updateLessonService(id, parsed.data);
  return void res.status(HTTP_CODE.OK).json({
    status: "updated",
    message: "Lesson updated successfully",
    data: lesson,
    timestamp: new Date().toISOString(),
  });
});

export const deleteLesson = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteLessonService(id);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Lesson deleted successfully",
    timestamp: new Date().toISOString(),
  });
});

export const reorderLessons = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = reorderSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  await reorderLessonsService(parsed.data.items);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Lessons reordered successfully",
    timestamp: new Date().toISOString(),
  });
});
