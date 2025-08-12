// src/jobs/queueProcessor.ts
// Job para processar fila automaticamente com configurações

import { queueService } from "../services/queueService";
import { logger } from "../utils/logger";
import { config } from "../config/config";

export class QueueProcessor {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  /**
   * Inicia o processamento automático da fila
   */
  start(intervalMinutes?: number): void {
    if (this.intervalId) {
      logger.warn("Queue processor já está rodando");
      return;
    }

    const interval = intervalMinutes || config.queueProcessInterval;
    const intervalMs = interval * 60 * 1000;

    logger.info(
      `Iniciando queue processor com intervalo de ${interval} minutos`
    );
    logger.info(`Batch size: ${config.queueBatchSize} mensagens`);
    logger.info(`Delay entre mensagens: ${config.queueDelayBetweenMessages}ms`);

    // Processar imediatamente na primeira vez
    this.processQueue();

    // Configurar intervalo
    this.intervalId = setInterval(() => {
      this.processQueue();
    }, intervalMs);
  }

  /**
   * Para o processamento automático
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Queue processor parado");
    }
  }

  /**
   * Processa a fila
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.info("Processamento já em andamento, pulando...");
      return;
    }

    this.isProcessing = true;

    try {
      logger.info("Iniciando processamento da fila");
      await queueService.processQueue(config.queueBatchSize);
      logger.info("Processamento da fila concluído");
    } catch (error) {
      logger.error("Erro no processamento da fila", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Verifica se está processando
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Processa uma vez manualmente
   */
  async processOnce(limit?: number): Promise<void> {
    if (this.isProcessing) {
      throw new Error("Processamento já em andamento");
    }

    this.isProcessing = true;
    try {
      await queueService.processQueue(limit || config.queueBatchSize);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const queueProcessor = new QueueProcessor();
