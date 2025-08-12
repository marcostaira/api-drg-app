// src/routes/index.ts
// Arquivo principal de rotas com organização melhorada

import { Router } from "express";
import whatsappRoutes from "./whatsappRoutes";
import webhookRoutes from "./webhookRoutes";
import queueRoutes from "./queueRoutes";

const router = Router();

// Documentação básica da API
router.get("/", (req, res) => {
  res.json({
    message: "WhatsApp API v1.0.0",
    documentation: {
      whatsapp: "/api/whatsapp",
      webhooks: "/api/webhook",
      health: "/health",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Rotas do WhatsApp
 * @prefix /api/whatsapp
 */
router.use("/whatsapp", whatsappRoutes);

router.use("/queue", queueRoutes);
/**
 * Rotas de webhooks
 * @prefix /api/webhook
 */
router.use("/webhook", webhookRoutes);

export default router;
