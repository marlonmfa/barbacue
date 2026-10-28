# Impressoras por restaurante

## Configurar

1. No Barbacue Pedidos, abra **Configurações e impressão**. Salve o endereço da loja e a chave de impressão já configurada para ela.
2. Use **Adicionar impressora no Windows** para instalar uma impressora USB, Bluetooth, Wi-Fi ou de rede nas configurações oficiais do Windows. Instale o driver do fabricante e depois use **Atualizar lista**. O aplicativo utiliza as filas instaladas no sistema; ele não faz descoberta Bluetooth pelo navegador.
3. Clique em **Conectar impressoras ao painel** e depois em **Mapear por restaurante**.
4. Em **Cozinha → Impressoras por restaurante**, selecione a impressora e o papel de cada restaurante e salve. O nome do computador distingue impressoras com nomes iguais. É possível usar uma mesma impressora para mais de um restaurante.
5. Ative a impressão automática no aplicativo dos computadores escolhidos e mantenha-os ligados. A lista de impressoras é atualizada a cada 20 segundos enquanto a impressão automática está ativa.

Papéis disponíveis: 58 mm, 80 mm e A4. O papel selecionado no painel é usado em cada pedido do restaurante, incluindo a largura do texto.

**Usar impressão padrão atual** mantém o comportamento anterior: um agente pode retirar o pedido e usar sua impressora padrão. A impressora padrão é opcional no aplicativo novo; quando vazia, aquele computador recebe apenas pedidos explicitamente vinculados a ele.

**Sem impressora · manter na fila** suspende os envios daquele restaurante. Os pedidos continuam guardados até a escolha de um destino. Também aguardam quando o computador do vínculo está offline ou a fila da impressora desaparece do sistema. Um destino vinculado nunca é substituído automaticamente pela impressora padrão.

Uma mudança de vínculo afeta pedidos ainda na fila. Um envio já iniciado mantém o destino reservado, registrado na tarefa. Falhas incertas continuam exigindo conferência manual antes de reimprimir. O aceite do spool do Windows não comprova a saída física do papel; uma impressora sem papel ou desligada pode continuar listada no sistema.

## Atualizar uma instalação

Estado anterior: uma única impressora por configuração local, sem seleção por restaurante.

O servidor e o aplicativo devem ser atualizados juntos. Antes de publicar, compare a revisão em uso, preserve alterações locais/remotas e faça o backup operacional habitual. Não substitua `.env`, contas, chaves ou volumes.

- Instalação com histórico completo do Drizzle: aplicar as migrations pendentes, incluindo `0017_restaurant_printers`.
- Instalação em que migrations anteriores foram aplicadas manualmente: executar `node apps/web/scripts/migrate-printers.mjs` com o `DATABASE_URL` operacional já configurado. O script aplica somente a migration de impressoras, em transação, com registro de hash. Ele recusa tabelas preexistentes sem histórico correspondente e pode ser repetido sem recriar dados.
- Gerar o instalador atualizado com `npm run desktop:windows` e distribuir aos computadores que farão o roteamento. Nenhum segredo é incluído no instalador.

A migration acrescenta inventário dos computadores, vínculos e o destino reservado em cada tarefa. Não reenvia pedidos históricos nem cria vínculos automaticamente. Agentes antigos continuam atendendo restaurantes em modo padrão; não retiram tarefas vinculadas a computadores.

## Validação desta alteração

- `npm run test:desktop`: formatação, seleção de destino/papel, identidade local, spool, journal e prevenção de duplicação.
- Build web e lint dos arquivos alterados.
- `node apps/web/tests/restaurant-printers.integration.mjs`: exige um banco local vazio chamado `barbacue_printer_test_*`, com esquema atualizado, e servidor local. As variáveis opcionais são `PRINTER_TEST_URL`, `DATABASE_URL`, `PRINTER_TEST_PASSWORD` e `PRINT_AGENT_TOKEN`. Verifica permissões, dois computadores com impressoras de mesmo nome, concorrência, restaurantes, falta de impressora, computador offline, mudança de vínculo e compatibilidade. Não envia papel.
- Conferência da interface no Chrome.

Publicação: alteração preparada e testada localmente; não publicada em produção. O pareamento com hardware real e a saída de papel precisam ser conferidos no computador da cozinha após instalar a versão atualizada.
