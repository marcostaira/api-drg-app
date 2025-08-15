// src/services/incomingMessageHandler.ts
// Handler para processar mensagens recebidas via Evolution API - CORRIGIDO

import { waMessageRepository } from "../repositories/waMessageRepository";
import { waQueueRepository } from "../repositories/waQueueRepository";
import { waTemplateRepository } from "../repositories/waTemplateRepository";
import { scheduleRepository } from "../repositories/scheduleRepository";
import { whatsappService } from "./whatsappService";
import { queueService } from "./queueService";
import { logger } from "../utils/logger";
import { formatPhoneForWhatsApp } from "../utils/formatters";
import { prisma } from "../config/database";
import {
  IncomingMessageData,
  MessageResponse,
  MessageValidation,
} from "../types/messageHandler.types";

export class IncomingMessageHandler {
  /**
   * Processa mensagem recebida - LÓGICA SIMPLIFICADA
   */
  static async handleMessage(
    data: IncomingMessageData
  ): Promise<MessageResponse> {
    const { ownerId, senderNumber, messageText, messageId, timestamp } = data;

    logger.info("🔍 HANDLER - Processando mensagem recebida", {
      ownerId,
      senderNumber,
      messageText: `"${messageText}"`,
      messageLength: messageText.length,
      messageId,
    });

    try {
      // Validar entrada
      if (!messageText || typeof messageText !== "string") {
        logger.warn("HANDLER - Texto inválido", { messageText });
        return { success: false, action: "ignored", message: "Texto inválido" };
      }

      // LÓGICA SIMPLES: Verificar se é 1 ou 2
      const cleanText = messageText.trim();

      logger.info("🎯 HANDLER - Analisando resposta", {
        originalText: messageText,
        cleanText,
        textLength: cleanText.length,
      });

      let action: "confirm" | "reschedule" | "fallback" | "ignore" = "ignore";
      let templateType = "";
      let statusToSet = 0;

      // MAPEAMENTO DIRETO E SIMPLES
      if (cleanText === "1") {
        action = "confirm";
        templateType = "confirmar";
        statusToSet = 6;
        logger.info("✅ HANDLER - Resposta 1 = CONFIRMAR", {
          action,
          templateType,
          statusToSet,
        });
      } else if (cleanText === "2") {
        action = "reschedule";
        templateType = "reagendar";
        statusToSet = 7;
        logger.info("📅 HANDLER - Resposta 2 = REAGENDAR", {
          action,
          templateType,
          statusToSet,
        });
      } else {
        logger.info("❓ HANDLER - Resposta não reconhecida", {
          cleanText,
          possibleValues: ["1", "2"],
        });

        // Se não é 1 nem 2, enviar fallback
        if (cleanText.match(/^[0-9]+$/)) {
          action = "fallback";
          logger.info("🔄 HANDLER - Enviando fallback para número inválido");
          return await this.handleFallbackResponse(
            ownerId,
            senderNumber,
            messageText
          );
        } else {
          action = "ignore";
          logger.info("🚫 HANDLER - Ignorando mensagem não numérica");
          return {
            success: true,
            action: "ignored",
            message: "Mensagem ignorada (não é número)",
          };
        }
      }

      // Se chegou aqui, é 1 ou 2 - buscar agendamento pendente
      logger.info("🔍 HANDLER - Buscando agendamento pendente", {
        ownerId,
        senderNumber,
        action,
      });

      const schedule = await this.findPendingScheduleForNumber(
        ownerId,
        senderNumber
      );

      if (!schedule) {
        logger.warn("⚠️ HANDLER - Nenhum agendamento pendente encontrado", {
          ownerId,
          senderNumber,
        });
        return {
          success: true,
          action: "ignored",
          message: "Nenhum agendamento pendente",
        };
      }

      logger.info("✅ HANDLER - Agendamento encontrado", {
        scheduleId: schedule.id,
        currentStatus: schedule.sts,
        patientName: schedule.patients_name,
      });

      // Verificar se já foi processado
      if ([6, 7].includes(schedule.sts)) {
        logger.warn("⚠️ HANDLER - Agendamento já processado", {
          scheduleId: schedule.id,
          currentStatus: schedule.sts,
        });
        return {
          success: true,
          action: "ignored",
          message: "Agendamento já processado",
        };
      }

      // Registrar mensagem recebida
      await waMessageRepository.log({
        schedule_id: schedule.id,
        owner: ownerId,
        user_id: 1,
        direction: "received",
        message: cleanText,
        status: "Recebida",
      });

      // Processar confirmação ou reagendamento
      return await this.processConfirmationAction(
        action as "confirm" | "reschedule",
        templateType,
        statusToSet,
        schedule.id,
        ownerId
      );
    } catch (error) {
      logger.error("❌ HANDLER - Erro ao processar mensagem recebida", error, {
        ownerId,
        senderNumber,
        messageText,
      });

      return {
        success: false,
        action: "ignored",
        message: "Erro interno",
      };
    }
  }

  /**
   * NOVO: Buscar agendamento pendente para um número específico - CORRIGIDO
   */
  private static async findPendingScheduleForNumber(
    ownerId: number,
    phoneNumber: string
  ): Promise<any | null> {
    try {
      let cleanNumber = phoneNumber.replace(/\D/g, "");

      // Remover código do país se tiver
      if (cleanNumber.length === 13 && cleanNumber.startsWith("55")) {
        cleanNumber = cleanNumber.substring(2);
      }

      if (cleanNumber.length === 12 && cleanNumber.startsWith("55")) {
        cleanNumber = cleanNumber.substring(2);
      }

      logger.debug("🔍 AGENDAMENTO - Buscando pendente", {
        ownerId,
        cleanNumber,
        cleanNumberLength: cleanNumber.length,
      });

      // CORRIGIDO: Query SQL com parâmetros corretos
      const numberSuffix = cleanNumber.slice(-8); // Últimos 8 dígitos

      const schedules = await prisma.$queryRaw<any[]>`
      SELECT s.id, s.owner, s.sts, s.patient, s.dates, s.times, s.procedures,
             p.patients_name, p.tel1, p.tel2
      FROM of_schedules s
      INNER JOIN all_patients p ON s.patient = p.id
      WHERE s.owner = ${ownerId}
      AND s.sts NOT IN (6, 7)
      AND s.dates >= CURDATE() - INTERVAL 1 DAY
      AND (
        REPLACE(REPLACE(REPLACE(REPLACE(p.tel1, '-', ''), ' ', ''), '(', ''), ')', '') LIKE ${`%${numberSuffix}%`}
        OR REPLACE(REPLACE(REPLACE(REPLACE(p.tel2, '-', ''), ' ', ''), '(', ''), ')', '') LIKE ${`%${numberSuffix}%`}
      )
      ORDER BY s.dates ASC, s.times ASC
      LIMIT 1
    `;

      logger.debug("🔍 AGENDAMENTO - Query executada", {
        ownerId,
        numberSuffix,
        foundSchedules: schedules.length,
      });

      if (schedules.length === 0) {
        logger.debug("❌ AGENDAMENTO - Nenhum pendente encontrado", {
          ownerId,
          cleanNumber,
          numberSuffix,
        });
        return null;
      }

      const schedule = schedules[0];

      logger.info("✅ AGENDAMENTO - Pendente encontrado", {
        scheduleId: schedule.id,
        patientName: schedule.patients_name,
        status: schedule.sts,
        dates: schedule.dates,
        times: schedule.times,
        tel1: schedule.tel1,
        tel2: schedule.tel2,
      });

      return schedule;
    } catch (error) {
      logger.error("❌ AGENDAMENTO - Erro ao buscar pendente", error, {
        ownerId,
        phoneNumber,
      });
      return null;
    }
  }

  /**
   * NOVO: Processar ação de confirmação diretamente
   */
  private static async processConfirmationAction(
    action: "confirm" | "reschedule",
    templateType: string,
    statusToSet: number,
    scheduleId: number,
    ownerId: number
  ): Promise<MessageResponse> {
    try {
      logger.info("🔄 HANDLER - Processando ação", {
        action,
        templateType,
        statusToSet,
        scheduleId,
        ownerId,
      });

      // 1. Atualizar status do agendamento
      logger.info("📝 HANDLER - Atualizando status", {
        scheduleId,
        newStatus: statusToSet,
      });

      await scheduleRepository.updateStatus(scheduleId, statusToSet);

      logger.info("✅ HANDLER - Status atualizado com sucesso");

      // 2. Buscar template
      logger.info("🔍 HANDLER - Buscando template", {
        ownerId,
        templateType,
      });

      const template = await waTemplateRepository.getByType(
        ownerId,
        templateType
      );

      if (!template) {
        logger.error("❌ HANDLER - Template não encontrado", {
          ownerId,
          templateType,
        });

        return {
          success: false,
          action: action === "confirm" ? "confirmed" : "rescheduled",
          statusUpdated: true,
          templateSent: false,
          message: `Template "${templateType}" não encontrado`,
        };
      }

      logger.info("✅ HANDLER - Template encontrado", {
        templateId: template.id,
        templateType: template.type,
        content: template.content.substring(0, 50) + "...",
      });

      // 3. Adicionar na fila
      logger.info("📤 HANDLER - Adicionando na fila");

      await waQueueRepository.enqueue({
        schedule_id: scheduleId,
        owner_id: ownerId,
        user_id: 1,
        template_id: template.id,
      });

      // 4. Processar fila imediatamente
      logger.info("🚀 HANDLER - Processando fila");

      await queueService.processQueueItem(scheduleId);

      logger.info("🎉 HANDLER - Ação processada com sucesso", {
        action,
        templateType,
        statusToSet,
        scheduleId,
      });

      return {
        success: true,
        action: action === "confirm" ? "confirmed" : "rescheduled",
        statusUpdated: true,
        templateSent: true,
        message: `${
          action === "confirm" ? "Confirmação" : "Reagendamento"
        } processado com template "${templateType}"`,
      };
    } catch (error) {
      logger.error("❌ HANDLER - Erro ao processar ação", error, {
        action,
        templateType,
        scheduleId,
        ownerId,
      });

      return {
        success: false,
        action: action === "confirm" ? "confirmed" : "rescheduled",
        message: "Erro ao processar ação",
      };
    }
  }

  /**
   * Processar resposta de fallback (número inválido)
   */
  private static async handleFallbackResponse(
    ownerId: number,
    senderNumber: string,
    originalMessage: string
  ): Promise<MessageResponse> {
    try {
      const fallbackText =
        "Resposta inválida. Por favor, responda com:\n1 - Para confirmar\n2 - Para reagendar";

      // Formatar número para WhatsApp
      const formattedNumber = formatPhoneForWhatsApp(senderNumber);

      logger.info("📤 HANDLER - Enviando fallback", {
        ownerId,
        senderNumber: formattedNumber,
        originalMessage,
      });

      // Enviar mensagem de fallback
      await whatsappService.sendMessage(ownerId, formattedNumber, fallbackText);

      logger.info("✅ HANDLER - Fallback enviado");

      return {
        success: true,
        action: "fallback",
        message: "Fallback enviado",
      };
    } catch (error) {
      logger.error("❌ HANDLER - Erro ao enviar fallback", error, {
        ownerId,
        senderNumber,
      });

      return {
        success: false,
        action: "fallback",
        message: "Erro ao enviar fallback",
      };
    }
  }

  /**
   * MÉTODOS LEGADOS (mantidos para compatibilidade mas não utilizados na nova lógica)
   */

  /**
   * Valida se a mensagem deve ser processada - LEGADO
   */
  private static validateMessage(
    messageText: string,
    lastMessage: any,
    schedule: any
  ): MessageValidation {
    const cleanText = messageText.trim().toLowerCase();
    const isValidOption = cleanText === "1" || cleanText === "2";
    const isGarbage =
      /[^0-9\s]/.test(cleanText) || cleanText.split(/\s+/).length > 1;

    const isWithin24h = true; // Simplificado
    const isAlreadyProcessed = [6, 7].includes(schedule?.sts || 0);

    let action: MessageValidation["action"] = "ignore";
    let shouldRespond = false;

    if (isAlreadyProcessed) {
      action = "ignore";
      shouldRespond = false;
    } else if (isValidOption) {
      if (cleanText === "1") {
        action = "confirm";
        shouldRespond = true;
      } else if (cleanText === "2") {
        action = "reschedule";
        shouldRespond = true;
      }
    } else if (!isGarbage) {
      action = "fallback";
      shouldRespond = true;
    } else {
      action = "ignore";
      shouldRespond = false;
    }

    return {
      isValidOption,
      isGarbage,
      isWithin24h,
      isAlreadyProcessed,
      shouldRespond,
      action,
    };
  }

  /**
   * Processa resposta de confirmação - LEGADO
   */
  private static async handleConfirmationResponse(
    action: "confirm" | "reschedule",
    scheduleId: number,
    ownerId: number,
    userId: number
  ): Promise<MessageResponse> {
    // Redirecionar para novo método
    const templateType = action === "confirm" ? "confirmar" : "reagendar";
    const statusToSet = action === "confirm" ? 6 : 7;

    return await this.processConfirmationAction(
      action,
      templateType,
      statusToSet,
      scheduleId,
      ownerId
    );
  }

  /**
   * Processa a ação determinada pela validação - LEGADO
   */
  private static async processAction(
    validation: MessageValidation,
    lastMessage: any,
    schedule: any,
    ownerId: number,
    senderNumber: string,
    messageText: string
  ): Promise<MessageResponse> {
    const { schedule_id, user_id } = lastMessage;

    switch (validation.action) {
      case "confirm":
      case "reschedule":
        return await this.handleConfirmationResponse(
          validation.action,
          schedule_id,
          ownerId,
          user_id
        );

      case "fallback":
        return await this.handleFallbackResponse(
          ownerId,
          senderNumber,
          messageText
        );

      default:
        return {
          success: true,
          action: "ignored",
          message: "Ação não reconhecida",
        };
    }
  }
}

export const incomingMessageHandler = IncomingMessageHandler;
