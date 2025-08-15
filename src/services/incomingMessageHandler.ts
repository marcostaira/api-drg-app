// src/services/incomingMessageHandler.ts
// Handler corrigido conforme lógica correta

import { waMessageRepository } from "../repositories/waMessageRepository";
import { waQueueRepository } from "../repositories/waQueueRepository";
import { waTemplateRepository } from "../repositories/waTemplateRepository";
import { scheduleRepository } from "../repositories/scheduleRepository";
import { whatsappService } from "./whatsappService";
import { queueService } from "./queueService";
import { logger } from "../utils/logger";
import { formatPhoneForWhatsApp } from "../utils/formatters";
import {
  IncomingMessageData,
  MessageResponse,
} from "../types/messageHandler.types";

export class IncomingMessageHandler {
  /**
   * Processa mensagem recebida - LÓGICA CORRETA
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

      // PASSO 1: Buscar última mensagem enviada nas últimas 24h
      logger.info("🔍 HANDLER - Buscando última mensagem enviada (24h)", {
        ownerId,
        senderNumber,
      });

      const lastMessage = await waMessageRepository.getLastSentToNumber(
        ownerId,
        senderNumber
      );

      if (!lastMessage) {
        logger.info("⚠️ HANDLER - Nenhuma mensagem enviada nas últimas 24h", {
          ownerId,
          senderNumber,
        });
        return {
          success: true,
          action: "ignored",
          message: "Nenhuma mensagem enviada nas últimas 24h",
        };
      }

      // Verificar se a mensagem foi enviada nas últimas 24h
      const sentAt = new Date(lastMessage.created_at);
      const now = new Date();
      const diffInHours = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);

      logger.info("🕐 HANDLER - Verificando janela de 24h", {
        sentAt: sentAt.toISOString(),
        now: now.toISOString(),
        diffInHours: diffInHours.toFixed(2),
        isWithin24h: diffInHours <= 24,
      });

      if (diffInHours > 24) {
        logger.info("⏰ HANDLER - Mensagem fora da janela de 24h", {
          diffInHours: diffInHours.toFixed(2),
        });
        return {
          success: true,
          action: "ignored",
          message: "Mensagem fora da janela de 24h",
        };
      }

      logger.info("✅ HANDLER - Mensagem dentro da janela de 24h", {
        scheduleId: lastMessage.schedule_id,
        diffInHours: diffInHours.toFixed(2),
      });

      // PASSO 2: Verificar se a resposta é "1" ou "2"
      const cleanText = messageText.trim();

      logger.info("🎯 HANDLER - Analisando resposta", {
        originalText: messageText,
        cleanText,
      });

      let action: "confirm" | "reschedule" | "fallback" | "ignore" = "ignore";
      let templateType = "";
      let statusToSet = 0;

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
        logger.info("❓ HANDLER - Resposta não é 1 nem 2", {
          cleanText,
        });

        // Se não é 1 nem 2, enviar fallback se for número
        if (cleanText.match(/^[0-9]+$/)) {
          return await this.handleFallbackResponse(
            ownerId,
            senderNumber,
            lastMessage.schedule_id,
            messageText
          );
        } else {
          return {
            success: true,
            action: "ignored",
            message: "Resposta não é número válido",
          };
        }
      }

      // PASSO 3: Buscar dados do agendamento
      const schedule = await scheduleRepository.getById(
        lastMessage.schedule_id
      );

      if (!schedule) {
        logger.error("❌ HANDLER - Agendamento não encontrado", {
          scheduleId: lastMessage.schedule_id,
        });
        return {
          success: false,
          action: "ignored",
          message: "Agendamento não encontrado",
        };
      }

      logger.info("✅ HANDLER - Agendamento encontrado", {
        scheduleId: schedule.id,
        currentStatus: schedule.sts,
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

      // PASSO 4: Processar confirmação ou reagendamento
      return await this.processConfirmationAction(
        action as "confirm" | "reschedule",
        templateType,
        statusToSet,
        schedule.id,
        ownerId,
        lastMessage,
        cleanText
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
   * Processar ação de confirmação ou reagendamento
   */
  private static async processConfirmationAction(
    action: "confirm" | "reschedule",
    templateType: string,
    statusToSet: number,
    scheduleId: number,
    ownerId: number,
    lastMessage: any,
    responseText: string
  ): Promise<MessageResponse> {
    try {
      logger.info("🔄 HANDLER - Processando ação", {
        action,
        templateType,
        statusToSet,
        scheduleId,
        ownerId,
      });

      // 1. Registrar mensagem recebida
      await waMessageRepository.log({
        schedule_id: scheduleId,
        owner: ownerId,
        user_id: lastMessage.user_id || 1,
        direction: "received",
        message: responseText,
        status: "Recebida",
      });

      // 2. Atualizar status do agendamento
      logger.info("📝 HANDLER - Atualizando status", {
        scheduleId,
        newStatus: statusToSet,
      });

      await scheduleRepository.updateStatus(scheduleId, statusToSet);

      logger.info("✅ HANDLER - Status atualizado com sucesso");

      // 3. Buscar template
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

      // 4. Adicionar na fila
      logger.info("📤 HANDLER - Adicionando na fila");

      await waQueueRepository.enqueue({
        schedule_id: scheduleId,
        owner_id: ownerId,
        user_id: lastMessage.user_id || 1,
        template_id: template.id,
      });

      // 5. Processar fila imediatamente
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
    scheduleId: number,
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

      // Registrar fallback no log
      await waMessageRepository.log({
        schedule_id: scheduleId,
        owner: ownerId,
        user_id: 1,
        direction: "sent",
        message: fallbackText,
        status: "Enviada",
      });

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
}

export const incomingMessageHandler = IncomingMessageHandler;
