

# Imagens Docker reproduzíveis e preservação de dados

Regra permanente autorizada em 07/10/2026, aplicável a todos os serviços:
- Manter um Dockerfile canônico por imagem/serviço, partindo da imagem oficial
  adequada à stack. Multi-stage dentro desse Dockerfile é permitido.
- Roundcube deve partir da imagem oficial com versão/digest fixados e incluir
  todos os plugins customizados (cogia_*, innexo_master) e patches de UI no build.
- Versionar Dockerfile, contexto, plugins, patches, configuração sem segredos e
  instruções de build. Uma clonagem nova deve permitir reconstruir a imagem.
- Não usar container alterado, docker commit/import/export ou imagem manual
  anterior como fonte definitiva. Bases internas são permitidas quando o build
  da base também está versionado, com revisão identificada e dependência documentada.
- Não depender de código existente apenas no servidor nem de bind mounts de
  plugins para completar a imagem. Dados/configuração operacional podem ter mounts.
- Antes de substituir uma imagem, comparar com o serviço ativo, preservar
  diferenças locais e remotas, testar o candidato e registrar imagem/revisão.
- Preservar bancos, emails, volumes, contas, chaves, .env e configurações ativas.
  Não usar down -v, prune, recriar contas ou sobrescrever ambientes no ajuste.
- Relatar por projeto o estado anterior, a mudança, os testes e se foi publicada.
