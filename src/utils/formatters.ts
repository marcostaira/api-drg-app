// src/utils/formatters.ts
// Funções de formatação para WhatsApp

/**
 * Formata número de telefone para o padrão do WhatsApp - CORRIGIDO
 */
export const formatPhoneForWhatsApp = (phone: string): string => {
  if (!phone) return "";

  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, "");

  // Remove zeros à esquerda
  cleaned = cleaned.replace(/^0+/, "");

  console.log("🔍 Formatando telefone:", {
    original: phone,
    cleaned: cleaned,
    length: cleaned.length,
  });

  // Se já tem 13 dígitos e começa com 55
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    console.log("✅ Número já formatado corretamente:", cleaned);
    return cleaned;
  }

  // Se tem 11 dígitos (DDD + 9 + 8 dígitos)
  if (cleaned.length === 11) {
    const formatted = `55${cleaned}`;
    console.log("✅ Adicionado código do país:", formatted);
    return formatted;
  }

  // Se tem 12 dígitos e começa com 55 (sem o 9)
  if (cleaned.length === 12 && cleaned.startsWith("55")) {
    const ddd = cleaned.substring(2, 4);
    const number = cleaned.substring(4);
    const formatted = `55${ddd}9${number}`;
    console.log("✅ Adicionado nono dígito:", formatted);
    return formatted;
  }

  // Log de debug para outros casos
  console.log("⚠️ Formato não reconhecido, retornando como está:", cleaned);
  return cleaned;
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
