# Q1 — Rede de armários de encomendas — Nível 4

Todos os requisitos anteriores continuam válidos.

Desde o nível 1, cada encomenda deve manter um histórico em ordem cronológica com os seguintes textos exatos:

- armazenamento: `stored:ARMARIO@TIMESTAMP`;
- movimentação: `moved:ORIGEM->DESTINO@TIMESTAMP`;
- coleta: `collected:ARMARIO@TIMESTAMP`;
- movimentação causada por fusão: `merged:ORIGEM->DESTINO@TIMESTAMP`.

## Novas operações

### `mergeLockers(timestamp, sourceLockerId, targetLockerId)` / `merge_lockers`

- Origem e destino devem existir e ser diferentes.
- Todas as encomendas armazenadas na origem são movidas para o destino.
- A operação falha atomicamente se a capacidade livre do destino não comportar todas elas.
- A capacidade total do destino **não** muda.
- A atividade histórica do destino passa a ser a soma das atividades dos dois armários. A fusão em si não acrescenta atividade.
- A origem é removida.
- Agendamentos pendentes cujo destino era a origem passam a apontar para o destino.
- Para cada encomenda movida pela fusão, adicione o evento `merged` ao histórico.

### `getParcelHistory(timestamp, parcelId)` / `get_parcel_history`

- Retorna uma nova lista com o histórico da encomenda.
- Retorna lista vazia para encomenda inexistente.
- Quem chama o método não pode conseguir modificar o histórico interno alterando a lista retornada.

Ao concluir, execute a submissão simulada:

```powershell
npm run assessment -- submit q1 ts
# ou
npm run assessment -- submit q1 py
```
