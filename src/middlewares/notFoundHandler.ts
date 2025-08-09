// src/middlewares/notFoundHandler.ts
// Middleware para rotas não encontradas melhorado

import { Request, Response, NextFunction } from "express";

/**
 * Middleware para tratar rotas não encontradas
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("🔍 Rota não encontrada:", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  res.status(404).json({
    success: false,
    error: {
      message: `Rota ${req.method} ${req.originalUrl} não encontrada`,
      code: "ROUTE_NOT_FOUND",
      timestamp: new Date().toISOString(),
      suggestions: [
        "Verifique se a URL está correta",
        "Consulte a documentação da API em /api",
        "Verifique se o método HTTP está correto",
      ],
    },
  });
};
