import { RequestHandler } from "express";

const supportedLanguages = ["en", "es"] as const;

export const detectLanguage: RequestHandler = (req, _res, next) => {
  const rawLang = req.headers["accept-language"]?.split(",")[0]?.trim() || "en";

  // Validar contra idiomas soportados
  req.lang = supportedLanguages.includes(rawLang as any) ? rawLang : "en";

  next();
};
