import { Router } from "express";
import debugHandler from "@controllers/devDebug.controllers";

const devDebugRoutes = Router();

devDebugRoutes.get("/debug", debugHandler); // 🧪 Health check de tipos

export default devDebugRoutes;
