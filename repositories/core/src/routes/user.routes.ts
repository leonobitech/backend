// src/routes/userRoutes.ts
import { Router } from "express";
import { getMe, updateProfile, changePassword } from "@controllers/user.controllers";

const userRoutes = Router();

// 🌐 prefix: /account

// ✅ GET /account/me
userRoutes.post("/me", getMe);

// ✅ PATCH /account/profile
userRoutes.patch("/profile", updateProfile);

// ✅ POST /account/password/change
userRoutes.post("/password/change", changePassword);

export default userRoutes;
