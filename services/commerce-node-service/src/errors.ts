import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const candidate = error as { type?: string; status?: number; message?: string };
  if (candidate.type === "entity.parse.failed" || candidate.status === 400) {
    res.status(400).json({ error: "Invalid JSON request body" });
    return;
  }

  console.error("[commerce] unhandled request error", error);
  res.status(500).json({ error: "Internal server error" });
}
