// src/repositories/waMessageRepository.ts
// CORRIGIR interface para incluir campos do JOIN

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

// INTERFACE CORRIGIDA - incluindo campos do JOIN com pacientes
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
  template_type?: string; // Do JOIN com wa_templates
  // CAMPOS ADICIONADOS do JOIN com all_patients
  tel1?: string;
  tel2?: string;
  patients_name?: string;
}

// INTERFACE ESPECÍFICA para quando não precisamos dos dados do paciente
export interface WaMessageBasic {
  id: number;
  schedule_id: number;
  owner: number;
  user_id: number;
  template_id?: number;
  direction: "sent" | "received";
  message: string;
  status?: "Enviada" | "Recebida" | "Erro";
  created_at: Date;
  template_type?: string;
}

export class WaMessageRepository {
  /**
   * Busca a última mensagem enviada para um número específico - CORRIGIDO
   */
  async getLastSentToNumber(
    ownerId: number | string,
    phoneNumber: string
  ): Promise<WaMessageResult | null> {
    try {
      // Limpar número de telefone (remover código do país se tiver)
      let cleanNumber = phoneNumber.replace(/\D/g, "");

      // Se tem 13 dígitos e começa com 55, remover o 55
      if (cleanNumber.length === 13 && cleanNumber.startsWith("55")) {
        cleanNumber = cleanNumber.substring(2);
      }

      // Se tem 12 dígitos e começa com 55, remover o 55
      if (cleanNumber.length === 12 && cleanNumber.startsWith("55")) {
        cleanNumber = cleanNumber.substring(2);
      }

      logger.debug("Buscando última mensagem enviada", {
        ownerId,
        phoneNumberOriginal: phoneNumber,
        cleanNumber,
        cleanNumberLength: cleanNumber.length,
      });

      // Buscar últimas mensagens enviadas nas últimas 48h para este owner
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
          t.type as template_type,
          p.tel1,
          p.tel2,
          p.patients_name
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        INNER JOIN of_schedules s ON m.schedule_id = s.id
        INNER JOIN all_patients p ON s.patient = p.id
        WHERE m.owner = ${Number(ownerId)}
        AND m.direction = 'sent'
        AND m.created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
        ORDER BY m.created_at DESC
        LIMIT 20
      `;

      if (messages.length === 0) {
        logger.debug("Nenhuma mensagem enviada nas últimas 48h", { ownerId });
        return null;
      }

      // Filtrar mensagens que correspondem ao número
      const matchingMessage = messages.find((msg) => {
        if (!msg.tel1 && !msg.tel2) return false;

        // Limpar telefones do paciente
        const tel1Clean = msg.tel1 ? msg.tel1.replace(/\D/g, "") : "";
        const tel2Clean = msg.tel2 ? msg.tel2.replace(/\D/g, "") : "";

        // Remover código do país se tiver
        const tel1Final =
          tel1Clean.length >= 12 && tel1Clean.startsWith("55")
            ? tel1Clean.substring(2)
            : tel1Clean;
        const tel2Final =
          tel2Clean.length >= 12 && tel2Clean.startsWith("55")
            ? tel2Clean.substring(2)
            : tel2Clean;

        // Comparar últimos 8-9 dígitos
        const compareDigits = 8;
        const numberSuffix = cleanNumber.slice(-compareDigits);
        const tel1Suffix = tel1Final.slice(-compareDigits);
        const tel2Suffix = tel2Final.slice(-compareDigits);

        const matches =
          numberSuffix === tel1Suffix || numberSuffix === tel2Suffix;

        if (matches) {
          logger.debug("Número correspondente encontrado", {
            cleanNumber,
            tel1Final,
            tel2Final,
            patientName: msg.patients_name,
            scheduleId: msg.schedule_id,
            messageDate: msg.created_at,
          });
        }

        return matches;
      });

      if (!matchingMessage) {
        logger.debug("Nenhuma mensagem encontrada para este número", {
          ownerId,
          cleanNumber,
          totalMessages: messages.length,
          numbersChecked: messages.map((m) => ({
            tel1: m.tel1?.replace(/\D/g, ""),
            tel2: m.tel2?.replace(/\D/g, ""),
            patient: m.patients_name,
          })),
        });
        return null;
      }

      logger.info("Última mensagem encontrada", {
        messageId: matchingMessage.id,
        scheduleId: matchingMessage.schedule_id,
        templateType: matchingMessage.template_type,
        patientName: matchingMessage.patients_name,
        sentAt: matchingMessage.created_at,
      });

      return matchingMessage;
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
   * Busca mensagens de um agendamento - USANDO INTERFACE BÁSICA
   */
  async getByScheduleId(scheduleId: number): Promise<WaMessageBasic[]> {
    try {
      logger.debug("Buscando mensagens do agendamento", { scheduleId });

      const messages = await prisma.$queryRaw<WaMessageBasic[]>`
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
   * Busca últimas mensagens por owner - USANDO INTERFACE BÁSICA
   */
  async getRecentByOwner(
    ownerId: number,
    limit: number = 50
  ): Promise<WaMessageBasic[]> {
    try {
      const messages = await prisma.$queryRaw<WaMessageBasic[]>`
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
   * Busca mensagens por período - USANDO INTERFACE BÁSICA
   */
  async getByDateRange(
    ownerId: number,
    startDate: Date,
    endDate: Date
  ): Promise<WaMessageBasic[]> {
    try {
      const messages = await prisma.$queryRaw<WaMessageBasic[]>`
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

  /**
   * MÉTODO ADICIONAL: Buscar mensagens com dados do paciente
   */
  async getByScheduleIdWithPatient(
    scheduleId: number
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
          t.type as template_type,
          p.tel1,
          p.tel2,
          p.patients_name
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        INNER JOIN of_schedules s ON m.schedule_id = s.id
        INNER JOIN all_patients p ON s.patient = p.id
        WHERE m.schedule_id = ${scheduleId}
        ORDER BY m.created_at DESC
      `;

      return messages;
    } catch (error) {
      logger.error("Erro ao buscar mensagens com dados do paciente", error, {
        scheduleId,
      });
      return [];
    }
  }
}

export const waMessageRepository = new WaMessageRepository();
