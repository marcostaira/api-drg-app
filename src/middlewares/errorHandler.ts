// src/middlewares/errorHandler.ts
// Middleware de tratamento de erros melhorado

import { Request, Response, NextFunction } from "express";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/library";
import { ZodError } from "zod";
import { AxiosError } from "axios";

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
}

/**
 * Criar erro personalizado da aplicação
 * @param message Mensagem do erro
 * @param statusCode Código HTTP
 * @param code Código específico do erro (opcional)
 * @returns AppError
 */
export const createAppError = (
  message: string,
  statusCode: number,
  code?: string
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  error.code = code;
  return error;
};

/**
 * Middleware principal de tratamento de erros
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = "Erro interno do servidor";
  let code = "INTERNAL_SERVER_ERROR";
  let details: any = undefined;

  // Log do erro para debug
  console.error("🚨 Erro capturado:", {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Erros do Prisma
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "Violação de restrição única";
        code = "UNIQUE_CONSTRAINT_VIOLATION";
        details = { field: err.meta?.target };
        break;
      case "P2025":
        statusCode = 404;
        message = "Registro não encontrado";
        code = "RECORD_NOT_FOUND";
        break;
      case "P2003":
        statusCode = 400;
        message = "Violação de chave estrangeira";
        code = "FOREIGN_KEY_CONSTRAINT";
        break;
      case "P2014":
        statusCode = 400;
        message = "Relação inválida";
        code = "INVALID_RELATION";
        break;
      default:
        statusCode = 400;
        message = "Erro de banco de dados";
        code = "DATABASE_ERROR";
        details = { prismaCode: err.code };
    }
  }

  // Erros de validação do Prisma
  else if (err instanceof PrismaClientValidationError) {
    statusCode = 400;
    message = "Erro de validação de dados";
    code = "VALIDATION_ERROR";
  }

  // Erros de validação do Zod
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Dados de entrada inválidos";
    code = "VALIDATION_ERROR";
    details = {
      fields: err.errors.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      })),
    };
  }

  // Erros do Axios (Evolution API)
  else if (err instanceof AxiosError) {
    if (err.response) {
      // Erro de resposta da Evolution API
      statusCode = 502; // Bad Gateway
      message = "Erro na comunicação com Evolution API";
      code = "EVOLUTION_API_ERROR";
      details = {
        evolutionStatus: err.response.status,
        evolutionMessage: err.response.data?.message || err.response.statusText,
      };
    } else if (err.request) {
      // Erro de conexão com Evolution API
      statusCode = 503; // Service Unavailable
      message = "Evolution API indisponível";
      code = "EVOLUTION_API_UNAVAILABLE";
    } else {
      // Erro de configuração
      statusCode = 500;
      message = "Erro de configuração da Evolution API";
      code = "EVOLUTION_API_CONFIG_ERROR";
    }
  }

  // Erros personalizados da aplicação
  else if ("statusCode" in err && typeof (err as any).statusCode === "number") {
    statusCode = (err as AppError).statusCode;
    message = err.message;
    code = (err as AppError).code || "APPLICATION_ERROR";
  }

  // Erros de JSON malformado
  else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    message = "JSON malformado";
    code = "INVALID_JSON";
  }

  // Preparar resposta de erro
  const errorResponse: any = {
    success: false,
    error: {
      message,
      code,
      timestamp: new Date().toISOString(),
    },
  };

  // Adicionar detalhes se disponíveis
  if (details) {
    errorResponse.error.details = details;
  }

  // Adicionar stack trace em desenvolvimento
  if (process.env.NODE_ENV === "development") {
    errorResponse.error.stack = err.stack;
    errorResponse.error.request = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
    };
  }

  // Enviar resposta
  res.status(statusCode).json(errorResponse);
};
