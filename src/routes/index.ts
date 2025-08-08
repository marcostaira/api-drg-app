import { Router } from "express";
import whatsappRoutes from "./whatsappRoutes";
import webhookRoutes from "./webhookRoutes";

const router = Router();

// Rotas da API
router.use("/whatsapp", whatsappRoutes);

// Rotas de webhook
router.use("/webhook", webhookRoutes);

export default router;
