import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfx, parseOfxAmount } from "../src/lib/financeiro/ofx.ts";
import { classifyBankLine, counterpartyKey } from "../src/lib/financeiro/classify.ts";

const SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>336<ACCTID>12345678<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-1.234,56<FITID>A1<MEMO>PIX ENVIADO SEGALAS ALIMENTOS LTDA 01.333.984/0002-76</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261008<TRNAMT>5320.10<FITID>A2<NAME>IFOOD.COM AGENCIA DE RESTAURANTES<MEMO>TED RECEBIDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261020<TRNAMT>-89.90<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261020<TRNAMT>-89.90<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("lê OFX SGML: conta, datas, valores com vírgula, documento e FITID estável", () => {
  const s = parseOfx(SGML);
  assert.equal(s.bankId, "336");
  assert.equal(s.accountId, "12345678");
  assert.equal(s.transactions.length, 4);
  const [a, b, c, d] = s.transactions;
  assert.deepEqual([a.date, a.amountCents, a.document], ["2026-10-03", -123456, "01333984000276"]);
  assert.equal(b.amountCents, 532010);
  // Sem FITID e repetido no mesmo dia: ids diferentes e determinísticos.
  assert.notEqual(c.fitid, d.fitid);
  assert.equal(parseOfx(SGML).transactions[3].fitid, d.fitid);
});

test("lê OFX 2 em XML e recusa arquivo que não é extrato", () => {
  const xml = `<?xml version="1.0"?><OFX><BANKACCTFROM><BANKID>077</BANKID><ACCTID>99</ACCTID></BANKACCTFROM><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>x</FITID><NAME>CELESC DISTRIBUICAO</NAME></STMTTRN></OFX>`;
  const s = parseOfx(xml);
  assert.equal(s.transactions[0].amountCents, -1000);
  assert.equal(s.transactions[0].name, "CELESC DISTRIBUICAO");
  assert.throws(() => parseOfx("data;valor\n1;2"), /OFX/);
  assert.equal(parseOfxAmount("1,234.50"), 123450);
  assert.equal(parseOfxAmount("-1.234,50"), -123450);
});

const line = (amountCents: number, name: string, document: string | null = null) => ({ amountCents, name, memo: "", document });

test("classifica saídas típicas do restaurante", () => {
  assert.equal(classifyBankLine(line(-5000, "PAGAMENTO DAS SIMPLES NACIONAL")).category, "tax");
  assert.equal(classifyBankLine(line(-5000, "PIX ENVIADO SEGALAS ALIMENTOS")).category, "purchase");
  assert.equal(classifyBankLine(line(-5000, "CELESC DISTRIBUICAO")).category, "utilities");
  assert.equal(classifyBankLine(line(-5000, "TARIFA PACOTE")).category, "financial");
  assert.equal(classifyBankLine(line(-5000, "FGTS DIGITAL")).category, "payroll");
  assert.equal(classifyBankLine(line(-5000, "FACEBK *ADS")).category, "marketing");
  assert.equal(classifyBankLine(line(-5000, "PIX ENVIADO JOAO DA SILVA")).action, "review");
});

test("entradas: repasse iFood lança, cartão e Pix de cliente não contam de novo", () => {
  assert.deepEqual(
    [classifyBankLine(line(10000, "IFOOD.COM AGENCIA")).action, classifyBankLine(line(10000, "IFOOD.COM AGENCIA")).category],
    ["post", "ifood"],
  );
  assert.equal(classifyBankLine(line(10000, "REDECARD VENDAS CREDITO")).action, "ignore");
  assert.equal(classifyBankLine(line(10000, "PIX RECEBIDO MARIA")).action, "ignore");
});

test("transferência entre empresas do grupo é ignorada e regra aprendida tem prioridade", () => {
  assert.equal(classifyBankLine(line(-100000, "TED CHELAS", "56307927000123")).action, "ignore");
  const pix = line(-15000, "PIX ENVIADO JOAO DA SILVA 12/10");
  const key = counterpartyKey(pix);
  assert.equal(key, "nome:JOAO DA SILVA");
  const c = classifyBankLine(pix, [{ pattern: key, direction: "debit", action: "post", category: "delivery" }]);
  assert.deepEqual([c.action, c.category, c.rule], ["post", "delivery", "regra aprendida"]);
  // A regra é por direção: um crédito do mesmo nome não herda a despesa.
  assert.equal(classifyBankLine({ ...pix, amountCents: 15000 }, [{ pattern: key, direction: "debit", action: "post", category: "delivery" }]).action, "review");
});
