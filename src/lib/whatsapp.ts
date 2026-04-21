import { z } from "zod";

/**
 * Utilitários para abrir conversa no WhatsApp Web em nova aba do navegador.
 * Evita links que redirecionam para `api.whatsapp.com`, que podem ser bloqueados.
 */

const whatsappTextSchema = z.string().trim().max(2000);

/** Normaliza telefone para o formato esperado pelo WhatsApp (DDI+DDD+número). */
export function normalizeWhatsappPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  const normalized = digits.startsWith("55") ? digits : digits.length <= 11 ? `55${digits}` : digits;

  if (normalized.length < 12 || normalized.length > 15) return null;
  return normalized;
}

/**
 * Gera link oficial do WhatsApp Web para uso no desktop.
 * Usa `web.whatsapp.com/send` diretamente para evitar o redirecionamento bloqueado.
 */
export function whatsappWebLink(phone: string | null | undefined, text?: string): string | null {
  const num = normalizeWhatsappPhone(phone);
  if (!num) return null;

  const params = new URLSearchParams({
    phone: num,
    type: "phone_number",
    app_absent: "0",
  });

  if (text) {
    const parsed = whatsappTextSchema.safeParse(text);
    if (parsed.success && parsed.data) params.set("text", parsed.data);
  }

  return `https://web.whatsapp.com/send/?${params.toString()}`;
}

/** Abre o WhatsApp Web em nova aba. */
export function openWhatsappWeb(phone: string | null | undefined, text?: string): boolean {
  const url = whatsappWebLink(phone, text);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
