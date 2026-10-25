# Barbacue: sessão Cog sobre o serviço nativo

Instância real: SSH root@91.108.125.60:2212, /root/barbacue,
PM2 barbacue, Node 22.23.1, loopback 3007. O host antigo 72.60.31.220 e
o Compose de desenvolvimento não representam essa produção. Build anterior
ZnqXTYJAItJLMco5e6go6, distDir .next-mobile-session-20261024.

A base preservada de pedir-dark-images e os quatro arquivos do patch de sessão
mobile correspondem aos 222 hashes de origem registrados no manifesto ativo.
prepare_context.py reconstrói 704 inputs públicos: 514 arquivos do commit
60d599060578faa1ee81e1ca7a15ab388adf6e23 e 190 da sobreposição versionada,
conferindo cada SHA256. Não publica as alterações concorrentes de desktop,
impressão, aplicativos ou administração do checkout. Auditoria no host não
encontrou valores de segredos operacionais no arquivo de fontes públicas.

O estágio sso-build-env do Dockerfile canônico usa Node oficial 22.23.2 fixado
por digest. Para construir esse SDK, use contexto limpo contendo somente o
Dockerfile; nunca use o diretório privado de transferência como contexto.
Builds e npm ci executam em diretórios privados de /mnt/dados do builder.
O caminho original do build e sua chave de ações são mantidos; a chave passa
por arquivo privado e ambiente do processo, sem aparecer em argumentos ou Git.
Compilação usa Webpack, como o bundle de produção. Há zero Server Actions.

O bundle ativo contém artefatos históricos de Webpack e Turbopack. A compilação
limpa não é byte a byte igual a esse conjunto misturado. A evidência de origem
é a correspondência integral dos 222 hashes e as mesmas 112 rotas; não afirmar
igualdade de todos os chunks. Chunks estáticos históricos são mantidos para
as páginas já abertas. Conteúdo público, dados de menus e downloads privados
existentes não são substituídos durante a publicação nativa.

Patch: oito fontes existentes alteradas e duas acrescentadas. Cog verificada
tem prioridade; conta da equipe exige username igual ao e-mail completo,
ativa, única e com primeiro acesso concluído. Papel e permissões vêm do banco.
Não adivinha usuário, cria conta, promove administrador ou libera senha inicial.
Cliente exige e-mail local único; cliente não recebe acesso administrativo.
Sessões nativas permanecem intactas quando Cog está ausente, inválida, sem
vínculo ou indisponível. Login individual e social continuam existentes.

Login da equipe e /conta entram diretamente quando a sessão atual autoriza.
Na equipe, uma conta com troca inicial obrigatória continua no fluxo nativo;
essa troca não revoga a sessão Cog. Saída explícita confirma a revogação antes
de limpar o escopo nativo e o cookie Cog. Falha conserva painel/cookies.

Duas unidades locais, duas na imagem Linux do SDK e build/typecheck aprovados.
E2E Chrome da compilação Linux com PostgreSQL descartável passou: equipe e
cliente corretos, permissões de caixa, cliente sem acesso administrativo,
retorno nativo, indisponibilidade, senha inicial e falha/sucesso ao sair.
Somente contas fictícias baseadas nas variáveis globais locais de teste.
Capturas f84e1a4/528aef6 commitadas e depois avaliadas: PASS. Uma captura inicial
de fallback ainda mostrava skeleton; foi refeita aguardando o nome do usuário
no painel. Nenhuma senha operacional foi usada ou alterada nesses testes.

Backup PostgreSQL usa snapshot exportado em transação read-only e pg_dump 16;
cifra em Fernet antes de gravar. Restaurado por stream no PostgreSQL técnico,
34 tabelas comparadas com o mesmo snapshot; banco temporário removido. Ambiente
PM2 anterior salvo somente em arquivo privado. Produção não recebe migração.

publish_linux.py confere o build ativo, checksums, backup e chave exclusiva
barbacue pela ponte privada 10.66.0.2:18077. Conserva server.js, dependências,
public, private-downloads, src/data, ambiente PM2 e banco. Troca somente o build
Next, conserva o anterior para retorno e acrescenta três variáveis SSO ao PM2.
Os três catálogos públicos e as páginas /pedir são conferidos antes/depois.

No inventário atual há cinco contas de equipe, duas com senha inicial pendente,
e zero clientes; Marlon não corresponde a nenhuma conta local. O caminho
positivo Cog foi comprovado no QA; não provisionar conta nem afirmar acesso
real sem vínculo. Cookie compartilhado cobre barbacue.cog.ia.br. Chelas e
Barbadog em domínios externos continuam pendentes de federação por código/OIDC.
Aplicativos instalados não recebem automaticamente a sessão do Chrome.
