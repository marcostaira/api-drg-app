// src/routes/queueRoutes.ts
// Rotas para gerenciamento de filas

import { Router } from "express";
import { queueController } from "../controllers/queueController";

const router = Router();

// Adicionar mensagem na fila
router.post("/enqueue", queueController.enqueue.bind(queueController));

// Processar fila
router.post("/process", queueController.processQueue.bind(queueController));

// Cancelar envio
router.post("/cancel", queueController.cancel.bind(queueController));

// Buscar histórico de mensagens
router.get(
  "/history/:scheduleId",
  queueController.getHistory.bind(queueController)
);

// Status da fila
router.get("/status", queueController.getQueueStatus.bind(queueController));

export default router;
