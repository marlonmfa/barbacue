/**
 * Pix "copia e cola" (BR Code) generator — EMV® MPM spec, BACEN-compliant.
 *
 * A static Pix charge is a TLV (Tag-Length-Value) string terminated by a
 * CRC16-CCITT checksum. No gateway/API is required: given the merchant's Pix
 * key + amount we can build a valid, bank-scannable payload entirely offline.
 *
 * Pure functions (no DOM, no Node APIs) so this runs on both server and client.
 */

export interface PixParams {
  /** Pix key: CPF/CNPJ (digits), e-mail, phone (+55…) or random (EVP) key. */
  key: string;
  /** Shown in the payer's bank app. Max 25 chars, ASCII, no accents. */
  merchantName: string;
  /** Merchant city. Max 15 chars, ASCII, no accents. */
  merchantCity: string;
  /** Amount in cents. Encoded as "0.00". Omit/0 for an open-amount code. */
  amountCents?: number;
  /** Transaction id (txid). Alphanumeric, max 25 chars. Defaults to "***". */
  txid?: string;
}

/** Emit one EMV field: 2-digit id + 2-digit length + value. */
function field(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** Strip accents and non-ASCII so bank apps render the name/city cleanly. */
function sanitize(input: string, maxLen: number): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accents
    .replace(/[^\x20-\x7E]/g, "")    // non-ASCII
    .trim()
    .slice(0, maxLen)
    .toUpperCase();
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) over the whole payload incl. "6304". */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Build the Pix BR Code ("copia e cola"). The returned string is also exactly
 * what gets encoded into the QR image.
 */
export function buildPixPayload({
  key,
  merchantName,
  merchantCity,
  amountCents,
  txid = "***",
}: PixParams): string {
  const gui = field("00", "br.gov.bcb.pix");
  const pixKey = field("01", key.trim());
  const merchantAccount = field("26", gui + pixKey);

  // txid: alphanumeric only, "***" allowed as the catch-all.
  const safeTxid = txid === "***" ? "***" : txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const additionalData = field("62", field("05", safeTxid));

  let payload =
    field("00", "01") +                          // Payload Format Indicator
    field("01", "12") +                           // Point of Initiation — single use
    merchantAccount +
    field("52", "0000") +                         // Merchant Category Code
    field("53", "986") +                          // Currency — BRL
    (amountCents && amountCents > 0
      ? field("54", (amountCents / 100).toFixed(2))
      : "") +
    field("58", "BR") +                           // Country
    field("59", sanitize(merchantName, 25)) +
    field("60", sanitize(merchantCity, 15)) +
    additionalData;

  payload += "6304"; // CRC id + length, value computed over everything before
  return payload + crc16(payload);
}
