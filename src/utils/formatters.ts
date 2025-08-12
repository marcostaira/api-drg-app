// src/utils/formatters.ts
// Funções de formatação para WhatsApp

/**
 * Formata número de telefone para o padrão do WhatsApp
 * Aceita vários formatos e converte para 55XXXXXXXXXXX
 */
export const formatPhoneForWhatsApp = (phone: string): string => {
  if (!phone) return "";

  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, "");

  // Remove zeros à esquerda
  cleaned = cleaned.replace(/^0+/, "");

  // Se começar com 55, mantém
  if (cleaned.startsWith("55")) {
    // Já está no formato correto
    return cleaned;
  }

  // Se tiver 11 dígitos (com DDD e 9º dígito)
  if (cleaned.length === 11) {
    return `55${cleaned}`;
  }

  // Se tiver 10 dígitos (com DDD sem 9º dígito - adiciona)
  if (cleaned.length === 10) {
    const ddd = cleaned.substring(0, 2);
    const number = cleaned.substring(2);
    // Adiciona o 9 para celulares
    return `55${ddd}9${number}`;
  }

  // Se tiver 9 dígitos (sem DDD, com 9º dígito - assume DDD 11)
  if (cleaned.length === 9 && cleaned.startsWith("9")) {
    return `5511${cleaned}`;
  }

  // Se tiver 8 dígitos (sem DDD, sem 9º dígito - assume DDD 11 e adiciona 9)
  if (cleaned.length === 8) {
    return `55119${cleaned}`;
  }

  // Se tiver 13 dígitos (já com código do país e 9º dígito)
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    return cleaned;
  }

  // Se tiver 12 dígitos (com código do país mas sem 9º dígito)
  if (cleaned.length === 12 && cleaned.startsWith("55")) {
    const countryCode = cleaned.substring(0, 2);
    const ddd = cleaned.substring(2, 4);
    const number = cleaned.substring(4);
    return `${countryCode}${ddd}9${number}`;
  }

  // Retorna o número limpo com código do Brasil por padrão
  return `55${cleaned}`;
};

/**
 * Formata data para exibição
 */
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
};

/**
 * Formata horário para exibição
 */
export const formatTime = (time: string): string => {
  if (!time) return "";

  // Se já estiver no formato HH:MM
  if (time.includes(":")) {
    return time;
  }

  // Se estiver no formato HHMM
  if (time.length === 4) {
    return `${time.substring(0, 2)}:${time.substring(2, 4)}`;
  }

  return time;
};

/**
 * Valida se o telefone é válido para WhatsApp
 */
export const isValidWhatsAppNumber = (phone: string): boolean => {
  const formatted = formatPhoneForWhatsApp(phone);

  // Deve ter entre 12 e 13 dígitos (com código do país)
  return formatted.length >= 12 && formatted.length <= 13;
};

/**
 * Extrai apenas o número nacional (sem código do país)
 */
export const extractNationalNumber = (phone: string): string => {
  const formatted = formatPhoneForWhatsApp(phone);

  if (formatted.startsWith("55")) {
    return formatted.substring(2);
  }

  return formatted;
};

/**
 * Formata mensagem de confirmação
 */
export const formatConfirmationMessage = (
  template: string,
  patientName: string,
  date: string,
  time: string,
  procedures?: string
): string => {
  return template
    .replace(/{nome}/gi, patientName)
    .replace(/{data}/gi, date)
    .replace(/{hora}/gi, time)
    .replace(/{procedimentos}/gi, procedures || "Consulta");
};
