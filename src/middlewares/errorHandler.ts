import { Request, Response, NextFunction } from "express";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/library";
import { ZodError } from "zod";

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

export const createAppError = (
  message: string,
  statusCode: number
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = "Internal Server Error";

  // Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "Unique constraint violation";
        break;
      case "P2025":
        statusCode = 404;
        message = "Record not found";
        break;
      default:
        statusCode = 400;
        message = "Database error";
    }
  }

  // Zod validation errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation error";
  }

  // App errors
  else if ("statusCode" in err && typeof (err as any).statusCode === "number") {
    statusCode = (err as any).statusCode;
    message = err.message;
  }

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("Error:", {
      message: err.message,
      stack: err.stack,
      statusCode,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
      }),
    },
  });
};
