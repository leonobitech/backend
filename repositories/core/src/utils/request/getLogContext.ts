import { Request } from "express";

export const getLogContext = (
  req: Request,
  options = { includeHeaders: false }
) => {
  const base = {
    path: req.originalUrl,
    method: req.method,
    host: req.headers.host,
    userId: req.userId,
    ...req.meta,
  };

  if (options.includeHeaders) {
    return {
      ...base,
      headers: req.headers,
    };
  }

  return base;
};
