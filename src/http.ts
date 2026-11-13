import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { DomainError } from "./domain.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof DomainError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Invalid input";
    res.status(400).json({ error: message });
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.error(err instanceof Error ? err.message : "Unknown error");
  }
  res.status(500).json({ error: "Something went wrong" });
}
