/**
 * Utilitários para abrir conversas no WhatsApp Web (sempre na versão de
 * desktop/navegador — `web.whatsapp.com`), padronizado em todo o sistema.
 */

/** Normaliza telefone para o formato esperado pelo WhatsApp (DDI+DDD+número). */
export function normalizeWhatsappPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // Se não começa com 55 (Brasil) e parece um número BR (10–11 dígitos), prefixa.
  if (digits.startsWith("55")) return digits;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Gera link do WhatsApp Web para um telefone.
 * Sempre usa `web.whatsapp.com/send?phone=...` para forçar abrir no navegador desktop.
 */
export function whatsappWebLink(phone: string | null | undefined, text?: string): string | null {
  const num = normalizeWhatsappPhone(phone);
  if (!num) return null;
  const q = new URLSearchParams({ phone: num });
  if (text) q.set("text", text);
  return `https://web.whatsapp.com/send?${q.toString()}`;
}

/** Abre o WhatsApp Web em nova aba. */
export function openWhatsappWeb(phone: string | null | undefined, text?: string): boolean {
  const url = whatsappWebLink(phone, text);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
