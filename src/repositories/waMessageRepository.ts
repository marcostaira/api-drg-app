// src/repositories/waMessageRepository.ts
// Repository para gerenciar mensagens WhatsApp - CORRIGIDO conforme tabela real

import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export interface LogMessageData {
  schedule_id: number;
  owner: number;
  user_id: number;
  template_id?: number;
  direction: "sent" | "received";
  message: string;
  status: "Enviada" | "Recebida" | "Erro";
}

export interface WaMessageResult {
  id: number;
  schedule_id: number;
  owner: number;
  user_id: number;
  template_id?: number;
  direction: "sent" | "received";
  message: string;
  status?: "Enviada" | "Recebida" | "Erro";
  created_at: Date;
  template_type?: string; // Quando fazer JOIN com templates
}

export class WaMessageRepository {
  /**
   * Busca a última mensagem enviada para um número específico
   * CORRIGIDO: Precisa correlacionar com agendamento e paciente para identificar o número
   */
  async getLastSentToNumber(
    ownerId: number | string,
    phoneNumber: string
  ): Promise<WaMessageResult | null> {
    try {
      // Limpar número de telefone
      const cleanNumber = phoneNumber.replace(/\D/g, "");

      logger.debug("Buscando última mensagem enviada", {
        ownerId,
        phoneNumber: cleanNumber,
      });

      // Como wa_messages não tem campo de telefone, precisamos buscar via agendamento + paciente
      const messages = await prisma.$queryRaw<WaMessageResult[]>`
        SELECT 
          m.id,
          m.schedule_id, 
          m.owner,
          m.user_id, 
          m.template_id,
          m.direction,
          m.message,
          m.status,
          m.created_at,
          t.type as template_type
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        INNER JOIN of_schedules s ON m.schedule_id = s.id
        INNER JOIN all_patients p ON s.patient = p.id
        WHERE m.owner = ${Number(ownerId)}
        AND m.direction = 'sent'
        AND (
          REPLACE(REPLACE(REPLACE(REPLACE(p.tel1, '-', ''), ' ', ''), '(', ''), ')', '') LIKE '%${cleanNumber.slice(
            -8
          )}%'
          OR REPLACE(REPLACE(REPLACE(REPLACE(p.tel2, '-', ''), ' ', ''), '(', ''), ')', '') LIKE '%${cleanNumber.slice(
            -8
          )}%'
        )
        AND m.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY m.created_at DESC
        LIMIT 1
      `;

      if (messages.length === 0) {
        logger.debug("Nenhuma mensagem recente encontrada", {
          ownerId,
          phoneNumber: cleanNumber,
        });
        return null;
      }

      const lastMessage = messages[0];

      logger.debug("Última mensagem encontrada", {
        messageId: lastMessage.id,
        scheduleId: lastMessage.schedule_id,
        templateType: lastMessage.template_type,
        sentAt: lastMessage.created_at,
      });

      return lastMessage;
    } catch (error) {
      logger.error("Erro ao buscar última mensagem", error, {
        ownerId,
        phoneNumber,
      });
      return null;
    }
  }

  /**
   * Registra mensagem no log - CORRIGIDO para usar raw SQL
   */
  async log(data: LogMessageData): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO wa_messages (
          schedule_id, owner, user_id, template_id, 
          direction, message, status, created_at
        )
        VALUES (
          ${data.schedule_id}, 
          ${data.owner}, 
          ${data.user_id}, 
          ${data.template_id || null},
          ${data.direction}, 
          ${data.message}, 
          ${data.status}, 
          NOW()
        )
      `;

      logger.debug("Mensagem registrada no log", {
        scheduleId: data.schedule_id,
        direction: data.direction,
        status: data.status,
      });
    } catch (error) {
      logger.error("Erro ao registrar mensagem", error, data);
      throw error;
    }
  }

  /**
   * Busca mensagens de um agendamento - CORRIGIDO para usar raw SQL
   */
  async getByScheduleId(scheduleId: number): Promise<WaMessageResult[]> {
    try {
      logger.debug("Buscando mensagens do agendamento", { scheduleId });

      const messages = await prisma.$queryRaw<WaMessageResult[]>`
        SELECT 
          m.id,
          m.schedule_id,
          m.owner,
          m.user_id,
          m.template_id,
          m.direction,
          m.message,
          m.status,
          m.created_at,
          t.type as template_type
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        WHERE m.schedule_id = ${scheduleId}
        ORDER BY m.created_at DESC
      `;

      logger.debug("Mensagens encontradas", {
        scheduleId,
        count: messages.length,
      });

      return messages;
    } catch (error) {
      logger.error("Erro ao buscar mensagens do agendamento", error, {
        scheduleId,
      });
      return [];
    }
  }

  /**
   * Busca últimas mensagens por owner
   */
  async getRecentByOwner(
    ownerId: number,
    limit: number = 50
  ): Promise<WaMessageResult[]> {
    try {
      const messages = await prisma.$queryRaw<WaMessageResult[]>`
        SELECT 
          m.id,
          m.schedule_id,
          m.owner,
          m.user_id,
          m.template_id,
          m.direction,
          m.message,
          m.status,
          m.created_at,
          t.type as template_type
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        WHERE m.owner = ${ownerId}
        ORDER BY m.created_at DESC
        LIMIT ${limit}
      `;

      return messages;
    } catch (error) {
      logger.error("Erro ao buscar mensagens recentes", error, { ownerId });
      return [];
    }
  }

  /**
   * Busca estatísticas de mensagens
   */
  async getStats(ownerId: number, days: number = 7): Promise<any> {
    try {
      const stats = await prisma.$queryRaw<any[]>`
        SELECT 
          direction,
          status,
          COUNT(*) as total
        FROM wa_messages
        WHERE owner = ${ownerId}
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
        GROUP BY direction, status
        ORDER BY direction, status
      `;

      return stats;
    } catch (error) {
      logger.error("Erro ao buscar estatísticas", error, { ownerId });
      return [];
    }
  }

  /**
   * Busca mensagens por período
   */
  async getByDateRange(
    ownerId: number,
    startDate: Date,
    endDate: Date
  ): Promise<WaMessageResult[]> {
    try {
      const messages = await prisma.$queryRaw<WaMessageResult[]>`
        SELECT 
          m.id,
          m.schedule_id,
          m.owner,
          m.user_id,
          m.template_id,
          m.direction,
          m.message,
          m.status,
          m.created_at,
          t.type as template_type
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        WHERE m.owner = ${ownerId}
        AND m.created_at >= ${startDate}
        AND m.created_at <= ${endDate}
        ORDER BY m.created_at DESC
      `;

      return messages;
    } catch (error) {
      logger.error("Erro ao buscar mensagens por período", error, {
        ownerId,
        startDate,
        endDate,
      });
      return [];
    }
  }

  /**
   * Conta mensagens pendentes de hoje
   */
  async countTodayMessages(ownerId: number): Promise<any> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          direction,
          COUNT(*) as total
        FROM wa_messages
        WHERE owner = ${ownerId}
        AND DATE(created_at) = CURDATE()
        GROUP BY direction
      `;

      return {
        sent: result.find((r) => r.direction === "sent")?.total || 0,
        received: result.find((r) => r.direction === "received")?.total || 0,
      };
    } catch (error) {
      logger.error("Erro ao contar mensagens de hoje", error, { ownerId });
      return { sent: 0, received: 0 };
    }
  }
}

export const waMessageRepository = new WaMessageRepository();
