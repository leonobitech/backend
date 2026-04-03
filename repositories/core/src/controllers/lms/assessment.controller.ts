import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import {
  createAssessmentService,
  getAssessmentService,
  updateAssessmentService,
  deleteAssessmentService,
  getStudentAssessmentService,
  submitAssessmentService,
} from "@services/lms/assessment.service";

// =============================================================================
// Admin Controllers
// =============================================================================

export const createAssessment = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const courseId = req.params.courseId as string;
  const { title, questions, passingScore } = req.body;

  if (!title || !questions || !Array.isArray(questions)) {
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT);
  }

  const assessment = await createAssessmentService(courseId, { title, questions, passingScore });

  return void res.status(HTTP_CODE.CREATED).json({
    status: "created",
    data: assessment,
    timestamp: new Date().toISOString(),
  });
});

export const getAssessment = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const assessment = await getAssessmentService(id);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: assessment,
    timestamp: new Date().toISOString(),
  });
});

export const updateAssessment = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const assessment = await updateAssessmentService(id, req.body);

  return void res.status(HTTP_CODE.OK).json({
    status: "updated",
    data: assessment,
    timestamp: new Date().toISOString(),
  });
});

export const deleteAssessment = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteAssessmentService(id);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Assessment deleted",
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Student Controllers
// =============================================================================

export const getStudentAssessment = catchErrors(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const courseSlug = req.params.courseSlug as string;
  const data = await getStudentAssessmentService(userId, courseSlug);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data,
    timestamp: new Date().toISOString(),
  });
});

export const submitStudentAssessment = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const userId = req.userId as string;
  const assessmentId = req.params.assessmentId as string;
  const { answers } = req.body;

  if (!answers || typeof answers !== "object") {
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT);
  }

  const result = await submitAssessmentService(userId, assessmentId, answers);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: result,
    timestamp: new Date().toISOString(),
  });
});
