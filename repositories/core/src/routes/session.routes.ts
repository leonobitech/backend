import { Router } from "express";
import {
  getActiveSessions,
  deleteSession,
  deleteAllOtherSessions,
} from "@controllers/session.controllers";

const sessionRoutes = Router();

// prefix: /account/sessions

// ✅ Ver todas las sesiones activas del usuario
sessionRoutes.post("/", getActiveSessions);

// ✅ Cerrar una sesión específica (no la actual)
sessionRoutes.delete("/:sessionId", deleteSession);

// ✅ Cerrar todas las sesiones excepto la actual
sessionRoutes.delete("/all", deleteAllOtherSessions);

export default sessionRoutes;
