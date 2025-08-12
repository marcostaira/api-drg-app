// src/utils/logger.ts
// Sistema de logs completo para a aplicação

import { config } from "../config/config";
import * as fs from "fs";
import * as path from "path";

export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
  TRACE = "trace",
}

interface LogMetadata {
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMetadata;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private isDevelopment = config.nodeEnv === "development";
  private isProduction = config.nodeEnv === "production";
  private logDir = path.join(process.cwd(), "logs");
  private currentLogFile: string | null = null;

  constructor() {
    // Criar diretório de logs se não existir (apenas em produção)
    if (this.isProduction) {
      this.ensureLogDirectory();
      this.setLogFile();
    }
  }

  /**
   * Garante que o diretório de logs existe
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Define o arquivo de log atual
   */
  private setLogFile(): void {
    const date = new Date().toISOString().split("T")[0];
    this.currentLogFile = path.join(this.logDir, `app-${date}.log`);
  }

  /**
   * Formata a mensagem de log
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    meta?: LogMetadata
  ): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] [${level
      .toUpperCase()
      .padEnd(5)}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      const metaString = this.isDevelopment
        ? JSON.stringify(meta, null, 2)
        : JSON.stringify(meta);
      return `${baseMessage}\n${metaString}`;
    }

    return baseMessage;
  }

  /**
   * Formata erro para log
   */
  private formatError(error: Error | any): object {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...((error as any).code && { code: (error as any).code }),
      };
    }
    return { message: String(error) };
  }

  /**
   * Escreve no arquivo de log (produção)
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.isProduction || !this.currentLogFile) return;

    try {
      const logLine = JSON.stringify(entry) + "\n";
      fs.appendFileSync(this.currentLogFile, logLine);
    } catch (error) {
      console.error("Erro ao escrever no arquivo de log:", error);
    }
  }

  /**
   * Método principal de log
   */
  private log(
    level: LogLevel,
    message: string,
    meta?: LogMetadata | Error
  ): void {
    // Verificar se deve logar baseado no nível
    if (level === LogLevel.DEBUG && !this.isDevelopment) return;
    if (level === LogLevel.TRACE && !this.isDevelopment) return;

    let logMeta: LogMetadata | undefined;
    let logError: object | undefined;

    // Separar erro de metadata
    if (meta instanceof Error) {
      logError = this.formatError(meta);
    } else {
      logMeta = meta;
    }

    // Criar entrada de log
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(logMeta && { meta: logMeta }),
      ...(logError && { error: logError as any }),
    };

    // Escrever no arquivo (produção)
    this.writeToFile(entry);

    // Output no console
    const formattedMessage = this.formatMessage(level, message, logMeta);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        if (logError) console.error(logError);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.DEBUG:
        if (this.isDevelopment) console.debug(formattedMessage);
        break;
      case LogLevel.TRACE:
        if (this.isDevelopment) console.trace(formattedMessage);
        break;
    }
  }

  /**
   * Log de erro
   */
  error(message: string, error?: Error | any, meta?: LogMetadata): void {
    const fullMeta = { ...meta };
    if (error && !(error instanceof Error)) {
      Object.assign(fullMeta, error);
      this.log(LogLevel.ERROR, message, fullMeta);
    } else {
      this.log(LogLevel.ERROR, message, error || meta);
    }
  }

  /**
   * Log de aviso
   */
  warn(message: string, meta?: LogMetadata): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * Log de informação
   */
  info(message: string, meta?: LogMetadata): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Log de debug (apenas desenvolvimento)
   */
  debug(message: string, meta?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * Log de trace (apenas desenvolvimento)
   */
  trace(message: string, meta?: LogMetadata): void {
    this.log(LogLevel.TRACE, message, meta);
  }

  /**
   * Log específico para webhooks
   */
  webhook(event: string, data: any, success: boolean = true): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const meta = {
      event,
      data: this.isDevelopment
        ? data
        : {
            id: data.id || data.messageId || "unknown",
            type: data.type || data.event || "unknown",
          },
      success,
    };

    this.log(
      level,
      `Webhook ${success ? "received" : "failed"}: ${event}`,
      meta
    );
  }

  /**
   * Log específico para requisições API
   */
  api(
    method: string,
    path: string,
    statusCode: number,
    duration?: number,
    error?: Error
  ): void {
    const level =
      statusCode >= 500
        ? LogLevel.ERROR
        : statusCode >= 400
        ? LogLevel.WARN
        : LogLevel.INFO;

    const meta: LogMetadata = {
      method,
      path,
      statusCode,
      ...(duration && { duration: `${duration}ms` }),
    };

    const message = `${method} ${path} - ${statusCode}`;

    if (error) {
      this.log(level, message, { ...meta, error: this.formatError(error) });
    } else {
      this.log(level, message, meta);
    }
  }

  /**
   * Log específico para banco de dados
   */
  database(
    operation: string,
    table: string,
    duration?: number,
    error?: Error
  ): void {
    const meta: LogMetadata = {
      operation,
      table,
      ...(duration && { duration: `${duration}ms` }),
    };

    if (error) {
      this.error(`Database error: ${operation} on ${table}`, error, meta);
    } else {
      this.debug(`Database: ${operation} on ${table}`, meta);
    }
  }

  /**
   * Log específico para fila de mensagens
   */
  queue(action: string, data: any, error?: Error): void {
    const meta: LogMetadata = {
      action,
      scheduleId: data.scheduleId || data.schedule_id,
      patientId: data.patientId || data.patient_id,
      status: data.status,
      ...(data.phoneNumber && { phone: this.maskPhone(data.phoneNumber) }),
    };

    if (error) {
      this.error(`Queue error: ${action}`, error, meta);
    } else {
      this.info(`Queue: ${action}`, meta);
    }
  }

  /**
   * Log específico para WhatsApp
   */
  whatsapp(action: string, data: any, error?: Error): void {
    const meta: LogMetadata = {
      action,
      tenantId: data.tenantId,
      sessionName: data.sessionName,
      ...(data.phoneNumber && { phone: this.maskPhone(data.phoneNumber) }),
      ...(data.status && { status: data.status }),
    };

    if (error) {
      this.error(`WhatsApp error: ${action}`, error, meta);
    } else {
      this.info(`WhatsApp: ${action}`, meta);
    }
  }

  /**
   * Log específico para Evolution API
   */
  evolution(
    action: string,
    instanceName: string,
    data?: any,
    error?: Error
  ): void {
    const meta: LogMetadata = {
      action,
      instanceName,
      ...(data && {
        status: data.status,
        state: data.state,
      }),
    };

    if (error) {
      this.error(`Evolution API error: ${action}`, error, meta);
    } else {
      this.debug(`Evolution API: ${action}`, meta);
    }
  }

  /**
   * Mascara número de telefone para logs
   */
  private maskPhone(phone: string): string {
    if (!phone || phone.length < 8) return phone;
    const visibleStart = phone.slice(0, 4);
    const visibleEnd = phone.slice(-2);
    const maskedMiddle = "*".repeat(Math.max(0, phone.length - 6));
    return `${visibleStart}${maskedMiddle}${visibleEnd}`;
  }

  /**
   * Limpa logs antigos (manter apenas últimos 30 dias)
   */
  async cleanOldLogs(daysToKeep: number = 30): Promise<void> {
    if (!this.isProduction) return;

    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith(".log")) continue;

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          this.info(`Log antigo removido: ${file}`);
        }
      }
    } catch (error) {
      this.error("Erro ao limpar logs antigos", error);
    }
  }

  /**
   * Obtém o tamanho total dos logs
   */
  getLogSize(): { files: number; totalSize: string } {
    if (!this.isProduction) {
      return { files: 0, totalSize: "0 KB" };
    }

    try {
      const files = fs.readdirSync(this.logDir);
      let totalSize = 0;
      let logFiles = 0;

      for (const file of files) {
        if (!file.endsWith(".log")) continue;
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        logFiles++;
      }

      const sizeInKB = (totalSize / 1024).toFixed(2);
      const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
      const sizeString =
        totalSize > 1024 * 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`;

      return { files: logFiles, totalSize: sizeString };
    } catch (error) {
      this.error("Erro ao calcular tamanho dos logs", error);
      return { files: 0, totalSize: "0 KB" };
    }
  }
}

// Exportar instância única
export const logger = new Logger();

// Exportar também a classe caso precise de múltiplas instâncias
export { Logger };

// Função helper para medir duração
export function measureDuration(startTime: number): number {
  return Date.now() - startTime;
}

// Decorator para log automático de métodos (TypeScript)
export function LogExecution(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startTime = Date.now();
    const className = target.constructor.name;
    const methodName = propertyKey;

    logger.debug(`${className}.${methodName} iniciado`, { args: args.length });

    try {
      const result = await originalMethod.apply(this, args);
      const duration = measureDuration(startTime);
      logger.debug(`${className}.${methodName} concluído`, {
        duration: `${duration}ms`,
      });
      return result;
    } catch (error) {
      const duration = measureDuration(startTime);
      logger.error(`${className}.${methodName} falhou`, error as Error, {
        duration: `${duration}ms`,
      });
      throw error;
    }
  };

  return descriptor;
}
