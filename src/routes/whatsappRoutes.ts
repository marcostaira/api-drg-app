import { Router } from "express";
import { whatsappController } from "../controllers/whatsappController";

const router = Router();

// Conectar tenant ao WhatsApp
router.post("/connect", whatsappController.connect.bind(whatsappController));

// Desconectar sessão
router.post(
  "/disconnect",
  whatsappController.disconnect.bind(whatsappController)
);

// Obter status da sessão
router.get(
  "/status/:tenantId",
  whatsappController.getStatus.bind(whatsappController)
);

// Enviar mensagem
router.post(
  "/send-message",
  whatsappController.sendMessage.bind(whatsappController)
);

export default router;
