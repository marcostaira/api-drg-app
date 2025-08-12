// src/services/queueService.ts
// Serviço para gerenciamento de filas de mensagens

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

      // 4. Adicionar na fila
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

      // 5. Processar mensagem imediatamente (pode ser mudado para processamento em batch)
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
        logger.info("Nenhum item na fila para processar");
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

      // 6. Enviar mensagem via WhatsApp
      try {
        await whatsappService.sendMessage(
          queueItem.owner,
          formattedPhone,
          processedMessage
        );

        // 7. Atualizar status da fila
        await this.updateQueueStatus(queueItem.id, QueueStatus.ENVIADA);

        // 8. Registrar no log de mensagens
        await this.logMessage({
          scheduleId: queueItem.schedule_id,
          owner: queueItem.owner,
          userId: queueItem.user_id,
          templateId: queueItem.template_id,
          direction: MessageDirection.SENT,
          message: processedMessage,
          status: MessageStatus.ENVIADA,
        });

        // 9. Marcar agendamento como confirmado via WhatsApp
        await prisma.$executeRaw`
          UPDATE of_schedules 
          SET whatsConf = 1 
          WHERE id = ${scheduleId}
        `;

        logger.info("Mensagem enviada com sucesso", {
          scheduleId,
          patientName: patient.patients_name,
          phoneNumber: formattedPhone,
        });
      } catch (sendError) {
        logger.error("Erro ao enviar mensagem via WhatsApp", sendError);

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
      logger.error("Erro ao processar item da fila", error);
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
    const sentAt = status === QueueStatus.ENVIADA ? ", sent_at = NOW()" : "";

    await prisma.$executeRaw`
      UPDATE wa_queue 
      SET status = ${status}${
      sentAt ? prisma.Prisma.sql`${sentAt}` : prisma.Prisma.empty
    }
      WHERE id = ${queueId}
    `;
  }

  /**
   * Registra mensagem no log
   */
  private async logMessage(data: any): Promise<void> {
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

      logger.info(`Processando ${queueItems.length} itens da fila`);

      for (const item of queueItems) {
        try {
          await this.processQueueItem(item.schedule_id);
          // Adicionar delay entre envios para evitar bloqueio
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error(`Erro ao processar item ${item.schedule_id}`, error);
        }
      }
    } catch (error) {
      logger.error("Erro ao processar fila", error);
      throw error;
    }
  }

  /**
   * Cancela envio de mensagem
   */
  async cancelQueueItem(scheduleId: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE wa_queue 
      SET status = ${QueueStatus.CANCELADA}
      WHERE schedule_id = ${scheduleId}
      AND status = ${QueueStatus.AGUARDANDO}
    `;

    logger.info(`Envio cancelado para agendamento ${scheduleId}`);
  }

  /**
   * Busca histórico de mensagens de um agendamento
   */
  async getMessageHistory(scheduleId: number): Promise<any[]> {
    const messages = await prisma.$queryRaw<any[]>`
      SELECT m.*, t.type as template_type
      FROM wa_messages m
      LEFT JOIN wa_templates t ON m.template_id = t.id
      WHERE m.schedule_id = ${scheduleId}
      ORDER BY m.created_at DESC
    `;

    return messages;
  }
}

export const queueService = new QueueService();
