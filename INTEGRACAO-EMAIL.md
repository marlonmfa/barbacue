<!-- cogmail-integration-v1 -->
# E-mail pela API COG Mail — barbacue.cog.ia.br

Este projeto pode enviar e consultar e-mails pela API COG Mail, integrada ao
mesmo servidor de mensagens do [webmail](https://webmail.cog.ia.br).
A API é atendida pelo portal Editais no Linux; o Roundcube é a interface humana.
Não é necessário guardar senha IMAP ou SMTP neste projeto.

## Acesso configurado

| Configuração | Valor |
| --- | --- |
| URL base | `https://editais.cog.ia.br/api/mail/v1` |
| Caixa de leitura e remetente padrão | `contato@cog.ia.br` |
| Token | variável privada `COGMAIL_API_TOKEN` no `.env` da raiz |
| Identificador público da chave | `8d5385e7c5ed` |
| Nome no servidor | `Repos: barbacue.cog.ia.br` |
| Escopos solicitados | `ler`, `rascunhos`, `enviar` |
| Limite | 100 envios por hora por chave |
| Expiração | `2027-10-06T19:41:04.416197+00:00` |

Cada projeto tem seu próprio token, permitindo revogação e auditoria individual.
Todos esses tokens acessam **a mesma caixa contato@cog.ia.br**, incluindo seu
histórico e anexos; não são caixas isoladas por projeto. Chaves criadas pela
identidade administrativa de contato herdam `remetente_livre`: outro remetente
pode ser informado, desde que o servidor SMTP aceite essa identidade.

O `.env` contém `COGMAIL_API_URL`, `COGMAIL_API_TOKEN` e `COGMAIL_MAILBOX`.
Carregue essas variáveis no **backend** com o mecanismo de configuração da stack.
Não use prefixos de exposição pública como `VITE_`, `NEXT_PUBLIC_` ou `PUBLIC_`.
O `.env.example` contém somente os nomes e um token vazio.

O cadastro autoriza tecnicamente a integração. Ele não altera automaticamente o
código do projeto, não ativa jobs de envio e não configura o ambiente de um
container já publicado. Na implantação, forneça essas variáveis ao backend Linux
pelo mecanismo de segredos/ambiente existente, sem colocar a chave na imagem.

## Autenticação e verificação

Toda chamada usa `Authorization: Bearer <COGMAIL_API_TOKEN>`; também é aceito
`X-API-Key`. Os exemplos abaixo pressupõem variáveis já carregadas no ambiente.
Não cole o token na documentação, em URLs, logs ou código versionado.

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $COGMAIL_API_TOKEN" \
  "$COGMAIL_API_URL/caixa"
```

Retorna `caixa`, `chave.id`, `chave.nome`, `chave.escopos`,
`limite_envios_hora` e `envios_na_ultima_hora`.

## Receber e ler mensagens

O servidor recebe as mensagens destinadas a `contato@cog.ia.br`; o projeto
consulta a caixa por HTTP. Não há webhook de recebimento nesta API v1.

| Método e caminho | Uso |
| --- | --- |
| `GET /pastas` | Lista caminhos IMAP, nomes, totais e não lidas |
| `GET /mensagens?pasta=INBOX&pagina=1&tamanho=50` | Retorna página com `mensagens[]`; tamanho máximo 100 |
| `GET /mensagens?pasta=INBOX&nao_lidas=true` | Consulta somente mensagens não lidas |
| `GET /mensagens/UID?pasta=INBOX&marcar_lida=false` | Texto, HTML, cabeçalhos e lista de anexos de uma mensagem |
| `GET /mensagens/UID/anexos/0?pasta=INBOX` | Baixa um anexo por índice |
| `GET /busca?q=termo&limite=20` | Busca em todas as pastas; termo mínimo 2 caracteres, limite máximo 50 |

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $COGMAIL_API_TOKEN" \
  "$COGMAIL_API_URL/mensagens?pasta=INBOX&pagina=1&tamanho=50"
```

A consulta não marca mensagens como lidas por padrão. Para processar recebimentos,
consulte periodicamente conforme a política do projeto, percorra a paginação e
registre os itens processados com caixa, pasta, UID e Message-ID quando disponível.
Não use somente `nao_lidas=true` como fila: usuários do webmail podem ler mensagens
antes do serviço. Confirme respostas pela conversa/Message-ID e destinatários.
Use os caminhos retornados por `/pastas`, em vez de supor o nome da pasta Enviados.

## Enviar mensagens

`POST /enviar` aceita JSON com ao menos um destinatário em `para`, `cc` ou `cco`.
A cópia do envio fica na pasta Enviados da caixa da chave, visível no webmail.

```bash
# Execute somente quando o envio concreto estiver autorizado pelo projeto.
curl --fail-with-body --silent --show-error -X POST \
  -H "Authorization: Bearer $COGMAIL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $COGMAIL_PEDIDO_ID" \
  --data '{"para":["destinatario@example.com"],"assunto":"Assunto","texto":"Mensagem","nome":"Equipe"}' \
  "$COGMAIL_API_URL/enviar"
```

Defina `COGMAIL_PEDIDO_ID` como identificador estável e único da operação e
reutilize-o em novas tentativas do **mesmo envio**. Primeiro envio: `201`.
Repetição concluída: `200` e `Idempotent-Replayed: true`; em andamento: `409`.
Uma falha libera a chave para nova tentativa. Não reutilize o identificador para
mensagens diferentes. Registre a resposta integral, inclusive `message_id` e o
resultado do arquivamento em Enviados. Aceitação SMTP não prova entrega final.

Campos: `para`, `cc`, `cco` (lista de endereços ou string), `assunto`, `texto`,
`html`, `nome`, `remetente`, `responder_a` (Message-ID da mensagem respondida),
`referencias` (lista de Message-IDs) e `anexos`.
`responder_a` não é um endereço de Reply-To.

Anexos usam `{"nome":"arquivo.pdf","tipo":"application/pdf","conteudo":"BASE64"}`:
até 12 MiB por arquivo e 20 MiB de conteúdo decodificado no total por pedido.

## Rascunhos para revisão

| Método e caminho | Uso |
| --- | --- |
| `POST /rascunhos` | Cria com os mesmos campos da mensagem, sem enviar |
| `GET /rascunhos` e `GET /rascunhos/UID` | Lista/consulta rascunhos |
| `PUT /rascunhos/UID` | Atualiza; guarde o **novo UID** retornado; `manter_anexos=true` por padrão |
| `POST /rascunhos/UID/enviar` | Envia o rascunho com `Idempotency-Key` após autorização |
| `DELETE /rascunhos/UID` | Exclui definitivamente o rascunho |

O escopo `organizar` não foi solicitado: mover, apagar ou sinalizar mensagens
recebidas exige uma chave com esse escopo. A leitura com `marcar_lida=true` está
disponível pela rota de consulta, mas deve seguir a política da caixa compartilhada.

## Exemplo no backend Python (biblioteca padrão)

```python
import json
import os
from urllib.request import Request, urlopen

base = os.environ["COGMAIL_API_URL"].rstrip("/")
headers = {"Authorization": "Bearer " + os.environ["COGMAIL_API_TOKEN"]}
request = Request(base + "/mensagens?pasta=INBOX&pagina=1&tamanho=50", headers=headers)
with urlopen(request, timeout=60) as response:
    pagina = json.load(response)
# Processe pagina["mensagens"] no backend, sem registrar conteúdo privado em logs.
```

Em Node.js, o backend pode usar `fetch` com a mesma URL, cabeçalho e JSON.
Verifique `response.ok`, aplique timeout e preserve a chave de idempotência.

## Erros, manutenção e registro

| HTTP | Tratamento |
| --- | --- |
| `401` | Token ausente, inválido, revogado/expirado ou credencial da caixa recusada |
| `403` | Escopo insuficiente ou conta emissora desativada |
| `409` | Envio idempotente em andamento; aguarde e consulte/reenvie com a mesma chave |
| `422` | Corrija campos, endereços ou limites do pedido |
| `429` | Aguarde `Retry-After` antes de tentar novamente |
| `502` | Falha no servidor de e-mail; reenvio deve preservar a idempotência |
| `503` | Configuração indisponível no servidor da API |

A API mantém auditoria em `email_api_registro`. No COG Mail, Conta → Chaves de API
permite gerenciar chaves da caixa. Pela sessão autenticada da caixa:
`GET /api/app/email/chaves`, `POST /api/app/email/chaves` e
`POST /api/app/email/chaves/8d5385e7c5ed/revogar`. Estes endpoints de gestão usam a
sessão do aplicativo; o token de integração não concede gestão de chaves.
Uma chave nova substitui o token somente deste projeto no `.env` e no backend Linux.

Em editais, vincule cada solicitação efetivamente enviada às pendências usando
`repo_solicitacoes.registrar`, com mensagem integral, destinatário, remetente,
data, meio e protocolo/comprovante; preserve o histórico e evite duplicação.
Minutas não contam como envio, e solicitar não resolve a pendência.

Contrato completo: `../editais.cog.ia.br/docs/API-EMAIL.md`.
Documentação interativa: [OpenAPI do portal](https://editais.cog.ia.br/docs)
(grupo **API de e-mail · serviços**, exige login).

Provisionamento e leitura pública validados em 06/10/2026, sem envio de mensagens.
