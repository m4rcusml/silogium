# Q2 — Reservas de coworking — Nível 3

Todos os requisitos anteriores continuam válidos.

Cada sala passa a possuir uma fila de espera. IDs de solicitações bem-sucedidas também são globais e nunca reutilizáveis, inclusive após cancelamento ou promoção.

## Novas operações

### `joinWaitlist(timestamp, requestId, roomId, userId, start, end, attendees)` / `join_waitlist`

- Adiciona uma solicitação somente quando todos os dados são válidos **e existe conflito** com alguma reserva ativa da sala.
- Se a sala já estiver disponível para o intervalo, retorna `false`; o usuário deve usar `book`.
- Ordene a fila por `timestamp` de entrada e, em empate, `requestId`.

### `cancelWaitlist(timestamp, requestId)` / `cancel_waitlist`

- Remove uma solicitação ainda pendente e retorna `true`.
- Solicitações inexistentes, canceladas ou promovidas retornam `false`.

### `getWaitlist(timestamp, roomId)` / `get_waitlist`

- Retorna os IDs pendentes na ordem da fila.
- Sala inexistente retorna lista vazia.

## Promoção automática

Após um `cancel` bem-sucedido:

1. percorra a fila da sala em ordem;
2. promova cada solicitação que agora puder ser reservada;
3. uma promoção cria uma reserva cujo `bookingId` é o próprio `requestId`;
4. a promoção aumenta os minutos históricos do usuário;
5. uma solicitação que ainda conflita permanece na fila;
6. as promoções anteriores podem impedir promoções posteriores.

Não há promoção automática em outros métodos.
