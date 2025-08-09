// src/routes/webhookRoutes.ts
// Rotas de webhook com documentação e organização melhorada

import { Router } from "express";
import { whatsappController } from "../controllers/whatsappController";

const router = Router();

/**
 * @route   POST /api/webhook/whatsapp/:tenantId
 * @desc    Webhook do Evolution API para receber eventos do WhatsApp
 * @access  External (Evolution API)
 * @params  tenantId: number
 * @body    { event: string, data: any }
 * @note    Esta rota é chamada automaticamente pelo Evolution API
 */
router.post(
  "/whatsapp/:tenantId",
  whatsappController.webhook.bind(whatsappController)
);

export default router;
