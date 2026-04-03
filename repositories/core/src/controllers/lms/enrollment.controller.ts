import { Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import catchErrors from "@utils/http/catchErrors";
import { listEnrollmentsService } from "@services/lms/enrollment.service";

export const listEnrollments = catchErrors(async (req: Request, res: Response) => {
  const courseId = req.query.courseId as string | undefined;
  const enrollments = await listEnrollmentsService(courseId);

  return void res.status(HTTP_CODE.OK).json({
    status: "success",
    data: enrollments,
    timestamp: new Date().toISOString(),
  });
});
