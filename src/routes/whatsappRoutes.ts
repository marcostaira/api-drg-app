// src/routes/whatsappRoutes.ts
// Rotas WhatsApp com documentação e organização melhorada

import { Router } from "express";
import { whatsappController } from "../controllers/whatsappController";

const router = Router();

/**
 * @route   POST /api/whatsapp/connect
 * @desc    Conectar tenant ao WhatsApp
 * @access  Private
 * @body    { tenantId: number }
 */
router.post("/connect", whatsappController.connect.bind(whatsappController));

/**
 * @route   POST /api/whatsapp/disconnect
 * @desc    Desconectar sessão do WhatsApp
 * @access  Private
 * @body    { tenantId: number }
 */
router.post(
  "/disconnect",
  whatsappController.disconnect.bind(whatsappController)
);

/**
 * @route   GET /api/whatsapp/status/:tenantId
 * @desc    Obter status da sessão WhatsApp
 * @access  Private
 * @params  tenantId: number
 */
router.get(
  "/status/:tenantId",
  whatsappController.getStatus.bind(whatsappController)
);

/**
 * @route   POST /api/whatsapp/send-message
 * @desc    Enviar mensagem de texto via WhatsApp
 * @access  Private
 * @body    { tenantId: number, phoneNumber: string, text: string }
 */
router.post(
  "/send-message",
  whatsappController.sendMessage.bind(whatsappController)
);

/**
 * @route   GET /api/whatsapp/qrcode/:tenantId
 * @desc    Obter QR Code da sessão WhatsApp
 * @access  Private
 * @params  tenantId: number
 */
router.get(
  "/qrcode/:tenantId",
  whatsappController.getQRCode.bind(whatsappController)
);

/**
 * @route   GET /api/whatsapp/webhook/:tenantId
 * @desc    Verificar configuração do webhook
 * @access  Private
 * @params  tenantId: number
 */
router.get(
  "/webhook/:tenantId",
  whatsappController.getWebhook.bind(whatsappController)
);

/**
 * @route   GET /api/whatsapp/health
 * @desc    Health check específico do WhatsApp
 * @access  Public
 */
router.get("/health", whatsappController.health.bind(whatsappController));

/**
 * @route   GET /api/whatsapp/token/:tenantId
 * @desc    Obter token da sessão WhatsApp
 * @access  Private
 * @params  tenantId: number
 */
router.get(
  "/token/:tenantId",
  whatsappController.getSessionToken.bind(whatsappController)
);
export default router;
