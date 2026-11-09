// Leitor de extrato OFX (1.x SGML e 2.x XML), como exportam C6, Itaú, Inter e
// a maioria dos bancos. Puro: recebe o texto e devolve os lançamentos.

export interface OfxTransaction {
  fitid: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // crédito positivo, débito negativo
  type: string;
  name: string;
  memo: string;
  /** CPF/CNPJ do favorecido quando o banco o põe no texto (só dígitos). */
  document: string | null;
}
export interface OfxStatement {
  bankId: string;
  accountId: string;
  transactions: OfxTransaction[];
}

const tag = (block: string, name: string) => {
  // SGML não fecha as tags: o valor vai até o próximo "<" ou fim de linha.
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
};

/** Valor do OFX em centavos; aceita ponto ou vírgula decimal e sinal. */
export function parseOfxAmount(raw: string) {
  let s = raw.trim().replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido no OFX: ${raw}`);
  return Math.round(n * 100);
}

function ofxDate(raw: string) {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) throw new Error(`Data inválida no OFX: ${raw}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
const CPF = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/;
export function findDocument(text: string): string | null {
  const m = text.match(CNPJ) ?? text.match(CPF);
  return m ? m[1].replace(/\D/g, "") : null;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text)) throw new Error("O arquivo não parece um extrato OFX.");
  const bankId = tag(text, "BANKID");
  const accountId = tag(text, "ACCTID");
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const seen = new Map<string, number>();
  const transactions = blocks.map((b) => {
    const date = ofxDate(tag(b, "DTPOSTED"));
    const amountCents = parseOfxAmount(tag(b, "TRNAMT"));
    const name = decodeEntities(tag(b, "NAME"));
    const memo = decodeEntities(tag(b, "MEMO"));
    // Sem FITID (alguns bancos), monta um id estável com data, valor e texto.
    const base = tag(b, "FITID") || `${date}|${amountCents}|${name}|${memo}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return {
      fitid: n ? `${base}#${n}` : base,
      date,
      amountCents,
      type: tag(b, "TRNTYPE").toUpperCase(),
      name,
      memo,
      document: findDocument(`${name} ${memo}`),
    };
  });
  if (!transactions.length) throw new Error("O extrato não tem lançamentos.");
  return { bankId, accountId, transactions };
}
