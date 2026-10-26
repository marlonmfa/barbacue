# Federação dos domínios externos do Barbacue

Base nativa: PM2 barbacue em /root/barbacue no host SSH :2212, Node 22.23.1,
porta local 3007, build cWNCruZ-v5_CSiKN7zmIO, fonte publicada 9f59eb3.
680 arquivos de código/artefatos correspondem à publicação anterior; somente
os metadados de cache da rota Instagram mudaram. Catálogos, downloads, dados,
ambiente PM2, banco e node_modules devem continuar preservados.

O checkout local contém trabalho concorrente em aplicativos, impressão, loja,
equipe e pagamento. A fábrica production/sso reconstrói os inputs publicados,
aplica sua camada Cog e só então este perfil aplica cog.patch. Nenhuma edição
concorrente do checkout é publicada por esse processo.

Somente as origens exatas configuradas de Chelas e Barbadog habilitam o cliente
confidencial externo. O provedor é id.cog.ia.br; os callbacks são
/api/auth/cog/callback em cada domínio. A navegação de login/equipe verifica
prompt=none, código, PKCE S256, state, nonce, RS256 e userinfo. Fluxo e grant
ficam cifrados em cookies HttpOnly, com separação de finalidade e vínculo a
origem, marca, cliente e emissor. Nenhum access token ou segredo vai ao JS.

Equipe exige conta única, ativa, username igual ao e-mail completo e primeiro
acesso concluído. Cliente exige cadastro local único; não recebe permissões
administrativas. Não há provisionamento ou promoção. Sem identidade válida ou
vínculo, os cookies de equipe e cliente nativos continuam intactos. A troca de
senha inicial mantém seu fluxo; somente logout explícito revoga no provedor,
com confirmação anterior à limpeza. Falha conserva cookies e mostra a opção
de tentar novamente. Login nativo e provedores sociais permanecem existentes.

Uma ilha sem UI compara a identidade no foco/intervalo e identifica a conta
exibida nas mutações por HMAC. A checagem silenciosa de cinco minutos ocorre
ao entrar ou recuperar foco, preservando a edição contínua. Proxy recusa uma
origem diferente com grant externo e uma vista de outra conta. Clientes nativos
sem o cabeçalho continuam no contrato anterior; login intencional é preservado.

JOSE 6.2.8 é a mesma versão já validada no CRM GOW; todas as entradas anteriores
do lockfile foram conservadas e somente esse pacote/dependência foi acrescentado.
transpilePackages garante inclusão no bundle: há zero requires externos de jose.
A publicação nativa não precisa substituir dependências. O SDK oficial Node
22.23.2 por digest permanece no Dockerfile canônico apps/web/Dockerfile.

Build privado no builder em /mnt/dados/barbacue-federation-20261026, usando
o caminho original e a chave de ações anterior por ambiente/arquivo privado.
Dez unidades no Linux e Chrome E2E passaram com o inicializador standalone
real. PostgreSQL próprio em tmpfs recebeu somente o esquema das 34 tabelas,
sem linhas de produção. Contas fictícias usam TEST_USER_* com fallback local.
Os dois domínios, equipe/cliente, fallback, senha inicial, saída e celular
foram exercitados; seis capturas devem ser commitadas e inspecionadas.

Estado: candidata testada; publicação e registro do cliente externo ainda
pendentes. O serviço ativo continua na publicação anterior até evidência
explícita em published.json. Aplicativos instalados continuam no escopo futuro.
