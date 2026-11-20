-- Croqui do Barbacue baseado no vídeo e nos canais 1, 2 e 4 de 20/11/2026.
-- A passagem junto ao caixa liga o interior à circulação entre as fileiras.
-- A fileira do banco termina na curva junto ao vidro e à divisória.
-- As posições são referências visuais. O cadastro e os QR codes ficam intactos.
-- A posição 1 aguarda a mesa, a 5 deu lugar ao freezer e a 15 é usada sem chuva.
UPDATE "restaurant_floor_plan"
SET "elements" = $floor$
[
  {"id": "dc7a66a7-9925-5fda-b4b9-51964acc615d", "kind": "area", "name": "Salão e varanda · vidro voltado para a rua", "locked": false, "x": 0, "y": 0, "width": 32, "height": 20},
  {"id": "3ece8758-a1e9-5e61-ad03-9dd680894b9c", "kind": "area", "name": "Posição 1 · aguardando mesa", "locked": false, "x": 0, "y": 3, "width": 3, "height": 4},
  {"id": "9a4f82d1-2733-5df9-a217-7a3218215c1f", "kind": "area", "name": "Geladeiras e freezer · posição 5", "locked": true, "x": 8, "y": 12, "width": 4, "height": 7},
  {"id": "899cd2ae-fc05-577c-b0bb-4175ffa56074", "kind": "area", "name": "Posição 15 · só sem chuva", "locked": false, "x": 28, "y": 0, "width": 4, "height": 3},
  {"id": "cf205334-beae-5edb-951f-7ec4cfafe69c", "kind": "area", "name": "Divisória", "locked": true, "x": 19, "y": 16, "width": 8, "height": 1},
  {"id": "cf205334-beae-5edb-951f-14cfcfafe69c", "kind": "area", "name": "Caixa", "locked": true, "x": 2, "y": 14, "width": 6, "height": 5},
  {"id": "7e3a5b2d-6dc2-50ed-b9c0-c47a48d8a9fa", "kind": "area", "name": "Entrada pela rua", "locked": false, "x": 23, "y": 0, "width": 5, "height": 2},
  {"id": "3652be56-ae35-5ccf-9fec-3bee9fea5fd2", "kind": "area", "name": "Porta para a varanda", "locked": false, "x": 9, "y": 8, "width": 6, "height": 2},
  {"id": "cd1d5609-669d-5a4d-9a83-c822a7bd0102", "kind": "table", "reference": "Posição 2", "tableId": null, "x": 3, "y": 3, "width": 2, "height": 3},
  {"id": "bc0671cb-7c28-5bd9-85c8-05bffcf9e01b", "kind": "table", "reference": "Posição 3", "tableId": null, "x": 6, "y": 3, "width": 2, "height": 3},
  {"id": "47dc31d1-6e05-57dc-a068-681613c67959", "kind": "table", "reference": "Posição 4", "tableId": null, "x": 9, "y": 3, "width": 2, "height": 3},
  {"id": "fa78c26a-da93-51f7-bdec-da929167c0a0", "kind": "table", "reference": "Posição 6", "tableId": null, "x": 12, "y": 13, "width": 3, "height": 3},
  {"id": "e0bd57e5-8c11-5fc5-912f-4b4d74f137f3", "kind": "table", "reference": "Posição 7", "tableId": null, "x": 16, "y": 13, "width": 3, "height": 3},
  {"id": "0df03e65-9caa-51da-8757-167df40e4be1", "kind": "table", "reference": "Posição 8", "tableId": null, "x": 20, "y": 13, "width": 3, "height": 3},
  {"id": "2bb70054-0f2c-5747-94f1-5a755d794b21", "kind": "table", "reference": "Posição 9", "tableId": null, "x": 24, "y": 13, "width": 3, "height": 3},
  {"id": "e8a89793-f6c5-5511-8ed7-1984348daa32", "kind": "table", "reference": "Posição 10", "tableId": null, "x": 28, "y": 13, "width": 3, "height": 3},
  {"id": "79268c95-d623-5c56-a00f-2431865f8758", "kind": "table", "reference": "Posição 11", "tableId": null, "x": 28, "y": 17, "width": 3, "height": 3},
  {"id": "b738f983-c95e-5645-94d4-d57c49658258", "kind": "table", "reference": "Posição 12", "tableId": null, "x": 29, "y": 10, "width": 3, "height": 2},
  {"id": "8e65e265-1ca2-5d15-b85a-4d184e598db1", "kind": "table", "reference": "Posição 13", "tableId": null, "x": 28, "y": 7, "width": 3, "height": 2},
  {"id": "c4319656-704c-566b-8fee-66083dfa60c1", "kind": "table", "reference": "Posição 14", "tableId": null, "x": 27, "y": 3, "width": 3, "height": 3},
  {"id": "1c1ee51e-560e-56d3-ad09-74572433b9cd", "kind": "table", "reference": "Posição 16", "tableId": null, "x": 20, "y": 4, "width": 3, "height": 3},
  {"id": "257e59e7-0f04-533b-8197-c63b222aa056", "kind": "table", "reference": "Posição 17", "tableId": null, "x": 14, "y": 4, "width": 3, "height": 3}
]
$floor$::jsonb,
    "revision" = "revision" + 1
WHERE "id" = 1 AND "revision" = 0 AND "elements" = '[]'::jsonb;
