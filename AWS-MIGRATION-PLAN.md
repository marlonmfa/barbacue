# Preparação AWS — barbacue/barbacue

Data: 2026-09-12. Estado: configuração local preparada; migração não executada.

Conta de destino indicada: `541259832355`. Critério: Domínio relacionado encontrado em documentação/configuração; evidências anexas.

Credenciais: `.env` local, permissão 0600, fora do Git. Incluídos os nomes fornecidos e o alias `AWS_ACCESS_KEY_ID` usado por SDKs. Identidades não consultadas na AWS. Nenhuma região foi escolhida. Variáveis AWS de identidade foram atualizadas; demais variáveis existentes foram preservadas. Arquivos `.env.local`, `.env.production` e ambientes de serviços não foram alterados; precedência e credenciais desses ambientes precisam ser conferidas antes de qualquer execução.

## Evidências locais

- `docker-compose.yml`: -barbacue.cog.ia.br, -barbadog.hirableaiagents.com, -chelas.hirableaiagents.com
- `apps/mobile/BRANDS.md`: barbacue.cog.ia.br, barbadog.hirableaiagents.com, chelas.hirableaiagents.com
- `apps/mobile/NATIVE-QA-2026-09-10.md`: barbacue.cog.ia.br
- `apps/mobile/PUBLISH.md`: barbacue.cog.ia.br
- `apps/mobile/COMO-INSTALAR.md`: barbacue.cog.ia.br

## Pendências antes de uma proposta de migração

- Confirmar vínculo e conta, sobretudo quando a classificação é residual ou baseada em referência compartilhada.
- Identificar implantação ativa, componentes, bancos, volumes, uploads, tarefas, integrações, domínios e dependências.
- Conferir configurações e planos anteriores; não representam decisões novas nesta preparação.
- Levantar requisitos de disponibilidade, região, orçamento, backup, restauração e interrupção tolerada.
- Elaborar proposta de serviços, infraestrutura como código, sequência, validação e rollback somente após as decisões do usuário.
- Executar migração apenas com autorização posterior. Não executar scripts de deploy ou CI/CD como parte desta preparação.

Planejamento consolidado: `/Users/marlonalcantara/Repos/aws-migration-dkm/README.md`.
