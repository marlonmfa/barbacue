// Classificação de lançamentos do extrato em categorias do plano de contas
// (engine.ts → CATEGORY_LABELS). Pura e testável. A ordem importa:
// regra aprendida > transferência interna > regras fixas > revisão manual.

export type BankAction = "post" | "ignore" | "review";
export interface Classification {
  action: BankAction;
  category: string | null;
  rule: string;
}
export interface LearnedRule {
  pattern: string;
  direction: "debit" | "credit";
  action: "post" | "ignore";
  category: string | null;
}
export interface BankLine {
  amountCents: number;
  name: string;
  memo: string;
  document: string | null;
}

// CNPJs do próprio grupo: dinheiro movido entre as contas não é despesa nem receita.
export const OWN_DOCUMENTS = ["33904051000105", "56307927000123"];

/** Chave do favorecido para regras aprendidas: documento ou nome normalizado. */
export function counterpartyKey(line: Pick<BankLine, "name" | "memo" | "document">) {
  if (line.document) return `doc:${line.document}`;
  const text = normalize(line.name || line.memo)
    .replace(/\b(PIX|TED|DOC|TRANSF\w*|ENVIADO|RECEBIDO|PAGAMENTO|PAGTO|PGTO|DE|PARA|A)\b/g, " ")
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `nome:${text.slice(0, 60)}`;
}
export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

type Fixed = [RegExp, BankAction, string | null, string];
// Débitos (saídas).
const DEBIT_RULES: Fixed[] = [
  [/\b(DAS|SIMPLES NAC|PGDAS|RECEITA FED|DARF|SEFAZ|ICMS|ISS\b|PREFEITURA)/, "post", "tax", "imposto"],
  [/\b(FGTS|GPS|INSS|ESOCIAL|SALARIO|FOLHA|FERIAS|RESCIS|VALE TRANSP|VT )/, "post", "payroll", "folha e encargos"],
  [/\b(TARIFA|TAR\.? |CESTA|IOF|JUROS|ENCARGO|MULTA|MANUT CONTA)/, "post", "financial", "tarifa bancária"],
  [/\b(EMPREST|FINANCIAM|PRONAMPE|CAPITAL DE GIRO|PARCELA CRED)/, "post", "loan", "empréstimo"],
  [/\b(ALUGUEL|LOCACAO|CONDOMINIO|IMOBILIARIA)/, "post", "rent", "aluguel"],
  [/\b(CELESC|ENERGIA|SAMAE|AGUA|SANEAMENTO|SUPERGASBRAS|ULTRAGAZ|LIQUIGAS|COPAGAZ|GAS\b|VIVO|CLARO|TIM\b|OI\b|INTERNET|TELEFON)/, "post", "utilities", "contas de consumo"],
  [/\b(SEGALA|TOMELIN|DEQUECH|FRIGORIF|FRIMAZO|PANIFIC|PADARIA|BEBIDAS|DISTRIBUIDORA|ATACAD|ASSAI|MAKRO|FORT ATAC|GIASSI|ANGELONI|HORTIFRUT|LATICIN|LACTEOS|ALIMENTOS|CARNES|ACOUGUE|AMBEV|HEINEKEN|COCA)/, "post", "purchase", "fornecedor de insumos"],
  [/\b(EMBALA|PAPELLO|COPAPEL|DESCARTAV|PERSONALIZAD)/, "post", "packaging", "embalagens"],
  [/\b(FACEBK|FACEBOOK|META ?PLATF|INSTAGRAM|GOOGLE ?ADS|GOOGLE\*ADS|TIKTOK)/, "post", "marketing", "marketing"],
  [/\b(ANOTA ?AI|IGROW|CONTA ?AZUL|ACESSORIAS|CONTABIL|CONTADOR|ESCRITORIO)/, "post", "admin", "administrativo"],
  [/\b(IFOOD)/, "post", "marketplace", "taxa iFood"],
  [/\b(REDECARD|REDE\b|CIELO|GETNET|STONE|PAGSEGURO|SUMUP|ALUGUEL MAQ)/, "post", "fees", "maquininha"],
  [/\b(MANUTENC|REFRIGERAC|ELETRIC|ENCANAD|DEDETIZ|IMUNIZ)/, "post", "maintenance", "manutenção"],
];
// Créditos (entradas). Vendas já entram pelos pedidos; o crédito da maquininha ou do
// Pix do cliente só confirma o recebimento e não pode entrar de novo.
const CREDIT_RULES: Fixed[] = [
  [/\b(IFOOD)/, "post", "ifood", "repasse iFood"],
  [/\b(AIQFOME|TRANSFEERA)/, "post", "sales", "repasse marketplace"],
  [/\b(REDECARD|REDE\b|CIELO|GETNET|STONE|PAGSEGURO|SUMUP|VENDAS? CART|ANTECIP)/, "ignore", null, "recebimento de cartão (vendas já contadas)"],
  [/\b(RENDIMENTO|REND\.? |JUROS|CDB|APLICAC|RESGATE)/, "post", "financial", "rendimento"],
  [/\b(EMPREST|FINANCIAM|PRONAMPE|CAPITAL DE GIRO|LIBERACAO CRED)/, "post", "loan", "empréstimo recebido"],
  [/\b(PIX RECEBIDO|PIX REC|RECEBIMENTO PIX|QR ?CODE)/, "ignore", null, "Pix de cliente (vendas já contadas)"],
];

export function classifyBankLine(line: BankLine, learned: LearnedRule[] = []): Classification {
  const direction = line.amountCents < 0 ? "debit" : "credit";
  const key = counterpartyKey(line);
  const hit = learned.find((r) => r.pattern === key && r.direction === direction);
  if (hit) return { action: hit.action, category: hit.category, rule: "regra aprendida" };
  if (line.document && OWN_DOCUMENTS.includes(line.document))
    return { action: "ignore", category: null, rule: "transferência entre contas do grupo" };
  const text = normalize(`${line.name} ${line.memo}`);
  for (const [re, action, category, rule] of direction === "debit" ? DEBIT_RULES : CREDIT_RULES)
    if (re.test(text)) return { action, category, rule };
  return { action: "review", category: null, rule: "sem regra" };
}
