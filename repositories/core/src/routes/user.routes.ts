// src/routes/userRoutes.ts
import { Router } from "express";
import { getMe, updateProfile, changePassword, updateAvatarFromN8n } from "@controllers/user.controllers";
import { apiKeyGuard } from "@middlewares/apiKey";

const userRoutes = Router();

// 🌐 prefix: /account

// ✅ GET /account/me
userRoutes.post("/me", getMe);

// ✅ PATCH /account/profile
userRoutes.patch("/profile", updateProfile);

// ✅ POST /account/password/change
userRoutes.post("/password/change", changePassword);

// ✅ PATCH /account/avatar/update-from-n8n (Protected by API Key, no auth required)
userRoutes.patch("/avatar/update-from-n8n", apiKeyGuard, updateAvatarFromN8n);

export default userRoutes;
