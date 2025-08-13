// src/controllers/queueController.ts
// Controller para gerenciamento de filas

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { queueService } from "../services/queueService";
import { createAppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import { prisma } from "@/config/database";

// Schemas de validação
const enqueueSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive().optional(),
  templateType: z.string().optional().default("confirmacao"),
});

const processQueueSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

const cancelSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
});

const historySchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
});

export class QueueController {
  /**
   * Adiciona mensagem na fila
   */
  async enqueue(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = enqueueSchema.parse(req.body);

      const result = await queueService.enqueueMessage(data);

      res.status(200).json({
        success: true,
        message: "Mensagem adicionada à fila com sucesso",
        data: result,
      });
    } catch (error) {
      logger.error("Erro ao enfileirar mensagem", error);
      next(error);
    }
  }

  /**
   * Processa fila de mensagens
   */
  async processQueue(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { limit } = processQueueSchema.parse(req.body);

      await queueService.processQueue(limit);

      res.status(200).json({
        success: true,
        message: `Fila processada com limite de ${limit} mensagens`,
      });
    } catch (error) {
      logger.error("Erro ao processar fila", error);
      next(error);
    }
  }

  /**
   * Cancela envio de mensagem
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { scheduleId } = cancelSchema.parse(req.body);

      await queueService.cancelQueueItem(scheduleId);

      res.status(200).json({
        success: true,
        message: "Envio cancelado com sucesso",
      });
    } catch (error) {
      logger.error("Erro ao cancelar envio", error);
      next(error);
    }
  }

  /**
   * Busca histórico de mensagens
   */
  async getHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { scheduleId } = historySchema.parse(req.params);

      const messages = await queueService.getMessageHistory(scheduleId);

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      logger.error("Erro ao buscar histórico", error);
      next(error);
    }
  }

  /**
   * Busca status da fila
   */
  async getQueueStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await prisma.$queryRaw<any[]>`
        SELECT 
          status,
          COUNT(*) as total
        FROM wa_queue
        WHERE DATE(created_at) = CURDATE()
        GROUP BY status
      `;

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Erro ao buscar status da fila", error);
      next(error);
    }
  }
}

export const queueController = new QueueController();
