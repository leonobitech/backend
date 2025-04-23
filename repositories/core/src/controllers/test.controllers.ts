// controllers/test.controller.ts
import { Request, Response } from "express";
import catchErrors from "@utils/http/catchErrors";
import { HTTP_CODE } from "@constants/httpCode";
import HttpException from "@utils/http/HttpException";
import { ERROR_CODE } from "@constants/errorCode";
import { SupportedLang } from "@constants/errorMessages";
import { getRequestMeta } from "@utils/request/getRequestMeta";
import { getErrorMessage } from "@utils/request/getErrorMessage";

//Testing the error handler, through the HttpException class capturing the route handler:
const testController = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    //======================================================================\\
    // error handled by the errorHandler
    const lang = (req.headers["accept-language"]?.split(",")[0] ||
      "en") as SupportedLang;
    const { ipAddress, deviceInfo } = getRequestMeta(req);

    if (!ipAddress && deviceInfo) {
      throw new HttpException(
        HTTP_CODE.BAD_REQUEST,
        getErrorMessage("INTERNAL_SERVER_ERROR", lang),
        ERROR_CODE.BAD_REQUEST
      );
    }

    res.status(HTTP_CODE.OK).json({
      success: true,
      data: { ipAddress, deviceInfo },
      timestamp: new Date(),
    });
    //======================================================================\\
    // error unhandled by the errorHandler
    //throw new Error("This is an unhandled error");
    //======================================================================\\
    //return res.status(OK).json({ "Hello World": "from errorController" });
  }
);

export default testController;
