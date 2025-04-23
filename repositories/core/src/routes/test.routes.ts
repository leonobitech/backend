// routes/test.routes.ts
import { Router } from "express";
import testController from "@controllers/test.controllers"; // Importa el controlador

const testRouter = Router();

// Route's Test Errors
testRouter.get("/test-error", testController); // Route for the user validation controller

export default testRouter;
