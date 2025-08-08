import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middlewares/errorHandler";
import { notFoundHandler } from "./middlewares/notFoundHandler";
import { config } from "./config/config";
import apiRoutes from "./routes";

const app = express();

// Security middlewares
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use("/api", apiRoutes);

// Error handling middlewares (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
