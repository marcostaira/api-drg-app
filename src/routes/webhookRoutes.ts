import { Router } from "express";
import { whatsappController } from "../controllers/whatsappController";

const router = Router();

// Webhook do Evolution API para receber eventos do WhatsApp
router.post(
  "/whatsapp/:tenantId",
  whatsappController.webhook.bind(whatsappController)
);

export default router;
