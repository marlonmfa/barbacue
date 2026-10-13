# Validação e publicação do ERP — 20/09/2026

Resultado: **aprovado e publicado** em https://barbacue.cog.ia.br/admin/erp.

Build: `e361pHSgl2MXzFLukRsnH` (Next.js 16.2.6, webpack). Host `91.108.125.60`, container LXD `otherpagesandig`, PM2 `barbacue`, porta interna 3007. Nenhum teste de escrita foi executado contra os dados operacionais de produção. A única carga inicial foi a migração autorizada e o cadastro das fichas dos cardápios.

## Cobertura automatizada

| Suíte | Verificações contadas | Casos cobertos |
|---|---:|---|
| Unitários web e provedor de entrega | 47 | Preços, totais, desconto/frete, arquivos, imagens, beta, recuperação de pedido e erros do provedor |
| Aplicativo desktop | 8 | Configuração, navegação e integrações do programa |
| Agente de impressão | 25 | Tickets, transporte, persistência, tentativas e prevenção de duplicidade |
| ERP: integração inicial | 47 | Autenticação, estoque, compras, produção, impostos, folha, ponto e afastamentos |
| ERP: matriz ampliada | 117 | Todos os comandos do ERP: inclusão, edição, cancelamento permitido, inativação, validações, isolamento de seis perfis, concorrência e reversão transacional |
| ERP: navegador | 29 | Nove módulos, formulários reais, edição, recebimento, produção, baixa, CSV, folha, ponto, afastamentos e responsividade |
| Acessos | 42 | Permissões, revogação, login de cliente, cupons e públicos das ofertas |
| Autoatendimento e impressão | 102 | QR de mesa, retirada, loja fechada, preços, 12 repetições concorrentes, tickets, leases e cancelamento |
| Entrega | 75 | Configuração, cotação, endereço, prazo, área, frete, cupons, troco e indisponibilidade do provedor |
| Operação por perfil | 107 | Gerente, caixa, cozinha, garçom e entregador, atribuição, preparo, entrega e revogação |
| **Total** | **599** | Todas as verificações acima aprovadas |

Também passaram três suítes sem contador numérico: download privado do instalador Windows (incluindo SHA-256 e bloqueio de perfis não autorizados); importação de cinco origens com deduplicação e impressão; atendimento por chat com separação de marcas, restauração de rascunho, áudio editável, falha/repetição e marca inválida. Provedores externos de entrega, chat e áudio foram simulados nos testes locais para reproduzir sucesso e falha sem operações reais.

TypeScript, ESLint dos módulos ERP, `git diff --check` e build de produção passaram.

## Problemas encontrados e corrigidos

- Compra com valor total acima do limite retornava HTTP 500: agora a validação devolve HTTP 422 antes da transação.
- Remover a competência de um lançamento manual mantinha o valor antigo: a edição agora limpa o campo no banco.
- Guia tributária composta apenas por espaços era aceita: o conteúdo é normalizado e a referência vazia é recusada.
- O instalador de migração dependia de `dotenv`, ausente no bundle standalone: em produção usa diretamente `DATABASE_URL` do PM2; o helper é carregado somente no ambiente de desenvolvimento quando necessário.
- Testes anteriores não removiam tickets dependentes ao limpar pedidos; a limpeza foi corrigida. O teste de impressão isola sua fila. A importação de receitas é testada após sincronização inicial, e o teste de chat distingue o alerta do formulário do anunciador de rota do Next.js.

## Verificação da publicação

Antes da ativação, a versão candidata na porta 43009 passou por **51 verificações** com as configurações de produção: três lojas, catálogos, horários, ícones, páginas/APIs administrativas, autenticação, imagens otimizadas e instalador Windows completo com hash conferido.

A migração importou **334 fichas**, sem produtos ausentes: **197 Barbacue, 71 Barbadog e 66 Chelas**. Todas começam com revisão pendente, pois os cardápios não fornecem quantidades e preparo suficientes para aprovar uma ficha técnica.

Depois da ativação, passaram **21 verificações HTTP públicas**, a leitura autenticada do ERP e a navegação no navegador pelos **nove módulos e três lojas**. Filtro por marca, busca e abertura da ficha Doguinho foram verificados. Desktop e celular não apresentaram erros de JavaScript nem rolagem horizontal da página. O ERP de produção tinha zero compras, folhas e lançamentos financeiros de teste.

Evidências locais: `tmp/erp-deploy-20260920/` (logs, relatório JSON e capturas de desktop/celular). O relatório público também está no backup do servidor.

## Backup e reversão

- Backup do banco, aplicação e configuração PM2 privada: `/root/deploy-backups/barbacue-erp-20260920/` dentro do container. O dump foi conferido com `pg_restore --list`.
- Aplicação anterior: `/root/barbacue-before-erp-20260920/`.
- A ativação tem reversão automática se o processo não iniciar ou as verificações de disponibilidade falharem. Não foi necessário revertê-la.
- Para reversão manual: parar apenas o PM2 `barbacue`, preservar a versão atual em outro diretório, restaurar o diretório anterior para `/root/barbacue`, reiniciar e validar. A migração é aditiva: as tabelas ERP podem permanecer, preservando novos dados. Não restaurar o dump sobre novos pedidos sem avaliar o período posterior ao backup.
- Configuração nginx, credenciais e instalador Windows foram preservados. Chunks da versão anterior permanecem disponíveis para abas já abertas.

## Limites da cobertura

A aprovação cobre as funcionalidades implementadas e os cenários descritos; não equivale a provar todas as combinações possíveis. Pagamento bancário real, emissão fiscal, eSocial e cálculos legais de folha não existem nesta versão e não foram simulados como funcionalidades concluídas. Impressão física e instalação em um dispositivo Windows real também não foram realizadas nesta rodada; foram testados o agente, os tickets e a entrega íntegra do instalador.
