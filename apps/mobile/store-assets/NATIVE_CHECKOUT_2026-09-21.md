# Chelas e Barbadog — correção da rejeição 4.2

## Entrega

- Versão iOS 1.0, binário 1.0.0 (4), assinado, enviado, processado como VALID e associado às duas versões.
- Carrinho e checkout nativos: detalhes, quantidades, dados de entrega, resumo, Pix, dinheiro/cartão na entrega e confirmação. Nenhum redirecionamento ao iFood para pedir.
- Catálogo atualizado usa IDs reais do servidor. Snapshot offline é somente consulta e não permite adicionar IDs sintéticos ao carrinho.
- Privacidade e ajuda acessível no topo; apagamento local com confirmação remove carrinho, dados de contato e preferências. Não há criação de conta nestes apps; pedidos enviados ao restaurante não são apagados nem cancelados pela limpeza local.
- Dez páginas públicas atualizadas e verificadas por HTTPS: privacidade, termos, consentimento, exclusão de dados e suporte de cada marca. Backup anterior no container `otherpagesandig`: `/root/deploy-backups/brand-legal-20260921/legal-before.tar.gz`.
- App Store Connect: descrições e notas atualizadas; rótulos de privacidade publicados (finalidade App Functionality, dados ligados à identidade, sem rastreamento); link User Privacy Choices aponta à página de exclusão.

## Validação

- `flutter analyze --no-pub`: sem problemas.
- `flutter test --no-pub --exclude-tags screenshot`: 125 testes aprovados (inclui os novos testes de fluxo visual).
- Quatro fluxos completos com transporte simulado: Chelas/Barbadog × iPhone/iPad, do prato ao envio e confirmação, verificando marca e ID do produto.
- Testes de catálogo vivo/consulta offline e apagamento local, incluindo cancelamento e proteção contra restauração tardia do armazenamento.
- Nove screenshots em `test-screenshots/*2026-09-21.png`, commitadas. Avaliação visual: PASS após corrigir a fonte dos botões; texto legível, totais e controles íntegros, confirmação de exclusão clara.
- Catálogo público, situação da loja, configuração de entrega e páginas públicas verificados. Nenhum pedido real criado e nenhum dado de cliente real apagado.

## Situação na Apple

Os builds 4 estão anexados e válidos; as versões permanecem REJECTED até nova submissão. Não houve resubmissão nesta tarefa. A aprovação da diretriz 4.2 depende da avaliação da Apple. As capturas automatizadas são evidência de teste, não screenshots de marketing enviadas à loja; as imagens existentes na App Store não foram alteradas.

Evidência: `native-checkout-status-2026-09-21.json` e `native-checkout-metadata-2026-09-21.json`.

Bya Modas e HirableAI Comercial permanecem fora deste lote por exigirem vídeo de aparelho físico. Bya já possui o fluxo de exclusão no código consultado. As pendências de contrato pago e declaração de comerciante da conta Apple não foram alteradas.
