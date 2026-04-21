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
 * Gera link do WhatsApp para um telefone.
 * Usa `wa.me` (link oficial) que abre o WhatsApp Web no desktop e o app no mobile.
 * O `web.whatsapp.com/send` direto costuma ser recusado quando o usuário não está
 * com a sessão ativa naquela aba — `wa.me` faz o roteamento correto.
 */
export function whatsappWebLink(phone: string | null | undefined, text?: string): string | null {
  const num = normalizeWhatsappPhone(phone);
  if (!num) return null;
  const base = `https://wa.me/${num}`;
  if (text) {
    const q = new URLSearchParams({ text });
    return `${base}?${q.toString()}`;
  }
  return base;
}

/** Abre o WhatsApp Web em nova aba. */
export function openWhatsappWeb(phone: string | null | undefined, text?: string): boolean {
  const url = whatsappWebLink(phone, text);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
