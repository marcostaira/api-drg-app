// src/repositories/scheduleRepository.ts
// Repository para gerenciar agendamentos

import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export interface ScheduleData {
  id: number;
  owner: number;
  sts: number;
  patient: number;
  dates: Date;
  times: string;
  procedures?: string;
  whatsConf: boolean;
}

export class ScheduleRepository {
  /**
   * Busca agendamento por ID
   */
  async getById(scheduleId: number): Promise<ScheduleData | null> {
    try {
      const schedules = await prisma.$queryRaw<any[]>`
        SELECT 
          id, owner, sts, patient, dates, times, procedures, whatsConf
        FROM of_schedules 
        WHERE id = ${scheduleId}
        LIMIT 1
      `;

      if (schedules.length === 0) {
        logger.debug("Agendamento não encontrado", { scheduleId });
        return null;
      }

      return schedules[0];
    } catch (error) {
      logger.error("Erro ao buscar agendamento", error, { scheduleId });
      return null;
    }
  }

  /**
   * Atualiza status do agendamento
   */
  async updateStatus(scheduleId: number, newStatus: number): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE of_schedules 
        SET sts = ${newStatus}, 
            date_lastupdate = NOW()
        WHERE id = ${scheduleId}
      `;

      logger.info("Status do agendamento atualizado", {
        scheduleId,
        newStatus,
      });
    } catch (error) {
      logger.error("Erro ao atualizar status do agendamento", error, {
        scheduleId,
        newStatus,
      });
      throw error;
    }
  }

  /**
   * Marca agendamento como confirmado via WhatsApp
   */
  async markAsWhatsAppConfirmed(scheduleId: number): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE of_schedules 
        SET whatsConf = 1,
            date_lastupdate = NOW()
        WHERE id = ${scheduleId}
      `;

      logger.info("Agendamento marcado como confirmado via WhatsApp", {
        scheduleId,
      });
    } catch (error) {
      logger.error("Erro ao marcar confirmação WhatsApp", error, {
        scheduleId,
      });
      throw error;
    }
  }
}

export const scheduleRepository = new ScheduleRepository();
