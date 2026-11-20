export type CoverageStatus = "obtained" | "boundary" | "missing" | "unknown";

export type CoverageDocument = {
  id: string;
  name: string;
  storedName: string;
  period: string;
};

export type CoverageCell = {
  month: string;
  status: CoverageStatus;
  reason: string;
  documents: Array<Omit<CoverageDocument, "storedName"> & { url: string }>;
};

export type CoverageEvidence = {
  id: string;
  date: string;
  title: string;
  description: string;
  document?: Array<Omit<CoverageDocument, "storedName"> & { url: string }>[number];
};

export type CoverageGap = {
  from: string;
  to: string;
  reason: string;
  dates?: string;
};

export type CoverageAccount = {
  id: string;
  name: string;
  institution: string;
  expectedPeriod: { from: string; to: string };
  evidence: CoverageEvidence[];
  gaps: CoverageGap[];
  totals: Record<CoverageStatus, number>;
  cells: CoverageCell[];
};

const formatDay = (day: string) => day.split("-").reverse().join("/");
const dayRange = (from: string, to: string) => from === to ? formatDay(from) : `${formatDay(from)} a ${formatDay(to)}`;
const datedPdf = (id: string, name: string, from: string, to: string): CoverageDocument =>
  ({ id, name: `${name} · ${dayRange(from, to)}`, storedName: `${id}.pdf`, period: dayRange(from, to) });

const receivedStatement = (id: string, name: string, from: string, to: string) => ({
  document: datedPdf(id, name, from, to),
  period: { id, from, to },
});

const viacrediReceived = [
  receivedStatement("viacredi-2024-03-16-a-2024-06-14", "Extrato Viacredi Barbacue", "2024-03-16", "2024-06-14"),
  receivedStatement("viacredi-2024-03-17-a-2024-06-15", "Extrato Viacredi Barbacue", "2024-03-17", "2024-06-15"),
  receivedStatement("viacredi-2024-06-15-a-2024-09-13", "Extrato Viacredi Barbacue", "2024-06-15", "2024-09-13"),
  receivedStatement("viacredi-2024-06-16-a-2024-09-14", "Extrato Viacredi Barbacue", "2024-06-16", "2024-09-14"),
  receivedStatement("viacredi-2024-09-14-a-2024-12-13", "Extrato Viacredi Barbacue", "2024-09-14", "2024-12-13"),
  receivedStatement("viacredi-2024-09-15-a-2024-12-14", "Extrato Viacredi Barbacue", "2024-09-15", "2024-12-14"),
  receivedStatement("viacredi-2024-12-14-a-2025-03-14", "Extrato Viacredi Barbacue", "2024-12-14", "2025-03-14"),
  receivedStatement("viacredi-2024-12-15-a-2025-03-15", "Extrato Viacredi Barbacue", "2024-12-15", "2025-03-15"),
  receivedStatement("viacredi-2025-03-15-a-2025-06-06", "Extrato Viacredi Barbacue", "2025-03-15", "2025-06-06"),
  receivedStatement("viacredi-2025-06-07-a-2025-08-15", "Extrato Viacredi Barbacue", "2025-06-07", "2025-08-15"),
  receivedStatement("viacredi-2025-08-16-a-2025-10-21", "Extrato Viacredi Barbacue", "2025-08-16", "2025-10-21"),
  receivedStatement("viacredi-2025-10-22-a-2025-12-10", "Extrato Viacredi Barbacue", "2025-10-22", "2025-12-10"),
  receivedStatement("viacredi-2025-12-11-a-2026-02-01", "Extrato Viacredi Barbacue", "2025-12-11", "2026-02-01"),
  receivedStatement("viacredi-2026-02-02-a-2026-03-14", "Extrato Viacredi Barbacue", "2026-02-02", "2026-03-14"),
  receivedStatement("viacredi-2026-03-15-a-2026-04-17", "Extrato Viacredi Barbacue", "2026-03-15", "2026-04-17"),
  receivedStatement("viacredi-2026-04-18-a-2026-05-26", "Extrato Viacredi Barbacue", "2026-04-18", "2026-05-26"),
  receivedStatement("viacredi-2026-05-27-a-2026-06-25", "Extrato Viacredi Barbacue", "2026-05-27", "2026-06-25"),
  receivedStatement("viacredi-2026-06-26-a-2026-07-20", "Extrato Viacredi Barbacue", "2026-06-26", "2026-07-20"),
  receivedStatement("viacredi-2026-07-21-a-2026-08-20", "Extrato Viacredi Barbacue", "2026-07-21", "2026-08-20"),
  receivedStatement("viacredi-2026-08-21-a-2026-09-21", "Extrato Viacredi Barbacue", "2026-08-21", "2026-09-21"),
  receivedStatement("viacredi-2026-09-22-a-2026-10-22", "Extrato Viacredi Barbacue", "2026-09-22", "2026-10-22"),
  receivedStatement("viacredi-2026-10-22-a-2026-11-19", "Extrato Viacredi Barbacue", "2026-10-22", "2026-11-19"),
  receivedStatement("viacredi-2026-11-04-a-2026-11-19", "Extrato Viacredi Barbacue", "2026-11-04", "2026-11-19"),
];

const stoneChelasReceived = [
  receivedStatement("stone-chelas-2024-08-08-a-2025-01-01", "Extrato Stone Chelas", "2024-08-08", "2025-01-01"),
  receivedStatement("stone-chelas-2025-01-01-a-2026-11-19", "Extrato Stone Chelas", "2025-01-01", "2026-11-19"),
];

const itauChelasReceived = [
  receivedStatement("itau-chelas-2025-03-19-a-2025-07-11", "Extrato Itaú Chelas", "2025-03-19", "2025-07-11"),
  receivedStatement("itau-chelas-2025-07-11-a-2026-11-19", "Extrato Itaú Chelas", "2025-07-11", "2026-11-19"),
];

const DOCUMENTS: CoverageDocument[] = [
  ...[...viacrediReceived, ...stoneChelasReceived, ...itauChelasReceived].map(({ document }) => document),
  { id: "c6-2019", name: "Extrato C6 Barbacue — 2019", storedName: "c6-barbacue-2019.pdf", period: "30/01/2019 a 31/12/2019" },
  { id: "c6-2020", name: "Extrato C6 Barbacue — 2020", storedName: "c6-barbacue-2020.pdf", period: "01/01/2020 a 31/12/2020" },
  { id: "c6-2021", name: "Extrato C6 Barbacue — 2021", storedName: "c6-barbacue-2021.pdf", period: "01/01/2021 a 31/12/2021" },
  { id: "c6-2021-2022", name: "Extrato C6 Barbacue — 2021/2022", storedName: "c6-barbacue-2021-11-a-2022-11.pdf", period: "18/11/2021 a 18/11/2022" },
  { id: "c6-2022", name: "Extrato C6 Barbacue — 2022", storedName: "c6-barbacue-2022.pdf", period: "18/01/2022 a 31/12/2022" },
  { id: "c6-2023", name: "Extrato C6 Barbacue — 2023", storedName: "c6-barbacue-2023.pdf", period: "01/01/2023 a 31/12/2023" },
  { id: "c6-2024", name: "Extrato C6 Barbacue — 2024", storedName: "c6-barbacue-2024.pdf", period: "01/01/2024 a 31/12/2024" },
  { id: "c6-2025", name: "Extrato C6 Barbacue — 2025", storedName: "c6-barbacue-2025.pdf", period: "01/01/2025 a 31/12/2025" },
  { id: "c6-2026", name: "Extrato C6 Barbacue — 2026", storedName: "c6-barbacue-2026.pdf", period: "01/01/2026 a 18/11/2026" },
  { id: "inter-2022-2023", name: "Extrato Inter Barbacue — 2022/2023", storedName: "inter-barbacue-2022-04-a-2023-04.pdf", period: "04/04/2022 a 04/04/2023" },
  { id: "inter-2023-03-12", name: "Extrato Inter Barbacue — março a dezembro de 2023", storedName: "inter-barbacue-2023-03-a-2023-12.pdf", period: "01/03/2023 a 31/12/2023" },
  { id: "inter-2024-01", name: "Extrato Inter Barbacue — janeiro de 2024", storedName: "inter-barbacue-2024-01.pdf", period: "01/01/2024 a 31/01/2024" },
  { id: "inter-2024-02-11", name: "Extrato Inter Barbacue — fevereiro a novembro de 2024", storedName: "inter-barbacue-2024-02-a-2024-11.csv", period: "01/02/2024 a 30/11/2024" },
  { id: "inter-2024-2026", name: "Extrato Inter Barbacue — 2024/2026", storedName: "inter-barbacue-2024-11-a-2026-11.pdf", period: "18/11/2024 a 18/11/2026" },
  { id: "inter-2025", name: "Extrato Inter Barbacue — 2025", storedName: "inter-barbacue-2025.pdf", period: "01/01/2025 a 31/12/2025" },
  { id: "viacredi-2025-2026", name: "Extrato especial Viacredi Barbacue — 2026", storedName: "viacredi-barbacue-2025-12-a-2026-11.pdf", period: "05/01/2026 a 11/11/2026" },
  { id: "viacredi-2026-01", name: "Extrato Viacredi Barbacue — janeiro de 2026", storedName: "viacredi-barbacue-2026-01.pdf", period: "janeiro de 2026" },
  { id: "itau-barbacue-2025-2026", name: "Extrato Itaú Barbacue — janeiro a novembro de 2026", storedName: "itau-barbacue-2025-03-a-2026-11.pdf", period: "01/01/2026 a 02/11/2026" },
  { id: "itau-chelas-2025-2026", name: "Extrato Itaú Chelas — janeiro a novembro de 2026", storedName: "itau-chelas-2025-03-a-2026-11.pdf", period: "01/01/2026 a 02/11/2026" },
  datedPdf("inter-2020-2022", "Extrato Inter Barbacue", "2020-05-31", "2022-05-31"),
  datedPdf("itau-barbacue-historico", "Extrato Itaú Barbacue", "2025-03-18", "2026-01-18"),
  datedPdf("itau-chelas-historico", "Extrato Itaú Chelas", "2025-11-18", "2026-03-18"),
  datedPdf("viacredi-september-2023", "Extrato Viacredi Barbacue", "2023-09-01", "2023-09-30"),
  datedPdf("viacredi-october-2023", "Extrato Viacredi Barbacue", "2023-10-01", "2023-10-31"),
  datedPdf("viacredi-january-2024", "Extrato Viacredi Barbacue", "2024-01-01", "2024-01-31"),
  datedPdf("viacredi-february-2024", "Extrato Viacredi Barbacue", "2024-02-01", "2024-02-29"),
  datedPdf("viacredi-march-june-2024", "Extrato Viacredi Barbacue", "2024-03-18", "2024-06-16"),
  datedPdf("viacredi-june-september-2024", "Extrato Viacredi Barbacue", "2024-06-16", "2024-09-14"),
  datedPdf("viacredi-september-december-2024", "Extrato Viacredi Barbacue", "2024-09-14", "2024-12-13"),
  datedPdf("viacredi-december-march-2025", "Extrato Viacredi Barbacue", "2024-12-13", "2025-03-13"),
  datedPdf("viacredi-march-may-2025", "Extrato Viacredi Barbacue", "2025-03-13", "2025-05-10"),
  datedPdf("viacredi-may-july-2025", "Extrato Viacredi Barbacue", "2025-05-10", "2025-07-10"),
  datedPdf("viacredi-july-september-2025", "Extrato Viacredi Barbacue", "2025-07-10", "2025-09-10"),
  datedPdf("viacredi-september-november-2025", "Extrato Viacredi Barbacue", "2025-09-10", "2025-11-10"),
  datedPdf("viacredi-november-december-2025", "Extrato Viacredi Barbacue", "2025-11-10", "2025-12-31"),
  datedPdf("stone-barbacue-2026-09", "Extrato Stone Barbacue · 91942192-5", "2026-09-01", "2026-09-30"),
  datedPdf("stone-barbacue-2026-10", "Extrato Stone Barbacue · 91942192-5", "2026-10-01", "2026-10-31"),
  datedPdf("stone-barbacue-2026-11", "Extrato Stone Barbacue · 91942192-5", "2026-11-01", "2026-11-18"),
  { id: "stone-chelas-pix-2026-11-18", name: "Comprovante Pix Stone Chelas", storedName: "stone-chelas-pix-2026-11-18.pdf", period: "18/11/2026" },
];

const byId = new Map(DOCUMENTS.map((document) => [document.id, document]));
const monthKeys = (() => {
  const result: string[] = [];
  for (let year = 2019; year <= 2026; year += 1) {
    const finalMonth = year === 2026 ? 11 : 12;
    for (let month = 1; month <= finalMonth; month += 1) result.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return result;
})();

type Interval = { from: string; to: string; status: Exclude<CoverageStatus, "unknown">; reason: string };
type EvidenceDefinition = Omit<CoverageEvidence, "document"> & { documentId?: string };
type Definition = {
  id: string;
  name: string;
  institution: string;
  expectedPeriod: { from: string; to: string };
  evidence: EvidenceDefinition[];
  intervals?: Interval[];
  documents?(month: string): string[];
  daily?: { from: string; to: string; statements: Statement[] };
};

const interval = (from: string, to: string, status: Interval["status"], reason: string): Interval => ({ from, to, status, reason });
const inside = (month: string, from: string, to: string) => month >= from && month <= to;
const docForYear = (prefix: string, month: string) => `${prefix}-${month.slice(0, 4)}`;

type Statement = { id: string; from: string; to: string };
const statement = (id: string, from: string, to: string): Statement => ({ id, from, to });
const cutoff = "2026-11-18";

const viacrediStatements = [
  ...viacrediReceived.map(({ period }) => period),
  statement("viacredi-september-2023", "2023-09-01", "2023-09-30"),
  statement("viacredi-october-2023", "2023-10-01", "2023-10-31"),
  statement("viacredi-january-2024", "2024-01-01", "2024-01-31"),
  statement("viacredi-february-2024", "2024-02-01", "2024-02-29"),
  statement("viacredi-march-june-2024", "2024-03-18", "2024-06-16"),
  statement("viacredi-june-september-2024", "2024-06-16", "2024-09-14"),
  statement("viacredi-september-december-2024", "2024-09-14", "2024-12-13"),
  statement("viacredi-december-march-2025", "2024-12-13", "2025-03-13"),
  statement("viacredi-march-may-2025", "2025-03-13", "2025-05-10"),
  statement("viacredi-may-july-2025", "2025-05-10", "2025-07-10"),
  statement("viacredi-july-september-2025", "2025-07-10", "2025-09-10"),
  statement("viacredi-september-november-2025", "2025-09-10", "2025-11-10"),
  statement("viacredi-november-december-2025", "2025-11-10", "2025-12-31"),
  statement("viacredi-2026-01", "2026-01-01", "2026-01-31"),
  statement("viacredi-2025-2026", "2026-01-05", "2026-11-11"),
];

const definitions: Definition[] = [
  {
    id: "inter-pj-barbacue", name: "Inter PJ Barbacue", institution: "Banco Inter",
    expectedPeriod: { from: "2020-05", to: "2026-11" },
    evidence: [
      { id: "inter-first", date: "2020-05", title: "Extrato histórico de 31/05/2020 a 31/05/2022", description: "O primeiro lançamento registrado é de 03/03/2022. A data de abertura da conta ainda precisa ser confirmada.", documentId: "inter-2020-2022" },
      { id: "inter-current", date: "2026-11", title: "Cobertura documental até 18/11/2026", description: "Os extratos da conta formam uma série contínua desde 31/05/2020.", documentId: "inter-2024-2026" },
    ],
    daily: { from: "2020-05-31", to: cutoff, statements: [
      statement("inter-2020-2022", "2020-05-31", "2022-05-31"),
      statement("inter-2022-2023", "2022-04-04", "2023-04-04"),
      statement("inter-2023-03-12", "2023-03-01", "2023-12-31"),
      statement("inter-2024-01", "2024-01-01", "2024-01-31"),
      statement("inter-2024-02-11", "2024-02-01", "2024-11-30"),
      statement("inter-2024-2026", "2024-11-18", cutoff),
      statement("inter-2025", "2025-01-01", "2025-12-31"),
    ] },
  },
  {
    id: "c6-pj-barbacue", name: "C6 PJ Barbacue", institution: "C6 Bank",
    expectedPeriod: { from: "2019-01", to: "2026-11" },
    evidence: [
      { id: "c6-first", date: "2019-01", title: "Conta comprovada em janeiro de 2019", description: "O primeiro extrato oficial localizado inicia em 30/01/2019.", documentId: "c6-2019" },
      { id: "c6-current", date: "2026-11", title: "Série anual contínua até 2026", description: "Os extratos anuais e o arquivo sobreposto comprovam a continuidade da conta.", documentId: "c6-2026" },
    ],
    intervals: [interval("2019-01", "2019-01", "boundary", "O extrato começa em 30/01; o início do mês não está comprovado."), interval("2019-02", "2026-10", "obtained", "Mês integralmente coberto pelo extrato bancário."), interval("2026-11", "2026-11", "boundary", "Extrato emitido em 18/11; o fim do mês ainda não existia na emissão.")],
    documents: (month) => inside(month, "2019-01", "2026-11") ? [docForYear("c6", month), ...(inside(month, "2021-11", "2022-11") ? ["c6-2021-2022"] : [])] : [],
  },
  {
    id: "viacredi-barbacue", name: "Viacredi Barbacue", institution: "Viacredi",
    expectedPeriod: { from: "2023-09", to: "2026-11" },
    evidence: [
      { id: "viacredi-first", date: "2023-09", title: "Primeiro extrato localizado", description: "A conta 16630114 tem extratos mensais a partir de setembro de 2023. Ainda falta confirmar a abertura.", documentId: "viacredi-september-2023" },
      { id: "viacredi-current", date: "2026-11", title: "Extratos atualizados até 19/11/2026", description: "O novo lote cobre o trecho de novembro que estava em aberto. As lacunas de 2023 e 2024 permanecem detalhadas nesta conta.", documentId: "viacredi-2026-10-22-a-2026-11-19" },
    ],
    daily: { from: "2023-09-01", to: cutoff, statements: viacrediStatements },
  },
  ...(["barbacue", "chelas"] as const).map((company): Definition => {
    const isBarbacue = company === "barbacue";
    return {
      id: `itau-${company}`, name: `Itaú ${isBarbacue ? "Barbacue" : "Chelas"}`, institution: "Itaú",
      expectedPeriod: { from: "2025-03", to: "2026-11" },
      evidence: [
        { id: `itau-${company}-first`, date: "2025-03", title: "Abertura registrada em março de 2025", description: isBarbacue ? "O extrato histórico começa em 18/03/2025 e traz o saldo anterior de 17/03, dia da abertura." : "A abertura está registrada em 14/03/2025. Os lançamentos do novo extrato começam em 19/03, com saldo anterior de 18/03.", documentId: isBarbacue ? "itau-barbacue-historico" : "itau-chelas-2025-03-19-a-2025-07-11" },
        { id: `itau-${company}-current`, date: "2026-11", title: isBarbacue ? "Extrato até 02/11/2026" : "Extrato até 19/11/2026", description: isBarbacue ? "O período impresso vai de 01/01 a 02/11/2026. O saldo de 02/11 consta no arquivo." : "A segunda parte dos lançamentos vai de 11/07/2025 a 19/11/2026.", documentId: isBarbacue ? "itau-barbacue-2025-2026" : "itau-chelas-2025-07-11-a-2026-11-19" },
      ],
      daily: { from: isBarbacue ? "2025-03-18" : "2025-03-14", to: cutoff, statements: [
        isBarbacue
          ? statement("itau-barbacue-historico", "2025-03-18", "2026-01-18")
          : statement("itau-chelas-historico", "2025-11-18", "2026-03-18"),
        statement(`itau-${company}-2025-2026`, "2026-01-01", "2026-11-02"),
        ...(!isBarbacue ? itauChelasReceived.map(({ period }) => period) : []),
      ] },
    };
  }),
  {
    id: "stone-chelas", name: "Stone Chelas", institution: "Stone",
    expectedPeriod: { from: "2024-08", to: "2026-11" },
    evidence: [
      { id: "stone-chelas-reference", date: "2024-08", title: "Extrato desde 08/08/2024", description: "A primeira parte cobre 08/08/2024 a 01/01/2025.", documentId: "stone-chelas-2024-08-08-a-2025-01-01" },
      { id: "stone-chelas-current", date: "2026-11", title: "Extrato até 19/11/2026", description: "A segunda parte completa a cobertura da conta 59406243-2 de 01/01/2025 a 19/11/2026.", documentId: "stone-chelas-2025-01-01-a-2026-11-19" },
      { id: "stone-chelas-pix", date: "2026-11", title: "Comprovante Pix de 18/11/2026", description: "O comprovante confirma a conta e a data da transferência.", documentId: "stone-chelas-pix-2026-11-18" },
    ],
    daily: { from: "2024-08-08", to: cutoff, statements: stoneChelasReceived.map(({ period }) => period) },
  },
  {
    id: "stone-barbacue-antiga", name: "Stone Barbacue — conta antiga", institution: "Stone",
    expectedPeriod: { from: "2021-05", to: "2022-03" },
    evidence: [
      { id: "stone-old-first", date: "2021-05", title: "Pagamentos confirmados de 24 a 31/05/2021", description: "Dez avisos da Conta Stone registram pagamentos nesse intervalo. O extrato e a data de abertura ainda não foram localizados." },
      { id: "stone-old-last", date: "2022-03", title: "Pagamentos confirmados de 02 a 29/03/2022", description: "Três avisos da Conta Stone registram pagamentos nesse intervalo. O extrato e a data de encerramento ainda não foram localizados." },
    ],
    daily: { from: "2021-05-24", to: "2022-03-29", statements: [] },
  },
  {
    id: "stone-barbacue-nova", name: "Stone Barbacue — histórico a identificar", institution: "Stone",
    expectedPeriod: { from: "2024-01", to: "2025-12" },
    evidence: [
      { id: "stone-new-reference", date: "2024-01", title: "Referências à Stone em 2024 e 2025", description: "Ainda falta identificar a conta mencionada e confirmar se corresponde à conta 91942192-5." },
    ],
  },
  {
    id: "stone-barbacue-91942192", name: "Stone Barbacue — conta 91942192-5", institution: "Stone",
    expectedPeriod: { from: "2026-09", to: "2026-11" },
    evidence: [
      { id: "stone-barbacue-first", date: "2026-09", title: "Primeiro extrato com a titularidade confirmada", description: "Agência 0001, conta 91942192-5, em nome do Barbacue desde o primeiro extrato disponível, de setembro de 2026.", documentId: "stone-barbacue-2026-09" },
      { id: "stone-barbacue-current", date: "2026-11", title: "Extrato até 18/11/2026", description: "Setembro e outubro estão completos. O extrato de novembro vai até o dia 18.", documentId: "stone-barbacue-2026-11" },
    ],
    daily: { from: "2026-09-01", to: cutoff, statements: [
      statement("stone-barbacue-2026-09", "2026-09-01", "2026-09-30"),
      statement("stone-barbacue-2026-10", "2026-10-01", "2026-10-31"),
      statement("stone-barbacue-2026-11", "2026-11-01", cutoff),
    ] },
  },
  {
    id: "ifood-pago", name: "iFood Pago", institution: "iFood",
    expectedPeriod: { from: "2021-05", to: "2026-07" },
    evidence: [
      { id: "ifood-reference", date: "2021-05", title: "Conta Digital iFood identificada", description: "O lembrete de 19/05/2021 identifica a conta final 317. O extrato da conta ainda não foi localizado." },
      { id: "ifood-last-account-evidence", date: "2026-07", title: "Última evidência direta em julho de 2026", description: "Em 11/07/2026 houve aviso de autorização de aparelho para a Conta Digital iFood." },
      { id: "ifood-later-receivables", date: "2026-08", title: "Uso da conta final 317 a confirmar de agosto a outubro de 2026", description: "A pesquisa de 14/08 não identifica a conta. Os registros de recebíveis do Barbacue de agosto a outubro indicam uma conta Itaú." },
    ],
    intervals: [
      interval("2021-05", "2021-05", "boundary", "Primeira referência conhecida; falta confirmar a data de abertura."),
      interval("2021-06", "2026-07", "missing", "Extratos mensais ainda não foram recebidos."),
    ],
  },
];

export function getCoverageDocument(id: string): CoverageDocument | undefined {
  return byId.get(id);
}

const millisecondsPerDay = 86_400_000;
const dayNumber = (day: string) => Date.parse(day) / millisecondsPerDay;
const isoDay = (day: number) => new Date(day * millisecondsPerDay).toISOString().slice(0, 10);

function missingRanges(coverage: NonNullable<Definition["daily"]>): CoverageGap[] {
  const ranges: CoverageGap[] = [];
  const end = dayNumber(coverage.to);
  let next = dayNumber(coverage.from);
  const addGap = (first: number, last: number) => {
    const from = isoDay(first);
    const to = isoDay(last);
    ranges.push({ from: from.slice(0, 7), to: to.slice(0, 7), dates: dayRange(from, to), reason: "Falta extrato para este intervalo." });
  };
  for (const period of [...coverage.statements].sort((a, b) => a.from.localeCompare(b.from))) {
    const start = dayNumber(period.from);
    if (start > end) break;
    if (start > next) addGap(next, start - 1);
    next = Math.max(next, dayNumber(period.to) + 1);
  }
  if (next <= end) addGap(next, end);
  return ranges;
}

function dailyCell(month: string, coverage: NonNullable<Definition["daily"]>, gaps: CoverageGap[]) {
  const start = dayNumber(`${month}-01`);
  const [year, monthNumber] = month.split("-").map(Number);
  const end = Date.UTC(year, monthNumber, 0) / millisecondsPerDay;
  const from = Math.max(start, dayNumber(coverage.from));
  const to = Math.min(end, dayNumber(coverage.to));
  const periods = coverage.statements.filter((period) => dayNumber(period.from) <= to && dayNumber(period.to) >= from);
  const documentIds = periods.map((period) => period.id);
  const pending = gaps.filter((gap) => inside(month, gap.from, gap.to));
  const details = {
    status: "unknown" as CoverageStatus,
    reason: "A existência da conta neste mês ainda precisa ser confirmada.",
    documentIds,
  };
  if (from > to) return details;
  if (pending.length) {
    return {
      ...details,
      status: periods.length ? "boundary" as const : "missing" as const,
      reason: `Falta extrato de ${pending.map((gap) => gap.dates).join(", ")}.`,
    };
  }
  if (from === start && to === end) return { ...details, status: "obtained" as const, reason: "Mês integralmente coberto pelos extratos." };
  return { ...details, status: "boundary" as const, reason: `Extratos disponíveis de ${dayRange(isoDay(from), isoDay(to))} neste mês.` };
}

export function buildDocumentCoverage() {
  const accounts: CoverageAccount[] = definitions.map((definition) => {
    const gaps = definition.daily
      ? missingRanges(definition.daily)
      : (definition.intervals ?? []).filter((item) => item.status === "missing").map(({ from, to, reason }) => ({ from, to, reason }));
    const cells: CoverageCell[] = monthKeys.map((month) => {
      const interval = definition.intervals?.find((item) => inside(month, item.from, item.to));
      const { status, reason, documentIds }: { status: CoverageStatus; reason: string; documentIds: string[] } = definition.daily ? dailyCell(month, definition.daily, gaps) : {
        status: interval?.status ?? "unknown",
        reason: interval?.reason ?? "Não há base suficiente para afirmar se a conta existia neste mês.",
        documentIds: definition.documents?.(month) ?? [],
      };
      const documents = documentIds.map((id) => byId.get(id)).filter((document): document is CoverageDocument => Boolean(document)).map(({ storedName: _storedName, ...document }) => ({ ...document, url: `/api/admin/document-coverage/files/${document.id}` }));
      return { month, status, reason, documents };
    });
    const totals = cells.reduce<Record<CoverageStatus, number>>((result, cell) => ({ ...result, [cell.status]: result[cell.status] + 1 }), { obtained: 0, boundary: 0, missing: 0, unknown: 0 });
    const evidence = definition.evidence.map(({ documentId, ...item }) => {
      const document = documentId ? byId.get(documentId) : undefined;
      return {
        ...item,
        ...(document ? { document: { id: document.id, name: document.name, period: document.period, url: `/api/admin/document-coverage/files/${document.id}` } } : {}),
      };
    });
    return { id: definition.id, name: definition.name, institution: definition.institution, expectedPeriod: definition.expectedPeriod, evidence, gaps, totals, cells };
  });
  const summary = accounts.flatMap((account) => account.cells).reduce<Record<CoverageStatus, number>>((totals, cell) => ({ ...totals, [cell.status]: totals[cell.status] + 1 }), { obtained: 0, boundary: 0, missing: 0, unknown: 0 });
  return { generatedAt: "2026-11-19T20:59:18-03:00", months: monthKeys, accounts, summary };
}

export function getCoverageAccount(id: string): CoverageAccount | undefined {
  return buildDocumentCoverage().accounts.find((account) => account.id === id);
}
