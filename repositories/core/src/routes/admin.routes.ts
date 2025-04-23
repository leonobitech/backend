import { Router } from "express";
import { getAdminInfo } from "@controllers/admin.controller";

const adminRouter = Router();

// Solo los administradores pueden acceder a este panel
adminRouter.get("/info", getAdminInfo);

export default adminRouter;
