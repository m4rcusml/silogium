# Q1 — Rede de armários de encomendas — Nível 3

Todos os requisitos anteriores continuam válidos.

Agora uma encomenda pode ter no máximo uma movimentação pendente. Enquanto houver uma movimentação pendente, ela não pode ser movida manualmente nem coletada.

## Novas operações

### `scheduleMove(timestamp, parcelId, targetLockerId, executeAt)` / `schedule_move`

- Agenda uma movimentação para um instante futuro: `executeAt > timestamp`.
- A encomenda deve estar armazenada, não possuir outro agendamento e o destino deve existir e ser diferente do armário atual.
- A capacidade não é reservada no agendamento; ela só é conferida na execução.
- Retorna IDs sequenciais globais: `move-1`, `move-2`, ...
- Em caso de falha, retorna `null`/`None` e não consome um ID.

### `cancelScheduledMove(timestamp, moveId)` / `cancel_scheduled_move`

- Cancela somente uma movimentação que ainda está pendente.
- Retorna `true` quando cancelada e `false` nos demais casos.

### `processScheduled(timestamp)` / `process_scheduled`

- Processa todas as movimentações pendentes com `executeAt <= timestamp`.
- A ordem é `executeAt` crescente e, em empate, ordem de criação.
- Cada operação verifica a capacidade no momento da execução.
- Uma operação sem capacidade falha definitivamente e deixa de estar pendente.
- Retorna apenas os IDs executados com sucesso, na ordem de processamento.
- Movimentações bem-sucedidas atualizam a atividade exatamente como `moveParcel`.

Os agendamentos só são executados quando `processScheduled` é chamado; os demais métodos não os processam implicitamente.
