import { Request } from "express";

export const getLogContext = (
  req: Request,
  options = { includeHeaders: false }
) => {
  const base = {
    ...(req.meta || {}), // ✅ prioridad absoluta al meta inyectado
    userId: req.userId || null,
  };

  if (options.includeHeaders) {
    return {
      ...base,
      headers: req.headers,
    };
  }

  return base;
};
