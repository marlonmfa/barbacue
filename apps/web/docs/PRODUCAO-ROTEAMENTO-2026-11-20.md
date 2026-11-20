# Roteamento em produção — 20 de novembro de 2026

O build `dPd4gJvxf8ebKbbne3IO3` foi publicado no processo PM2 `barbacue`, no container `otherpages`. O processo `barbacue-whatsapp` continuou com o mesmo PID. O build anterior `l8b7MubAPUPq8HqSE_A0m` e o backup verificável do PostgreSQL estão em `/root/deploy-backups/barbacue-routing-20261120`.

## Operação

- [Despacho de entregas](https://barbacue.cog.ia.br/admin/dispatch) com botão **Gerar rotas** habilitado. O banco registra `automatic: false`.
- [Feed de pedidos](https://barbacue.cog.ia.br/admin/orders/feed) e API autenticada de comandas em PDF preservados.
- Origem cadastrada na Rua Expedicionário Cabo Harry Hadlich, 865, Centro, Jaraguá do Sul–SC, CEP 89251-380. Coordenadas `-26.4915129, -49.0747559` verificadas no geocodificador privado com número e município correspondentes. [Ficha do estabelecimento](https://www.tripadvisor.com.br/Restaurant_Review-g303582-d21019541-Reviews-Barbacue_Hamburguers_Na_Brasa-Jaragua_Do_Sul_State_of_Santa_Catarina.html)
- OSRM 6.0.0 e Nominatim 5.3.3 em loopback, com índice regional CNEFE. A cotação pública de frete continua desligada porque a operação não tinha tarifa ativa. A origem fica disponível para o despacho manual.

## Evidência da migração e dos testes

As mudanças de esquema foram aplicadas em uma cópia do banco ativo e depois em produção, em transação com tempo limite de bloqueio. A verificação da cópia confirmou **1.568 pedidos e 1.562 comandas**, as mesmas contagens conferidas no ambiente ativo depois da publicação. O backup de pré-publicação passou pela leitura do catálogo do `pg_restore`. A validação preservou as **133 rotas** do build anterior e encontrou as seis novas rotas do despacho e da entrega.

O teste completo usou dois pedidos simulados e endereços públicos na cópia. Passou por cotação em vias reais, gravação do pedido, matriz, geração manual, atribuição a entregador online, sequência, link do Google Maps, QR e conclusão. A rota teve **8,209 km e 16 min 45 s estimados com retorno**, conforme as regras da homologação. O PDF de uma comanda histórica foi idêntico byte a byte ao PDF do build anterior.

No ambiente ativo, confirmei o painel em modo manual no navegador e respostas HTTPS autenticadas 200 no painel, na API de despacho, no feed e no PDF. A API de despacho e o PDF também foram testados sem sessão e retornaram 401. O mesmo build passou no verificador de logos do servidor. A cobertura documental manteve a assinatura da resposta e as três lojas seguiram reconhecidas pelo Gestor iFood. O teste em produção consultou somente dados reais. Os pedidos simulados e a tarifa de teste ficaram na cópia.

O contraste do despacho foi conferido nos temas claro e escuro. A publicação foi web. O código-fonte da release inclui o mesmo painel no renderer desktop e a lista de operações permitidas do transporte. O instalador disponível continua no canal já publicado.

## Fonte e retorno

A fonte de publicação está na branch local `deploy/roteamento-20261120`. O trabalho foi isolado da cópia compartilhada. O snapshot do servidor anterior, o backup do banco, a SQL usada, a candidata e os resultados da homologação ficam no diretório de backup informado acima. As tabelas novas são aditivas. Em retorno do runtime, restaure o `server.before.js` e reinicie somente `barbacue`. Preserve o banco atual e os novos pedidos.
