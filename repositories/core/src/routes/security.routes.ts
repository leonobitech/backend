// src/routes/security.routes.ts
import { Router, Request, Response } from "express";
import { HTTP_CODE } from "@constants/httpCode";
import { UserRole } from "@constants/userRole";
import { SupportedLang } from "@constants/errorMessages";
import { Audience } from "@constants/audience";
import HttpException from "@utils/http/HttpException";
import { verifyToken } from "@utils/auth/jwt";

const securityRoutes = Router();

securityRoutes.get(
  "/forward-verify-admin",
  async (req: Request, res: Response) => {
    // 1️⃣ Locale multilanguage
    const rawLang = req.headers["accept-language"];
    const lang =
      ((Array.isArray(rawLang)
        ? rawLang[0]
        : rawLang?.split(",")[0]) as SupportedLang) || "en";

    // 2️⃣ Extraemos el JWE (accessKey)
    const jwe = req.cookies.accessKey;
    if (!jwe) {
      res
        .status(HTTP_CODE.UNAUTHORIZED)
        .send("Unauthorized – missing accessKey");
      return;
    }

    try {
      // 3️⃣ Verificamos token JOSE / Zod
      const { payload } = await verifyToken(jwe, lang);

      // 4️⃣ Chequeo audience = access
      if (payload.aud !== Audience.Access) {
        res
          .status(HTTP_CODE.FORBIDDEN)
          .send("Forbidden – invalid token audience");
        return;
      }

      // 5️⃣ Rol admin
      if (payload.role !== UserRole.Admin) {
        res.status(HTTP_CODE.FORBIDDEN).send("Forbidden – admin role required");
        return;
      }

      // 6️⃣ OK para Traefik
      res.sendStatus(HTTP_CODE.OK);
      return;
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        res.status(err.statusCode).send(err.message);
        return;
      }
      // cualquier otro error → 401
      res.status(HTTP_CODE.UNAUTHORIZED).send("Unauthorized");
      return;
    }
  }
);

export default securityRoutes;
