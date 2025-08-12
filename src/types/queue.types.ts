// src/types/queue.types.ts
// Tipos para o sistema de filas de mensagens

export enum QueueStatus {
  AGUARDANDO = 'Aguardando',
  ENVIADA = 'Enviada',
  CANCELADA = 'Cancelada',
  ERRO = 'Erro'
}

export enum MessageDirection {
  SENT = 'sent',
  RECEIVED = 'received'
}

export enum MessageStatus {
  ENVIADA = 'Enviada',
  RECEBIDA = 'Recebida',
  ERRO = 'Erro'
}

export interface QueueItem {
  id: number;
  scheduleId: number;
  ownerId: number;
  userId: number;
  templateId: number;
  status: QueueStatus;
  createdAt: Date;
  sentAt?: Date;
}

export interface MessageLog {
  id: number;
  scheduleId: number;
  owner: number;
  userId: number;
  templateId?: number;
  direction: MessageDirection;
  message: string;
  status?: MessageStatus;
  createdAt: Date;
}

export interface ScheduleInfo {
  id: number;
  owner: number;
  patient: number;
  dates: Date;
  times: string;
  procedures?: string;
  whatsConf: boolean;
}

export interface PatientInfo {
  id: number;
  patients_name: string;
  tel1?: string;
  tel2?: string;
  email?: string;
}

export interface TemplateInfo {
  id: number;
  owner_id: number;
  type: string;
  content: string;
  active: boolean;
}

export interface EnqueueMessageRequest {
  scheduleId: number;
  userId?: number;
  templateType?: string;
}

export interface ProcessedMessage {
  phoneNumber: string;
  message: string;
  patientName: string;
  scheduleDate: string;
  scheduleTime: string;
}