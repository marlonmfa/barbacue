# barbacue.cog.ia.br

## Integracao de e-mail

Envio e consulta de mensagens via API COG Mail: [documentacao de acesso](INTEGRACAO-EMAIL.md).

## Máquina local Barbacue com integração iFood

Destino definido para executar o sistema local da loja com integração iFood:

| Configuração | Valor |
|---|---|
| Máquina / alias SSH | `marlondell` |
| Alias via WireGuard | `marlondell-wg` |
| IP | `10.66.0.28` |
| Usuário SSH | `Barbacue` |
| Acesso direto | `Barbacue@10.66.0.28` |

Esses dados estão registrados no `.env` da raiz nas variáveis
`STORE_MACHINE_SSH`, `STORE_MACHINE_USER`, `STORE_MACHINE_HOST`,
`STORE_MACHINE_SSH_ALIAS`, `STORE_MACHINE_WG_ALIAS` e `STORE_MACHINE_ROLE`.
O `.env` é privado e não deve ser versionado.
Os aliases dependem da configuração SSH local; o acesso direto usa o mesmo usuário/IP.

```sh
ssh marlondell-wg
# Alternativa pelo IP:
ssh Barbacue@10.66.0.28
```

O acesso ao IP privado depende de conectividade com a rede WireGuard.
A definição do destino não migra nem ativa serviços. A integração iFood existente
está documentada em [packages/ifood/README.md](packages/ifood/README.md).
O aplicativo Windows atual usa a API online; executar também o backend e o banco
localmente exige preparar essa instalação e coordenar o consumidor iFood existente.

### Diagnóstico remoto — 24/10/2026

SSH autenticado por chave via `marlondell-wg` com sucesso. Inspeção realizada sem
instalar ferramentas, copiar o projeto, alterar serviços ou executar build completo.

| Recurso | Estado observado |
|---|---|
| Sistema | Windows 11 Home, 64 bits, versão 10.0.26300 |
| CPU | Intel Core i7-9750H, 6 núcleos / 12 threads; carga de 13% na coleta |
| RAM | 15,73 GiB totais; 1,18 GiB livres na coleta |
| Memória virtual | 24,73 GiB totais; 6,22 GiB livres; arquivo de paginação de 9 GiB |
| Disco C: | 459,77 GiB totais; 145,53 GiB livres |
| Node.js / npm | v24.18.0 / 11.16.0 |
| Git | 2.55.0.windows.3 |
| Editor | VS Code instalado |
| Docker / WSL | Docker ausente do PATH; WSL informa não estar instalado |
| PostgreSQL | Serviços `postgresql-x64-17` e `postgresql-9.4-Intelidata` em execução |

O teste Node confirmou execução JavaScript, criação/escrita/leitura/remoção de
arquivo em diretório temporário; `npm ping` confirmou acesso ao registry npm.

**Conclusão:** CPU, disco e ferramentas básicas permitem desenvolver e tentar
compilar o aplicativo Windows diretamente nessa máquina. A RAM livre atual é
baixa para builds Next.js/Electron junto dos aplicativos em uso; liberar memória
antes do build e validar o consumo durante a primeira compilação. O build completo
e o instalador ainda não foram testados nesse host.

Para compilar, o projeto prevê `npm ci`, `npm run test:desktop` e
`npm run desktop:windows` na raiz de uma cópia de trabalho preparada.
Veja [apps/desktop/README.md](apps/desktop/README.md).
A instalação por Docker Compose ainda depende de preparar Docker/WSL; os serviços
Postgres existentes devem ser identificados e preservados antes de configurar
qualquer backend local. Não iniciar outro consumidor iFood sem coordenar o ativo.
Nenhum serviço ou imagem foi publicado ou substituído nesta verificação.

### Compilação executada na marlondell — 24/10/2026

Cópia de trabalho isolada: `C:\Users\Barbacue\Repos\barbacue-build-20261024-ssh`.
Snapshot do checkout local, incluindo alterações ainda não commitadas, baseado no
HEAD `60d599060578faa1ee81e1ca7a15ab388adf6e23`. Os 1.264 arquivos de origem foram
conferidos por SHA-256 após a transferência. Não foram copiados `.env`, credenciais,
`node_modules` ou instaladores anteriores. Caches npm/Electron ficam nessa pasta.

| Verificação | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | Sucesso |
| `npm run test:desktop` | 20 testes desktop + 27 testes do agente; todos passaram |
| `npm run typecheck --workspace=packages/ifood` | Sucesso |
| `npm test --workspace=packages/ifood` | 26 testes passaram |
| `npm run desktop:windows` | Sucesso na segunda tentativa; 178 fontes de interface compiladas |
| Serviços antes/depois | Sem diferenças: os dois PostgreSQL e o SSH continuam em execução |

A primeira tentativa de empacotamento falhou com erro `UNKNOWN` ao abrir o `.exe`
para gravar recursos. O arquivo pôde ser aberto para leitura/escrita depois, e a
repetição do mesmo comando, sem mudar código, configuração ou proteções, concluiu
às 18:16 de 24/10/2026 (America/Sao_Paulo). A causa do acesso transitório não foi
confirmada. Os logs das duas tentativas foram preservados.

Instalador gerado na própria máquina:

```text
C:\Users\Barbacue\Repos\barbacue-build-20261024-ssh\apps\desktop\release\Barbacue-Pedidos-1.2.0-Windows-x64-Setup.exe
Tamanho: 112337518 bytes (107,1 MiB)
SHA-256: c96386a9bf2e942b7d4fbe75ec0f3c726bf4f5053117afb0475e92e0e156e12d
```

O build também preparou uma cópia idêntica em `apps/web/private-downloads` **dentro
da cópia isolada**; o hash e o tamanho conferem com `windows.json`.
Relatório, manifesto da origem e logs ficam na raiz da pasta remota (`verification.json`,
`source-manifest.json`, `build-results.json` e `*.log`). Uma cópia das evidências
foi guardada localmente em `tmp/marlondell-build-20261024/evidence/`.

Nenhum instalador foi executado, serviço publicado, consumidor iFood iniciado,
banco acessado pela aplicação ou migração aplicada. A validação cobre compilação,
empacotamento e testes automatizados; uso interativo, impressão física e conexão
real com o iFood não foram testados nesta etapa. O backend web não foi compilado
nem instalado localmente; o aplicativo Windows continua usando a API online.
A RAM livre permaneceu baixa (aproximadamente 1 GiB durante a coleta do build).

### Ambiente transferido — 24/10/2026

Após a compilação, por autorização de Marlon, o `.env` da raiz deste checkout foi
transferido por SSH para
`C:\Users\Barbacue\Repos\barbacue-build-20261024-ssh\.env`.
Não havia `.env` anterior nessa cópia. O conteúdo foi conferido por SHA-256,
sem exibir valores, e a ACL foi restringida ao usuário `Barbacue` e ao `SYSTEM`,
com herança desabilitada. Nenhum serviço foi iniciado ou reiniciado nessa etapa.
As configurações foram copiadas sem adaptação; a transferência não valida a
conectividade dos endpoints nem transforma o backend em uma instalação local.
