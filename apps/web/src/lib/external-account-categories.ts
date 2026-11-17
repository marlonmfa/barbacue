export const externalCategories = [
  "A identificar", "Fornecedor / Insumos alimentícios", "Fornecedor / Bebidas",
  "Fornecedor / Embalagens", "Fornecedor / Limpeza e higiene", "Fornecedor / Equipamentos",
  "Fornecedor / Manutenção", "Fornecedor / Serviços", "Fornecedor / Outros",
  "Pessoal / Salário — vínculo a confirmar", "Pessoal / Salário CLT", "Pessoal / Remuneração PJ",
  "Pessoal / Autônomo ou freelancer", "Pessoal / Benefícios", "Pessoal / Encargos trabalhistas",
  "Sócios / Pró-labore", "Sócios / Distribuição de lucros", "Sócios / Aporte ou empréstimo",
  "Reembolso / A comprovar", "Ocupação / Aluguel", "Ocupação / Água, energia e gás",
  "Tributos / Impostos e taxas", "Financeiro / Fatura de cartão", "Financeiro / Tarifas e juros",
  "Financeiro / Empréstimo", "Financeiro / Aplicação ou resgate", "Transferência / Conta própria",
  "Transferência / Entre empresas do grupo", "Vendas / Adquirente ou intermediador",
  "Operação / Entrega e frete", "Operação / Marketing", "Uso pessoal / A revisar", "Outros / A esclarecer",
] as const;
export type ExternalAccount = {
  id: string; name: string; document: string; banks: string; companies: string;
  bankCents: number; stoneCents: number; receiptCents: number; count: number;
  priority: number; reason: string; suggestion: string; confidence: string;
  category?: string; status?: string; identity?: string; notes?: string; version?: number;
};
