// src/routes/userRoutes.ts
import { Router } from "express";
import { getMe, updateProfile } from "@controllers/user.controllers";

const userRoutes = Router();

// 🌐 prefix: /account

// ✅ GET /account/me
userRoutes.post("/me", getMe);

// ✅ PATCH /account/profile
userRoutes.patch("/profile", updateProfile);

export default userRoutes;
