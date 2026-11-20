# Roteamento privado do Barbacue

Nominatim consulta o recorte regional do OpenStreetMap e o OSRM 6 calcula distâncias e tempos para automóveis. O Barbacue usa a rota na cotação, uma matriz entre a loja e os pedidos no despacho e links gratuitos do Google Maps para o motorista navegar. As portas são publicadas somente em loopback no host do PM2. Nenhum mapa ou endereço de pedido é enviado a um serviço público na etapa de cálculo.

## Preparar uma versão dos dados

No host `otherpages`, copie esta pasta para fora do diretório montado com os dados. Escolha um diretório absoluto novo para cada recorte. Guarde o arquivo de ambiente fora do controle de versão, com permissão 0600.

```bash
export COMPOSE_PROJECT_NAME=barbacue-routing
export ROUTING_DATA_DIR=/root/barbacue-routing/data-20261120
export ROUTING_NOMINATIM_PASSWORD="$(openssl rand -hex 24)"
./prepare.sh
python3 build-address-index.py "$ROUTING_DATA_DIR/cnefe"
docker compose -f compose.yml up -d --build osrm nominatim
```

`prepare.sh` importa o extrato Sul do Geofabrik e recorta o entorno de Jaraguá do Sul, pelos limites oeste −49,35, sul −26,73, leste −48,91 e norte −26,31. A origem do PBF e o SHA-256 ficam em `source-url` e `source.sha256`. Para repetir uma versão exatamente, informe o PBF original em uma versão datada ou reutilize o PBF arquivado e confira o checksum. O CNEFE 2022 é opcional. Seu índice guarda somente logradouro, número, município, CEP e coordenadas dos registros aos quais o IBGE atribuiu precisão de endereço. O script grava o SHA-256 de cada arquivo municipal em `address-index-provenance.json`.

```bash
curl --fail --silent 'http://127.0.0.1:18966/status?format=json' | jq -e '.status == 0'
curl --fail --silent 'http://127.0.0.1:18965/table/v1/driving/-49.074,-26.49;-49.07,-26.48?annotations=distance,duration' |
  jq -e '.code == "Ok" and .distances[0][1] > 0 and .durations[0][1] > 0'
```

O primeiro import do Nominatim leva alguns minutos. Somente conecte o aplicativo depois de o status retornar zero. As saídas persistentes dos contêineres de consulta estão desativadas para evitar gravação de URLs com endereços. Use apenas consultas com locais públicos ao diagnosticar o serviço com logging ativado.

## Conectar o aplicativo

Configure no ambiente do processo web do PM2, com o diretório de dados efetivo.

```dotenv
DELIVERY_OSRM_URL=http://127.0.0.1:18965
DELIVERY_NOMINATIM_URL=http://127.0.0.1:18966
DELIVERY_OSM_USER_AGENT=BarbacueDelivery/1.0
DELIVERY_NOMINATIM_MIN_INTERVAL_MS=50
DELIVERY_PROVIDER_TIMEOUT_MS=8000
DELIVERY_CNEFE_INDEX_PATH=/root/barbacue-routing/data-20261120/cnefe/address-index.json
```

O intervalo reduzido só se aplica a endpoints em loopback. Para um aplicativo web em contêiner, use rede privada entre os serviços e monte o índice CNEFE em um caminho legível pelo processo web, se optar por essa base. No despacho interno, um endereço legado sem município ou CEP pode usar o índice regional se logradouro e número apontarem para um único local no recorte. Na cotação pública, o índice continua exigindo CEP ou município.

Confirme o ponto de saída real em **Entrega e frete**. O despacho pode usar a origem com a cotação pública desligada. Para habilitar o frete no checkout, configure também a tarifa, o raio e valide um pedido de ponta a ponta. As regras de despacho e a criação automática ficam em **Despacho de entregas**. O agente trabalha com entregas próprias elegíveis. As entregas iFood continuam com o fluxo da plataforma.

Ao substituir os mapas, use outro diretório de dados, projeto Compose, portas e volume do Nominatim. Valide o candidato antes de alterar os endpoints do PM2. Preserve a versão anterior para retorno. Não reutilize o volume do Nominatim para importar um recorte diferente. Para desligar uma instância em homologação, use `docker compose -f compose.yml stop osrm nominatim`, preservando os dados.

## Medir com pedidos históricos

`apps/web/scripts/benchmark-routing.ts` usa a infraestrutura privada e abre transação somente leitura no banco. Execute no host dos serviços, com `DATABASE_URL` já fornecida pelo ambiente autorizado. Configure `ROUTING_BENCHMARK_ORIGIN_ADDRESS` com endereço público ou coordenada de referência se a origem ainda não estiver cadastrada, e `ROUTING_BENCHMARK_AS_OF` para fixar a data de corte. Para medir o ganho de cobertura, execute com o mesmo corte e compare Nominatim sozinho, Nominatim com `DELIVERY_CNEFE_INDEX_PATH` e essa mesma configuração com `ROUTING_BENCHMARK_REGIONAL_MATCH=true`. O script imprime contagens e métricas agregadas.

- [Extrato Sul do Geofabrik](https://download.geofabrik.de/south-america/brazil/sul.html)
- [Cadastro Nacional de Endereços para Fins Estatísticos do IBGE](https://www.ibge.gov.br/estatisticas/sociais/populacao/38734-cadastro-nacional-de-enderecos-para-finsestatisticos.html)
- [Atribuição ao OpenStreetMap](https://www.openstreetmap.org/copyright)
