import { z } from "zod";
import { barbaContactPhone } from "./barba-contact";

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable().optional();

export const staffContactFields = {
  whatsappPhone: z.string().trim().max(30).transform((value, ctx) => {
    if (!value) return null;
    const phone = /^[+\d().\s-]+$/.test(value) ? barbaContactPhone(value) : null;
    if (phone) return phone;
    ctx.addIssue({ code: "custom", message: "Informe um WhatsApp com DDD." });
    return z.NEVER;
  }).nullable().optional(),
  vehicleModel: optionalText(80),
  vehicleColor: optionalText(40),
  vehiclePlate: optionalText(16).transform((value, ctx) => {
    if (value == null) return value;
    const plate = value.replace(/[\s-]/g, "").toUpperCase();
    if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) return plate;
    ctx.addIssue({ code: "custom", message: "Informe uma placa completa ou deixe o campo em branco." });
    return z.NEVER;
  }),
};

export function staffContactSelection<T extends typeof import("@/db/schema").staffUsers>(table: T) {
  return {
    whatsappPhone: table.whatsappPhone,
    vehicleModel: table.vehicleModel,
    vehicleColor: table.vehicleColor,
    vehiclePlate: table.vehiclePlate,
  };
}
