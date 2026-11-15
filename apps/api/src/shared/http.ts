import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "./errors";

type Source = "body" | "query" | "params";

export function validate(schema: ZodTypeAny, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid request", result.error.flatten()));
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// Inline so the browser can preview it; the filename is used when the user saves it.
export function sendPdf(res: Response, file: { filename: string; pdf: Buffer }): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.pdf);
}
