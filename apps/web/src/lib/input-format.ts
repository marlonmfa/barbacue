/** Brazilian customer fields: keep only digits, render punctuation in the UI. */
export const digitsOnly = (value: string) => value.replace(/\D/g, "");
export function formatPhone(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const rest = digits.slice(2), split = rest.length > 8 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${rest.slice(0, split)}${rest.length > split ? `-${rest.slice(split)}` : ""}`;
}
export function formatCpf(value: string) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2").replace(/(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
}
export function canonicalPhone(value: string): string | null {
  const digits = digitsOnly(value);
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
}
