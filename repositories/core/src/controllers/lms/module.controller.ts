import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { getErrorMessage } from "@utils/request/getErrorMessage";
import { SupportedLang } from "@constants/errorMessages";
import HttpException from "@utils/http/HttpException";
import catchErrors from "@utils/http/catchErrors";
import { createModuleSchema, updateModuleSchema, reorderSchema } from "@schemas/lmsSchemas";
import {
  createModuleService,
  updateModuleService,
  deleteModuleService,
  reorderModulesService,
} from "@services/lms/module.service";

export const createModule = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = createModuleSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const courseId = req.params.courseId as string;
  const module = await createModuleService(courseId, parsed.data);
  return void res.status(HTTP_CODE.CREATED).json({
    status: "created",
    message: "Module created successfully",
    data: module,
    timestamp: new Date().toISOString(),
  });
});

export const updateModule = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = updateModuleSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  const id = req.params.id as string;
  const module = await updateModuleService(id, parsed.data);
  return void res.status(HTTP_CODE.OK).json({
    status: "updated",
    message: "Module updated successfully",
    data: module,
    timestamp: new Date().toISOString(),
  });
});

export const deleteModule = catchErrors(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteModuleService(id);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Module deleted successfully",
    timestamp: new Date().toISOString(),
  });
});

export const reorderModules = catchErrors(async (req: Request, res: Response) => {
  const lang = (req.headers["accept-language"]?.split(",")[0] || "en") as SupportedLang;
  const parsed = reorderSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    throw new HttpException(HTTP_CODE.BAD_REQUEST, getErrorMessage("INVALID_INPUT", lang), ERROR_CODE.INVALID_INPUT, errors);
  }

  await reorderModulesService(parsed.data.items);
  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    message: "Modules reordered successfully",
    timestamp: new Date().toISOString(),
  });
});
