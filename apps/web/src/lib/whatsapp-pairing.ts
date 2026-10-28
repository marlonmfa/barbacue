export const WHATSAPP_PAIRING = {
  central: { name: "Integrada", phone: "5547999718315", display: "+55 47 99971-8315" },
  barbacue: { name: "Barbacue", phone: "5547997056624", display: "+55 47 99705-6624" },
  barbadog: { name: "Barbadog", phone: "5547933892175", display: "+55 47 93389-2175" },
  chelas: { name: "Chelas", phone: "5547988249667", display: "+55 47 98824-9667" },
} as const;
export type WhatsAppConnection = keyof typeof WHATSAPP_PAIRING;
