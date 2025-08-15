// src/services/queueService.ts
// Serviço para gerenciamento de filas de mensagens - CORRIGIDO

import { prisma } from "../config/database";
import { whatsappService } from "./whatsappService";
import { logger } from "../utils/logger";
import {
  formatPhoneForWhatsApp,
  formatDate,
  formatTime,
} from "../utils/formatters";
import {
  QueueStatus,
  MessageDirection,
  MessageStatus,
  EnqueueMessageRequest,
  ProcessedMessage,
} from "../types/queue.types";
import { Prisma } from "@prisma/client";

export class QueueService {
  /**
   * Adiciona uma mensagem na fila para envio
   */
  async enqueueMessage(data: EnqueueMessageRequest): Promise<any> {
    const { scheduleId, userId = 1, templateType = "confirmacao" } = data;

    try {
      // 1. Buscar informações do agendamento
      const schedule = await prisma.$queryRaw<any[]>`
        SELECT id, owner, patient, dates, times, procedures, whatsConf
        FROM of_schedules 
        WHERE id = ${scheduleId}
        LIMIT 1
      `;

      if (!schedule || schedule.length === 0) {
        throw new Error(`Agendamento ${scheduleId} não encontrado`);
      }

      const scheduleData = schedule[0];
      const ownerId = scheduleData.owner;
      const patientId = scheduleData.patient;

      // 2. Buscar template ativo para o owner
      const template = await prisma.$queryRaw<any[]>`
        SELECT id, owner_id, type, content, active
        FROM wa_templates
        WHERE owner_id = ${ownerId} 
        AND type = ${templateType}
        AND active = 1
        LIMIT 1
      `;

      if (!template || template.length === 0) {
        throw new Error(
          `Template '${templateType}' não encontrado ou inativo para owner ${ownerId}`
        );
      }

      const templateData = template[0];

      // 3. Buscar dados do paciente
      const patient = await prisma.$queryRaw<any[]>`
        SELECT id, patients_name, tel1, tel2, email
        FROM all_patients
        WHERE id = ${patientId}
        LIMIT 1
      `;

      if (!patient || patient.length === 0) {
        throw new Error(`Paciente ${patientId} não encontrado`);
      }

      const patientData = patient[0];

      // Verificar se tem telefone
      const phoneNumber = patientData.tel1 || patientData.tel2;
      if (!phoneNumber) {
        throw new Error(
          `Paciente ${patientData.patients_name} não possui telefone cadastrado`
        );
      }

      // 4. Verificar se existe sessão WhatsApp ativa ANTES de enfileirar
      await this.validateWhatsAppSession(ownerId);

      // 5. Adicionar na fila
      const queueItem = await prisma.$executeRaw`
        INSERT INTO wa_queue (schedule_id, owner_id, user_id, template_id, status, created_at)
        VALUES (${scheduleId}, ${ownerId}, ${userId}, ${templateData.id}, ${QueueStatus.AGUARDANDO}, NOW())
      `;

      logger.info("Mensagem adicionada à fila", {
        scheduleId,
        ownerId,
        patientName: patientData.patients_name,
        templateType,
      });

      // 6. Processar mensagem imediatamente
      await this.processQueueItem(scheduleId);

      return {
        success: true,
        message: "Mensagem adicionada à fila e processada",
        data: {
          scheduleId,
          patientName: patientData.patients_name,
          phoneNumber: formatPhoneForWhatsApp(phoneNumber),
          templateType,
        },
      };
    } catch (error) {
      logger.error("Erro ao enfileirar mensagem", error);
      throw error;
    }
  }

  /**
   * Validar se existe sessão WhatsApp ativa
   */
  private async validateWhatsAppSession(ownerId: number): Promise<void> {
    try {
      // Buscar sessão ativa para o owner/tenant
      const sessions = await prisma.$queryRaw<any[]>`
        SELECT sessionName, status, phoneNumber, connectedAt
        FROM whatsapp_sessions 
        WHERE tenantId = ${ownerId.toString()}
        AND status IN ('CONNECTED', 'CONNECTING')
        ORDER BY 
          CASE 
            WHEN status = 'CONNECTED' THEN 1 
            WHEN status = 'CONNECTING' THEN 2 
          END,
          connectedAt DESC
        LIMIT 1
      `;

      if (!sessions || sessions.length === 0) {
        throw new Error(
          `Nenhuma sessão WhatsApp ativa encontrada para tenant ${ownerId}. ` +
            `Execute a conexão primeiro via POST /api/whatsapp/connect`
        );
      }

      const session = sessions[0];

      // Se está apenas CONNECTING, verificar se foi escaneado
      if (session.status === "CONNECTING") {
        throw new Error(
          `Sessão WhatsApp ainda conectando para tenant ${ownerId}. ` +
            `Escaneie o QR Code primeiro ou aguarde a conexão ser estabelecida.`
        );
      }

      // Verificar se está realmente conectada
      if (session.status !== "CONNECTED") {
        throw new Error(
          `Sessão WhatsApp não está conectada (status: ${session.status}) ` +
            `para tenant ${ownerId}. Execute a conexão primeiro.`
        );
      }

      logger.debug("Sessão WhatsApp validada", {
        ownerId,
        sessionName: session.sessionName,
        status: session.status,
        phoneNumber: session.phoneNumber,
      });
    } catch (error: any) {
      logger.error("Falha na validação da sessão WhatsApp", error, { ownerId });
      throw error;
    }
  }

  /**
   * Processa um item da fila
   */
  async processQueueItem(scheduleId: number): Promise<void> {
    try {
      // 1. Buscar item da fila
      const queueItems = await prisma.$queryRaw<any[]>`
        SELECT q.*, s.owner, s.patient, s.dates, s.times, s.procedures
        FROM wa_queue q
        JOIN of_schedules s ON q.schedule_id = s.id
        WHERE q.schedule_id = ${scheduleId}
        AND q.status = ${QueueStatus.AGUARDANDO}
        ORDER BY q.created_at ASC
        LIMIT 1
      `;

      if (!queueItems || queueItems.length === 0) {
        logger.info("Nenhum item na fila para processar", { scheduleId });
        return;
      }

      const queueItem = queueItems[0];

      // 2. Buscar dados do paciente
      const patients = await prisma.$queryRaw<any[]>`
        SELECT id, patients_name, tel1, tel2
        FROM all_patients
        WHERE id = ${queueItem.patient}
        LIMIT 1
      `;

      if (!patients || patients.length === 0) {
        await this.updateQueueStatus(queueItem.id, QueueStatus.ERRO);
        throw new Error(`Paciente ${queueItem.patient} não encontrado`);
      }

      const patient = patients[0];
      const phoneNumber = patient.tel1 || patient.tel2;

      if (!phoneNumber) {
        await this.updateQueueStatus(queueItem.id, QueueStatus.ERRO);
        throw new Error("Paciente sem telefone cadastrado");
      }

      // 3. Buscar template
      const templates = await prisma.$queryRaw<any[]>`
        SELECT content
        FROM wa_templates
        WHERE id = ${queueItem.template_id}
        LIMIT 1
      `;

      if (!templates || templates.length === 0) {
        await this.updateQueueStatus(queueItem.id, QueueStatus.ERRO);
        throw new Error(`Template ${queueItem.template_id} não encontrado`);
      }

      const template = templates[0];

      // 4. Processar mensagem (substituir variáveis)
      const processedMessage = this.processTemplate(template.content, {
        nome: patient.patients_name,
        data: formatDate(queueItem.dates),
        hora: formatTime(queueItem.times),
        procedimentos: queueItem.procedures || "Consulta",
      });

      // 5. Formatar telefone para WhatsApp
      const formattedPhone = formatPhoneForWhatsApp(phoneNumber);

      // 6. VALIDAR NOVAMENTE a sessão antes de enviar
      try {
        await this.validateWhatsAppSession(queueItem.owner);
      } catch (validationError) {
        await this.updateQueueStatus(queueItem.id, QueueStatus.ERRO);
        await this.logMessage({
          scheduleId: queueItem.schedule_id,
          owner: queueItem.owner,
          userId: queueItem.user_id,
          templateId: queueItem.template_id,
          direction: MessageDirection.SENT,
          message: processedMessage,
          status: MessageStatus.ERRO,
        });
        throw validationError;
      }

      // 7. Enviar mensagem via WhatsApp
      try {
        logger.info("Enviando mensagem via WhatsApp", {
          scheduleId,
          patientName: patient.patients_name,
          phoneNumber: formattedPhone,
          messageLength: processedMessage.length,
        });

        const sendResult = await whatsappService.sendMessage(
          queueItem.owner,
          formattedPhone,
          processedMessage
        );

        // 8. Atualizar status da fila para ENVIADA
        await this.updateQueueStatus(queueItem.id, QueueStatus.ENVIADA);

        // 9. Registrar no log de mensagens
        await this.logMessage({
          scheduleId: queueItem.schedule_id,
          owner: queueItem.owner,
          userId: queueItem.user_id,
          templateId: queueItem.template_id,
          direction: MessageDirection.SENT,
          message: processedMessage,
          status: MessageStatus.ENVIADA,
        });

        // 10. Marcar agendamento como confirmado via WhatsApp
        await prisma.$executeRaw`
          UPDATE of_schedules 
          SET whatsConf = 1 
          WHERE id = ${scheduleId}
        `;

        logger.info("Mensagem enviada com sucesso", {
          scheduleId,
          patientName: patient.patients_name,
          phoneNumber: formattedPhone,
          messageId: sendResult?.key?.id,
        });
      } catch (sendError) {
        logger.error("Erro ao enviar mensagem via WhatsApp", sendError, {
          scheduleId,
          patientName: patient.patients_name,
          phoneNumber: formattedPhone,
        });

        // Atualizar status para erro
        await this.updateQueueStatus(queueItem.id, QueueStatus.ERRO);

        // Registrar erro no log
        await this.logMessage({
          scheduleId: queueItem.schedule_id,
          owner: queueItem.owner,
          userId: queueItem.user_id,
          templateId: queueItem.template_id,
          direction: MessageDirection.SENT,
          message: processedMessage,
          status: MessageStatus.ERRO,
        });

        throw sendError;
      }
    } catch (error) {
      logger.error("Erro ao processar item da fila", error, { scheduleId });
      throw error;
    }
  }

  /**
   * Processa template substituindo variáveis
   */
  private processTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let processed = template;

    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{${key}}`, "gi");
      processed = processed.replace(regex, variables[key]);
    });

    return processed;
  }

  /**
   * Atualiza status de um item na fila
   */
  private async updateQueueStatus(
    queueId: number,
    status: QueueStatus
  ): Promise<void> {
    try {
      if (status === QueueStatus.ENVIADA) {
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
    }
  }

  /**
   * Registra mensagem no log
   */
  private async logMessage(data: any): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO wa_messages (
          schedule_id, owner, user_id, template_id, 
          direction, message, status, created_at
        )
        VALUES (
          ${data.scheduleId}, ${data.owner}, ${data.userId}, ${data.templateId},
          ${data.direction}, ${data.message}, ${data.status}, NOW()
        )
      `;

      logger.debug("Mensagem registrada no log", {
        scheduleId: data.scheduleId,
        direction: data.direction,
        status: data.status,
      });
    } catch (error) {
      logger.error("Erro ao registrar mensagem no log", error, data);
    }
  }

  /**
   * Processa fila completa (para job agendado)
   */
  async processQueue(limit: number = 10): Promise<void> {
    try {
      const queueItems = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT schedule_id
        FROM wa_queue
        WHERE status = ${QueueStatus.AGUARDANDO}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;

      logger.info(`Processando ${queueItems.length} itens da fila`, { limit });

      if (queueItems.length === 0) {
        logger.info("Nenhum item na fila para processar");
        return;
      }

      for (const item of queueItems) {
        try {
          await this.processQueueItem(item.schedule_id);
          // Adicionar delay entre envios para evitar bloqueio
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error(`Erro ao processar item ${item.schedule_id}`, error);
          // Continuar processando outros itens mesmo se um falhar
        }
      }

      logger.info("Processamento da fila concluído", {
        processedItems: queueItems.length,
      });
    } catch (error) {
      logger.error("Erro ao processar fila", error, { limit });
      throw error;
    }
  }

  /**
   * Cancela envio de mensagem
   */
  async cancelQueueItem(scheduleId: number): Promise<void> {
    try {
      const result = await prisma.$executeRaw`
        UPDATE wa_queue 
        SET status = ${QueueStatus.CANCELADA}
        WHERE schedule_id = ${scheduleId}
        AND status = ${QueueStatus.AGUARDANDO}
      `;

      logger.info(`Envio cancelado para agendamento ${scheduleId}`, {
        affectedRows: result,
      });
    } catch (error) {
      logger.error("Erro ao cancelar envio", error, { scheduleId });
      throw error;
    }
  }

  /**
   * Busca histórico de mensagens de um agendamento
   */
  async getMessageHistory(scheduleId: number): Promise<any[]> {
    try {
      const messages = await prisma.$queryRaw<any[]>`
        SELECT m.*, t.type as template_type
        FROM wa_messages m
        LEFT JOIN wa_templates t ON m.template_id = t.id
        WHERE m.schedule_id = ${scheduleId}
        ORDER BY m.created_at DESC
      `;

      logger.debug("Histórico de mensagens obtido", {
        scheduleId,
        messageCount: messages.length,
      });

      return messages;
    } catch (error) {
      logger.error("Erro ao buscar histórico de mensagens", error, {
        scheduleId,
      });
      throw error;
    }
  }

  /**
   * Forçar atualização do status da sessão para CONNECTED
   */
  async forceUpdateSessionStatus(
    tenantId: number,
    phoneNumber: string
  ): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE whatsapp_sessions 
        SET status = 'CONNECTED', 
            phoneNumber = ${phoneNumber},
            connectedAt = NOW(),
            updatedAt = NOW()
        WHERE tenantId = ${tenantId.toString()}
        AND sessionName = ${`tenant_${tenantId}`}
      `;

      logger.info("Status da sessão atualizado para CONNECTED", {
        tenantId,
        phoneNumber,
      });
    } catch (error) {
      logger.error("Erro ao atualizar status da sessão", error, { tenantId });
      throw error;
    }
  }
}

export const queueService = new QueueService();
