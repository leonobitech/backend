import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import {
  myCoursesService,
  courseContentService,
  lessonContentService,
  completeLessonService,
} from "@services/lms/learn.service";

export const myCourses = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const courses = await myCoursesService(userId);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: courses,
    timestamp: new Date().toISOString(),
  });
});

export const getCourseContent = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const slug = req.params.slug as string;
  const data = await courseContentService(userId, slug);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data,
    timestamp: new Date().toISOString(),
  });
});

export const getLessonContent = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const courseSlug = req.params.courseSlug as string;
  const lessonSlug = req.params.lessonSlug as string;
  const data = await lessonContentService(userId, courseSlug, lessonSlug);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data,
    timestamp: new Date().toISOString(),
  });
});

export const completeLesson = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const lessonId = req.params.lessonId as string;

  if (!lessonId) {
    throw new HttpException(HTTP_CODE.BAD_REQUEST, "Lesson ID is required", ERROR_CODE.INVALID_INPUT);
  }

  const result = await completeLessonService(userId, lessonId);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: result,
    timestamp: new Date().toISOString(),
  });
});
