# Q2 — Reservas de coworking — Nível 1

Implemente um sistema de reservas de salas em memória usando a classe `RoomReservationService`.

Os `timestamp`s das operações são inteiros estritamente crescentes. Horários das reservas também são inteiros, mas são independentes do `timestamp` da chamada.

Intervalos usam a convenção semiaberta `[start, end)`: uma reserva que termina em `20` não conflita com outra que começa em `20`.

## Operações

### `addRoom(roomId, capacity)` / `add_room`

- Cria uma sala com identificador não vazio e capacidade inteira positiva.
- Não permite identificadores duplicados.

### `book(timestamp, bookingId, roomId, userId, start, end, attendees)`

- Cria uma reserva quando `start < end`, `attendees > 0` e `attendees <= capacidade`.
- `bookingId`, `roomId` e `userId` devem ser não vazios.
- O ID de uma reserva bem-sucedida nunca pode ser reutilizado, mesmo após cancelamento.
- A reserva falha quando seu intervalo conflita com uma reserva ativa da mesma sala.
- Retorna `true` ou `false`.

### `cancel(timestamp, bookingId)`

- Cancela uma reserva ativa e retorna `true`.
- IDs inexistentes ou já cancelados retornam `false`.

### `roomSchedule(timestamp, roomId)` / `room_schedule`

- Retorna somente reservas ativas, ordenadas por `start` e depois por `bookingId`.
- Formato: `bookingId:start-end`, por exemplo `b1:10-20`.
- Sala inexistente retorna lista vazia.

## Exemplo

```text
addRoom("R1", 4)                              -> true
book(1, "b1", "R1", "u1", 10, 20, 3)     -> true
book(2, "b2", "R1", "u2", 15, 25, 2)     -> false
book(3, "b3", "R1", "u2", 20, 25, 2)     -> true
roomSchedule(4, "R1")                         -> ["b1:10-20", "b3:20-25"]
```
