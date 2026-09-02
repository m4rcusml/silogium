# Q2 — Reservas de coworking — Nível 4

Todos os requisitos anteriores continuam válidos.

## Novas operações

### `bookSeries(timestamp, seriesId, roomId, userId, starts, duration, attendees)` / `book_series`

Cria uma série de reservas de forma **atômica**:

- `seriesId` deve ser não vazio e nunca pode ser reutilizado após uma série bem-sucedida;
- `starts` deve conter pelo menos um inteiro e não pode possuir valores duplicados;
- `duration` e `attendees` devem ser positivos;
- a sala e o usuário devem ser válidos e a capacidade deve ser suficiente;
- cada ocorrência usa `[start, start + duration)`;
- nenhuma ocorrência pode conflitar com reserva ativa ou com outra ocorrência da mesma série;
- os IDs são `seriesId#1`, `seriesId#2`, ... seguindo a ordem original de `starts`;
- se qualquer ocorrência for inválida, nenhuma é criada e nenhum ID é consumido;
- cada ocorrência criada soma sua duração aos minutos históricos do usuário.

### `cancelSeries(timestamp, seriesId)` / `cancel_series`

- Cancela todas as ocorrências ainda ativas da série.
- Retorna a quantidade efetivamente cancelada.
- Cancele todas as ocorrências antes de promover filas de espera.
- Depois, processe uma vez a fila de cada sala afetada usando as regras do nível 3.
- Série inexistente ou totalmente cancelada retorna `0`.

Ao concluir, execute:

```powershell
npm run assessment -- submit q2 ts
# ou
npm run assessment -- submit q2 py
```
