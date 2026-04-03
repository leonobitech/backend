import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import {
  submitGraduateProjectService,
  listGraduatesAdminService,
  verifyGraduateService,
  listPublicGraduatesService,
  getPublicGraduateService,
} from "@services/lms/graduate.service";

// =============================================================================
// Student
// =============================================================================

export const submitProject = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const userId = req.userId as string;
  const courseSlug = req.params.courseSlug as string;
  const { projectTitle, projectDescription, projectDemoUrl, projectScreenshots } = req.body;

  if (!projectTitle || !projectDescription) {
    throw new HttpException(
      HTTP_CODE.BAD_REQUEST,
      getErrorMessage("INVALID_INPUT", lang),
      ERROR_CODE.INVALID_INPUT,
      [{ field: "projectTitle", message: "Title and description are required" }]
    );
  }

  const graduate = await submitGraduateProjectService(userId, courseSlug, {
    projectTitle,
    projectDescription,
    projectDemoUrl,
    projectScreenshots,
  });

  return void res.status(HTTP_CODE.CREATED).json({
    status: "created",
    data: graduate,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Admin
// =============================================================================

export const listGraduatesAdmin = catchErrors(async (req: Request, res: Response) => {
  const verified = req.query.verified === "true" ? true : req.query.verified === "false" ? false : undefined;
  const graduates = await listGraduatesAdminService(verified);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: graduates,
    timestamp: new Date().toISOString(),
  });
});

export const verifyGraduate = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { verified } = req.body;
  const graduate = await verifyGraduateService(id, verified === true);

  return void res.status(HTTP_CODE.OK).json({
    status: "updated",
    data: graduate,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Public
// =============================================================================

export const listPublicGraduates = catchErrors(async (_req: Request, res: Response) => {
  const graduates = await listPublicGraduatesService();

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: graduates,
    timestamp: new Date().toISOString(),
  });
});

export const getPublicGraduate = catchErrors(async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const graduate = await getPublicGraduateService(slug);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: graduate,
    timestamp: new Date().toISOString(),
  });
});
