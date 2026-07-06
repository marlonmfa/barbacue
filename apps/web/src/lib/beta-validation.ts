import { z } from "zod";

// ─── WhatsApp (BR) normalization ─────────────────────────────────────────────
//
// Accepts anything a person might type — "(11) 98888-7777", "11988887777",
// "+55 11 98888-7777" — and normalizes to digits with the 55 country code
// ("5511988887777"). This matches the identity format the WhatsApp bot passes
// to /api/chat and keeps beta_signups.whatsapp joinable with customers.phone.
//
// Rules: after stripping non-digits and an optional leading 55, the national
// number must be DDD (2 digits, neither 0) + 8–9 digit subscriber number.
// 9-digit numbers (mobile) must start with 9; 8-digit numbers are accepted for
// WhatsApp Business landlines.
export function normalizeWhatsapp(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 || digits.length === 13) {
    if (!digits.startsWith("55")) return null;
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  if (ddd[0] === "0" || ddd[1] === "0") return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return "55" + digits;
}

export const betaSignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome")
    .max(120, "Nome muito longo"),
  whatsapp: z
    .string()
    .trim()
    .min(1, "Informe seu WhatsApp")
    .transform((v, ctx) => {
      const normalized = normalizeWhatsapp(v);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          message: "WhatsApp inválido — use DDD + número, ex: (11) 98888-7777",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido")),
  platform: z.enum(["ios", "android"], { message: "Escolha iPhone ou Android" }),
});

export type BetaSignupInput = z.infer<typeof betaSignupSchema>;
