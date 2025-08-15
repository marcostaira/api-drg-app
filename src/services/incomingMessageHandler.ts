// src/services/incomingMessageHandler.ts
// Handler para processar mensagens recebidas via Evolution API

import { waMessageRepository } from "../repositories/waMessageRepository";
import { waQueueRepository } from "../repositories/waQueueRepository";
import { waTemplateRepository } from "../repositories/waTemplateRepository";
import { scheduleRepository } from "../repositories/scheduleRepository";
import { whatsappService } from "./whatsappService";
import { logger } from "../utils/logger";
import { formatPhoneForWhatsApp } from "../utils/formatters";
import {
  IncomingMessageData,
  MessageResponse,
  MessageValidation,
} from "../types/messageHandler.types";

export class IncomingMessageHandler {
  /**
   * Processa mensagem recebida
   */
  static async handleMessage(
    data: IncomingMessageData
  ): Promise<MessageResponse> {
    const { ownerId, senderNumber, messageText, messageId, timestamp } = data;

    logger.info("Processando mensagem recebida", {
      ownerId,
      senderNumber,
      messageLength: messageText.length,
      messageId,
    });

    try {
      // Validar entrada
      if (!messageText || typeof messageText !== "string") {
        return { success: false, action: "ignored", message: "Texto inválido" };
      }

      // Buscar última mensagem enviada para este número
      const lastMessage = await waMessageRepository.getLastSentToNumber(
        ownerId,
        senderNumber
      );

      if (!lastMessage) {
        logger.debug("Nenhuma mensagem anterior encontrada, ignorando", {
          ownerId,
          senderNumber,
        });
        return {
          success: true,
          action: "ignored",
          message: "Nenhuma mensagem anterior",
        };
      }

      // Buscar dados do agendamento
      const schedule = await scheduleRepository.getById(
        lastMessage.schedule_id
      );

      if (!schedule) {
        logger.warn("Agendamento não encontrado", {
          scheduleId: lastMessage.schedule_id,
        });
        return {
          success: false,
          action: "ignored",
          message: "Agendamento não encontrado",
        };
      }

      // Validar se deve processar a mensagem
      const validation = this.validateMessage(
        messageText,
        lastMessage,
        schedule
      );

      if (!validation.shouldRespond) {
        logger.debug("Mensagem ignorada conforme validação", {
          validation,
          messageText,
        });
        return {
          success: true,
          action: "ignored",
          message: "Mensagem fora dos critérios",
        };
      }

      // Registrar mensagem recebida (apenas se for válida para processamento)
      if (validation.action !== "ignore") {
        await waMessageRepository.log({
          schedule_id: lastMessage.schedule_id,
          owner: ownerId,
          user_id: lastMessage.user_id || 0,
          direction: "received",
          message: messageText,
          status: "Recebida",
        });
      }

      // Processar ação baseada na validação
      return await this.processAction(
        validation,
        lastMessage,
        schedule,
        ownerId,
        senderNumber,
        messageText
      );
    } catch (error) {
      logger.error("Erro ao processar mensagem recebida", error, {
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
   * Valida se a mensagem deve ser processada
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

    // Verificar se está dentro da janela de 24h
    const sentAt = new Date(lastMessage.created_at);
    const now = new Date();
    const diffInHours = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
    const isWithin24h = diffInHours <= 24;

    // Verificar se já foi processado (status 6 = confirmado, 7 = reagendado)
    const isAlreadyProcessed = [6, 7].includes(schedule.sts);

    // Determinar ação
    let action: MessageValidation["action"] = "ignore";
    let shouldRespond = false;

    if (!isWithin24h || isAlreadyProcessed) {
      action = "ignore";
      shouldRespond = false;
    } else if (isValidOption) {
      action = cleanText === "1" ? "confirm" : "reschedule";
      shouldRespond = true;
    } else if (!isGarbage) {
      // Número válido mas não 1 ou 2
      action = "fallback";
      shouldRespond = true;
    } else {
      // Mensagem com texto/lixo
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
   * Processa a ação determinada pela validação
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
          schedule_id,
          user_id,
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

  /**
   * Processa resposta de confirmação (1) ou reagendamento (2)
   */
  private static async handleConfirmationResponse(
    action: "confirm" | "reschedule",
    scheduleId: number,
    ownerId: number,
    userId: number
  ): Promise<MessageResponse> {
    try {
      // Atualizar status do agendamento
      const statusToSet = action === "confirm" ? 6 : 7;
      await scheduleRepository.updateStatus(scheduleId, statusToSet);

      // Buscar template apropriado
      const templateType = action === "confirm" ? "confirmar" : "reagendar";
      const template = await waTemplateRepository.getByType(
        ownerId,
        templateType
      );

      if (template) {
        // Adicionar resposta na fila
        await waQueueRepository.enqueue({
          schedule_id: scheduleId,
          owner_id: ownerId,
          user_id: userId,
          template_id: template.id,
        });

        logger.info("Resposta de confirmação processada", {
          action,
          scheduleId,
          templateType,
          newStatus: statusToSet,
        });

        return {
          success: true,
          action: action === "confirm" ? "confirmed" : "rescheduled",
          statusUpdated: true,
          templateSent: true,
          message: `Agendamento ${
            action === "confirm" ? "confirmado" : "reagendado"
          }`,
        };
      } else {
        logger.warn("Template não encontrado", {
          ownerId,
          templateType,
        });

        return {
          success: false,
          action: action === "confirm" ? "confirmed" : "rescheduled",
          statusUpdated: true,
          templateSent: false,
          message: "Template não encontrado",
        };
      }
    } catch (error) {
      logger.error("Erro ao processar resposta de confirmação", error, {
        action,
        scheduleId,
        ownerId,
      });

      return {
        success: false,
        action: action === "confirm" ? "confirmed" : "rescheduled",
        message: "Erro ao processar confirmação",
      };
    }
  }

  /**
   * Processa resposta de fallback (opção inválida)
   */
  private static async handleFallbackResponse(
    ownerId: number,
    senderNumber: string,
    scheduleId: number,
    userId: number,
    originalMessage: string
  ): Promise<MessageResponse> {
    try {
      const fallbackText =
        "Resposta inválida. Por favor, responda com 1 para confirmar ou 2 para reagendar.";

      // Formatar número para WhatsApp
      const formattedNumber = formatPhoneForWhatsApp(senderNumber);

      // Enviar mensagem de fallback
      await whatsappService.sendMessage(ownerId, formattedNumber, fallbackText);

      // Registrar envio da mensagem de fallback
      await waMessageRepository.log({
        schedule_id: scheduleId,
        owner: ownerId,
        user_id: userId,
        direction: "sent",
        message: fallbackText,
        status: "Enviada",
      });

      logger.info("Mensagem de fallback enviada", {
        ownerId,
        senderNumber: formattedNumber,
        originalMessage,
      });

      return {
        success: true,
        action: "fallback",
        message: "Fallback enviado",
      };
    } catch (error) {
      logger.error("Erro ao enviar mensagem de fallback", error, {
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
