// src/repositories/waQueueRepository.ts
// Repository para gerenciar fila de mensagens - CORRIGIDO

import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export interface EnqueueData {
  schedule_id: number;
  owner_id: number;
  user_id: number;
  template_id: number;
}

export interface QueueItem {
  id: number;
  schedule_id: number;
  owner_id: number;
  user_id: number;
  template_id: number;
  status: "Aguardando" | "Enviada" | "Cancelada" | "Erro";
  created_at: Date;
  sent_at?: Date;
}

export class WaQueueRepository {
  /**
   * Adiciona item na fila - CORRIGIDO para usar raw SQL
   */
  async enqueue(data: EnqueueData): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO wa_queue (
          schedule_id, owner_id, user_id, template_id, 
          status, created_at
        )
        VALUES (
          ${data.schedule_id}, 
          ${data.owner_id}, 
          ${data.user_id}, 
          ${data.template_id},
          'Aguardando', 
          NOW()
        )
      `;

      logger.debug("Item adicionado à fila", data);
    } catch (error) {
      logger.error("Erro ao adicionar item à fila", error, data);
      throw error;
    }
  }

  /**
   * Busca itens aguardando processamento
   */
  async getPending(limit: number = 10): Promise<QueueItem[]> {
    try {
      const items = await prisma.$queryRaw<QueueItem[]>`
        SELECT 
          id, schedule_id, owner_id, user_id, template_id,
          status, created_at, sent_at
        FROM wa_queue
        WHERE status = 'Aguardando'
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;

      return items;
    } catch (error) {
      logger.error("Erro ao buscar itens pendentes", error);
      return [];
    }
  }

  /**
   * Atualiza status do item na fila
   */
  async updateStatus(
    queueId: number,
    status: "Aguardando" | "Enviada" | "Cancelada" | "Erro"
  ): Promise<void> {
    try {
      if (status === "Enviada") {
        await prisma.$executeRaw`
          UPDATE wa_queue 
          SET status = ${status}, sent_at = NOW()
          WHERE id = ${queueId}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE wa_queue 
          SET status = ${status}
          WHERE id = ${queueId}
        `;
      }

      logger.debug("Status da fila atualizado", { queueId, status });
    } catch (error) {
      logger.error("Erro ao atualizar status da fila", error, {
        queueId,
        status,
      });
      throw error;
    }
  }
}

export const waQueueRepository = new WaQueueRepository();
