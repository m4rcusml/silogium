# Q2 — Reservas de coworking — Nível 2

Todos os requisitos anteriores continuam válidos.

Cada usuário possui **minutos históricos reservados**: a soma de `end - start` de todas as reservas que foram criadas com sucesso. Cancelamentos não subtraem essa métrica.

## Novas operações

### `availableRooms(timestamp, start, end, attendees)` / `available_rooms`

- Retorna as salas capazes de receber a quantidade de participantes e sem conflito no intervalo.
- Entradas inválidas (`start >= end` ou `attendees <= 0`) retornam lista vazia.
- Ordene por capacidade crescente e, em empate, por `roomId` crescente.
- O retorno contém apenas os IDs das salas.

### `topUsers(timestamp, n)` / `top_users`

- Retorna até `n` usuários ordenados por minutos históricos decrescentes.
- Empates são resolvidos por `userId` crescente.
- Formato: `userId(minutes)`, por exemplo `ana(120)`.
- Inclua apenas usuários que já tiveram ao menos uma reserva bem-sucedida.
- Para `n <= 0`, retorne lista vazia.
