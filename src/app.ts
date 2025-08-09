// src/app.ts
// Configuração do Express com middlewares melhorados

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middlewares/errorHandler";
import { notFoundHandler } from "./middlewares/notFoundHandler";
import { config } from "./config/config";
import apiRoutes from "./routes";

const app = express();

// Middleware de logging para desenvolvimento
if (config.nodeEnv === "development") {
  app.use((req, res, next) => {
    console.log(
      `${new Date().toISOString()} - ${req.method} ${req.originalUrl}`
    );
    next();
  });
}

// Middlewares de segurança
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// Configuração de CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requisições sem origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (
        config.allowedOrigins.includes(origin) ||
        config.nodeEnv === "development"
      ) {
        return callback(null, true);
      }

      callback(new Error("Não permitido pelo CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    error: {
      message: "Muitas requisições deste IP, tente novamente mais tarde.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Pular rate limit para webhooks (Evolution API)
  skip: (req) => {
    return req.originalUrl.startsWith("/api/webhook");
  },
});
app.use(limiter);

// Middlewares de parsing
app.use(
  express.json({
    limit: "10mb",
    type: ["application/json", "text/plain"],
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Health check principal
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API está funcionando",
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: "1.0.0",
      uptime: process.uptime(),
    },
  });
});

// Rotas da API
app.use("/api", apiRoutes);

// Middleware para rotas não encontradas (deve vir antes do errorHandler)
app.use(notFoundHandler);

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

export { app };
