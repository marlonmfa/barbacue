# Primeiro acesso da equipe

As contas individuais exigem usuário ou e-mail e senha, tanto na tela quanto na
API. Não existe mais acesso por senha mestre ou por senha de ambiente, e sessões
antigas desse acesso são recusadas. As variáveis antigas não são usadas pela
autenticação; somente `ADMIN_COOKIE_SECRET` continua necessário para assinar
sessões de contas individuais ativas.

A migração `0016_staff_first_login.sql` acrescenta
`staff_users.must_change_password`, com padrão `false` para preservar as contas
existentes. Quando o campo é `true`, o login encaminha para
`/admin/change-password`; páginas e APIs administrativas ficam bloqueadas até
a troca. A tela pede a senha atual, uma nova senha de pelo menos oito caracteres
e sua confirmação. A senha inicial não pode ser reutilizada e a sessão restrita
é invalidada após a alteração.

O script `apps/web/scripts/create-initial-staff.mjs` cria Marlon e Claudio,
respectivamente `marlon@barbacue.cog.ia.br` e `claudio@barbacue.cog.ia.br`, como
administradores ativos com troca obrigatória. Execute após a migração, com
`DATABASE_URL` e `INITIAL_STAFF_PASSWORD` fornecidos pelo ambiente privado.
O script não redefine senhas nem permissões de contas que já existam.

## Publicação de 27/10/2026 — e-mail alternativo

As contas Marlon e Claudio já estavam ativas como administradores, com troca
inicial pendente. A versão publicada exige informar um e-mail fora do domínio
barbacue.cog.ia.br, confirmar o código enviado a ele e então trocar a senha.
A API bloqueia a troca sem confirmação válida. Códigos expiram em dez minutos,
têm cinco tentativas e um minuto entre envios. A confirmação fica vinculada à
conta e ao endereço informado. Senhas, permissões e as outras contas preservadas.

Build anterior `HX7FMLvv55-3axoaV1mfm`; novo `CYZY9-jK1H4g4f5mOyziS`, com as
115 rotas anteriores preservadas e uma rota de confirmação adicionada. Publicado
no mesmo PM2/container, sem substituir imagens Docker. Configurada a integração
COG Mail já existente no ambiente privado do projeto. Nenhum e-mail real foi
enviado durante os testes. Validação: build isolado, ESLint e 45 verificações HTTP
em banco separado, além de 15 verificações públicas por HTTPS. O SSO existente foi
preservado na reconstrução da versão ativa. Backup criptografado e runtime
anterior em `/root/deploy-backups/barbacue-first-access-20261027/`.

A migration 0020 é aditiva e idempotente. Foi aplicada individualmente sem
avançar o journal, para preservar a 0019 pendente de outro trabalho. Veja
`production/first-access/README.md` e os relatórios de publicação.

## Publicação de 24/10/2026

- Estado anterior: build `MrIM3HLAKkQdmXSacKh3I`, com usuário opcional e login
  por senha de ambiente, inclusive sessões administrativas com identificador 0.
- Publicado: build `tj6YNAphSh5BmbsaEUV5L`, diretório de build
  `apps/web/.next-individual-login-20261024`, no mesmo PM2/container. Preparado
  a partir do código da versão ativa, sem incluir os trabalhos simultâneos de
  impressoras e pagamentos. A comparação dos arquivos de servidor da versão
  anterior com produção não apresentou diferenças, excluindo mapas de fontes.
- Usuário ou e-mail obrigatório: a API rejeita campo ausente, vazio, composto
  somente de espaços ou de tipo inválido, sem emitir sessão. Não há fallback
  para senha de ambiente. Sessões antigas com identificador 0 são rejeitadas
  mesmo quando sua assinatura e seu prazo ainda seriam válidos.
- O acesso aos dados de um cliente exige confirmação da senha individual do
  administrador conectado. A confirmação por senha mestre e seu indicador no
  painel de integrações foram removidos.
- Nenhuma migração ou alteração nas contas, senhas, ambientes, produtos ou
  pedidos. As cinco contas e seus hashes foram comparados ao estado anterior.
  Mantidas as 108 rotas existentes. Não houve substituição de imagem Docker.
- Validação: build com TypeScript, ESLint dos arquivos alterados, oito testes de
  permissões e 51 requisições de integração em banco local separado, com o
  servidor de teste sem variáveis de senha mestre. O candidato passou 25
  verificações no servidor, incluindo rejeição de uma sessão mestre obtida da
  versão anterior. Após a ativação, oito verificações pelo HTTPS público
  confirmaram o campo obrigatório, o bloqueio de login só com senha e o
  funcionamento das duas contas individuais com troca inicial obrigatória.
- Backup privado: `/root/deploy-backups/barbacue-individual-login-20261024/`,
  com dump validado, aplicativo, configuração PM2, manifesto e relatórios.
  Aplicação anterior: `/root/barbacue-before-individual-login-20261024/`.
  Restaurar essa aplicação anterior reativa o acesso por senha mestre; portanto,
  qualquer reversão precisa preservar a correção de autenticação.

## Publicação de 23/10/2026

- Estado anterior: build `wFok581EdSVm83biPmY_y`, três contas da equipe e nenhuma
  das duas contas solicitadas. Não havia troca obrigatória no primeiro acesso.
- Publicado: build `MrIM3HLAKkQdmXSacKh3I`, baseado na revisão
  `0e15863`, com as alterações de login e a rota WhatsApp já ativa preservada.
  O build foi preparado em cópia separada, excluindo o trabalho simultâneo de
  impressoras. O manifesto dos arquivos e hashes está no backup.
- Ambiente: standalone Next.js no PM2 `barbacue`, container `otherpagesandig`,
  porta interna 3007. O diretório ativo de build é
  `apps/web/.next-login-accounts-20261023`; o `.next` anterior foi preservado.
  Não foi substituída nenhuma imagem Docker.
- Banco: migração 0016 aplicada e registrada no histórico do Drizzle; duas
  contas adicionadas, totalizando cinco. As três contas anteriores e seus dados
  foram preservados. Os 135 pedidos, 197 produtos e demais dados existentes
  permaneceram intactos; ambientes e credenciais operacionais foram mantidos.
- Validação: build e TypeScript aprovados, ESLint dos arquivos de autenticação,
  oito testes de permissões, 34 requisições de integração em banco local
  separado e cadastro idempotente. Conferência de login e primeiro acesso no
  Chrome. A versão candidata passou 27 verificações no servidor, preservando
  as 106 rotas anteriores, e ambas as contas foram verificadas pelo HTTPS
  público após a publicação, sem concluir sua troca inicial.
- Backup privado: `/root/deploy-backups/barbacue-login-accounts-20261023/`,
  incluindo dump validado, aplicação, ambiente PM2, manifesto e relatórios.
  Aplicação anterior: `/root/barbacue-before-login-accounts-20261023/`.
- Reversão da aplicação: parar somente o PM2 `barbacue`, preservar a pasta
  atual, restaurar a pasta anterior em `/root/barbacue` e reiniciar o mesmo
  processo. A coluna aditiva pode permanecer. Restaurar o banco completo não
  faz parte dessa reversão, para não perder pedidos recebidos depois do backup.
