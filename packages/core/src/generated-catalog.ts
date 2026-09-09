// Gerado por npm run content:generate. Não edite manualmente.
import type { ProblemDefinition } from "./schemas.js";

export const seedProblems: ProblemDefinition[] = [
  {
    "schemaVersion": 1,
    "id": "291778f3-bd92-4e37-b9c8-f2df87025d63",
    "version": 1,
    "slug": "rede-de-armarios",
    "title": "Rede de armários de encomendas",
    "summary": "Implemente um serviço stateful com capacidade, movimentações agendadas, ranking e fusão de armários.",
    "locale": "pt-BR",
    "origin": "native",
    "visibility": "public",
    "status": "published",
    "format": "progressive",
    "executionModel": "call-sequence",
    "difficulty": "hard",
    "tags": [
      "estruturas de dados",
      "estado",
      "orientação a objetos",
      "simulação"
    ],
    "stages": [
      {
        "number": 1,
        "statementMd": "# Q1 — Rede de armários de encomendas — Nível 1\r\n\r\nImplemente um serviço em memória que administra armários e encomendas.\r\n\r\nUse a classe `ParcelLockerService` do arquivo da linguagem escolhida. Os `timestamp`s fornecidos aos métodos são inteiros e aparecem em ordem estritamente crescente nos testes; não é necessário validá-los.\r\n\r\n## Operações\r\n\r\n### `addLocker(lockerId, capacity)` / `add_locker`\r\n\r\n- Cria um armário com capacidade total `capacity`.\r\n- `lockerId` deve ser não vazio, `capacity` deve ser inteiro positivo e o identificador não pode existir.\r\n- Retorna `true` em caso de sucesso; caso contrário, `false`.\r\n\r\n### `storeParcel(timestamp, parcelId, lockerId, size)` / `store_parcel`\r\n\r\n- Armazena uma nova encomenda no armário.\r\n- `parcelId` deve ser não vazio e nunca pode ser reutilizado, mesmo após coleta.\r\n- `size` deve ser inteiro positivo.\r\n- A operação falha se o armário não existir ou se a capacidade livre for menor que `size`.\r\n- Retorna `true` ou `false`.\r\n\r\n### `collectParcel(timestamp, parcelId)` / `collect_parcel`\r\n\r\n- Remove uma encomenda atualmente armazenada e libera sua capacidade.\r\n- Uma encomenda já coletada ou inexistente provoca retorno `false`.\r\n\r\n### `getLoad(timestamp, lockerId)` / `get_load`\r\n\r\n- Retorna a soma dos tamanhos das encomendas atualmente armazenadas.\r\n- Retorna `null`/`None` quando o armário não existe.\r\n\r\n## Exemplo\r\n\r\n```text\r\naddLocker(\"A\", 10)                 -> true\r\nstoreParcel(1, \"p1\", \"A\", 6)    -> true\r\nstoreParcel(2, \"p2\", \"A\", 5)    -> false\r\ngetLoad(3, \"A\")                   -> 6\r\ncollectParcel(4, \"p1\")            -> true\r\ngetLoad(5, \"A\")                   -> 0\r\n```\r\n\r\nQuando terminar:\r\n\r\n```powershell\r\nnpm run assessment -- test q1 ts 1\r\n# ou\r\nnpm run assessment -- test q1 py 1\r\n```\r\n",
        "points": 150
      },
      {
        "number": 2,
        "statementMd": "# Q1 — Rede de armários de encomendas — Nível 2\r\n\r\nTodos os requisitos do nível 1 continuam válidos.\r\n\r\nCada armário passa a possuir uma métrica histórica chamada **atividade**, inicialmente zero:\r\n\r\n- armazenamento bem-sucedido: soma o tamanho ao armário de destino;\r\n- coleta bem-sucedida: soma o tamanho ao armário de origem;\r\n- movimentação bem-sucedida: soma o tamanho tanto à origem quanto ao destino;\r\n- operações malsucedidas não alteram atividade.\r\n\r\n## Novas operações\r\n\r\n### `moveParcel(timestamp, parcelId, targetLockerId)` / `move_parcel`\r\n\r\n- Move uma encomenda armazenada para outro armário.\r\n- Falha se a encomenda ou o destino não existir, o destino for o armário atual ou não houver capacidade.\r\n- A operação é atômica: em caso de falha, nenhum estado ou métrica muda.\r\n\r\n### `topLockers(timestamp, n)` / `top_lockers`\r\n\r\n- Retorna até `n` armários ordenados por atividade decrescente.\r\n- Empates são resolvidos por `lockerId` em ordem lexicográfica crescente.\r\n- O formato de cada item é `lockerId(activity)`, por exemplo `A(17)`.\r\n- Armários com atividade zero são incluídos.\r\n- Para `n <= 0`, retorna uma lista vazia.\r\n\r\n## Exemplo\r\n\r\n```text\r\naddLocker(\"A\", 10)                 -> true\r\naddLocker(\"B\", 10)                 -> true\r\nstoreParcel(1, \"p1\", \"A\", 4)    -> true   // A = 4\r\nmoveParcel(2, \"p1\", \"B\")         -> true   // A = 8, B = 4\r\ncollectParcel(3, \"p1\")            -> true   // B = 8\r\ntopLockers(4, 2)                    -> [\"A(8)\", \"B(8)\"]\r\n```\r\n",
        "points": 150
      },
      {
        "number": 3,
        "statementMd": "# Q1 — Rede de armários de encomendas — Nível 3\r\n\r\nTodos os requisitos anteriores continuam válidos.\r\n\r\nAgora uma encomenda pode ter no máximo uma movimentação pendente. Enquanto houver uma movimentação pendente, ela não pode ser movida manualmente nem coletada.\r\n\r\n## Novas operações\r\n\r\n### `scheduleMove(timestamp, parcelId, targetLockerId, executeAt)` / `schedule_move`\r\n\r\n- Agenda uma movimentação para um instante futuro: `executeAt > timestamp`.\r\n- A encomenda deve estar armazenada, não possuir outro agendamento e o destino deve existir e ser diferente do armário atual.\r\n- A capacidade não é reservada no agendamento; ela só é conferida na execução.\r\n- Retorna IDs sequenciais globais: `move-1`, `move-2`, ...\r\n- Em caso de falha, retorna `null`/`None` e não consome um ID.\r\n\r\n### `cancelScheduledMove(timestamp, moveId)` / `cancel_scheduled_move`\r\n\r\n- Cancela somente uma movimentação que ainda está pendente.\r\n- Retorna `true` quando cancelada e `false` nos demais casos.\r\n\r\n### `processScheduled(timestamp)` / `process_scheduled`\r\n\r\n- Processa todas as movimentações pendentes com `executeAt <= timestamp`.\r\n- A ordem é `executeAt` crescente e, em empate, ordem de criação.\r\n- Cada operação verifica a capacidade no momento da execução.\r\n- Uma operação sem capacidade falha definitivamente e deixa de estar pendente.\r\n- Retorna apenas os IDs executados com sucesso, na ordem de processamento.\r\n- Movimentações bem-sucedidas atualizam a atividade exatamente como `moveParcel`.\r\n\r\nOs agendamentos só são executados quando `processScheduled` é chamado; os demais métodos não os processam implicitamente.\r\n",
        "points": 150
      },
      {
        "number": 4,
        "statementMd": "# Q1 — Rede de armários de encomendas — Nível 4\r\n\r\nTodos os requisitos anteriores continuam válidos.\r\n\r\nDesde o nível 1, cada encomenda deve manter um histórico em ordem cronológica com os seguintes textos exatos:\r\n\r\n- armazenamento: `stored:ARMARIO@TIMESTAMP`;\r\n- movimentação: `moved:ORIGEM->DESTINO@TIMESTAMP`;\r\n- coleta: `collected:ARMARIO@TIMESTAMP`;\r\n- movimentação causada por fusão: `merged:ORIGEM->DESTINO@TIMESTAMP`.\r\n\r\n## Novas operações\r\n\r\n### `mergeLockers(timestamp, sourceLockerId, targetLockerId)` / `merge_lockers`\r\n\r\n- Origem e destino devem existir e ser diferentes.\r\n- Todas as encomendas armazenadas na origem são movidas para o destino.\r\n- A operação falha atomicamente se a capacidade livre do destino não comportar todas elas.\r\n- A capacidade total do destino **não** muda.\r\n- A atividade histórica do destino passa a ser a soma das atividades dos dois armários. A fusão em si não acrescenta atividade.\r\n- A origem é removida.\r\n- Agendamentos pendentes cujo destino era a origem passam a apontar para o destino.\r\n- Para cada encomenda movida pela fusão, adicione o evento `merged` ao histórico.\r\n\r\n### `getParcelHistory(timestamp, parcelId)` / `get_parcel_history`\r\n\r\n- Retorna uma nova lista com o histórico da encomenda.\r\n- Retorna lista vazia para encomenda inexistente.\r\n- Quem chama o método não pode conseguir modificar o histórico interno alterando a lista retornada.\r\n\r\nAo concluir, execute a submissão simulada:\r\n\r\n```powershell\r\nnpm run assessment -- submit q1 ts\r\n# ou\r\nnpm run assessment -- submit q1 py\r\n```\r\n",
        "points": 150
      }
    ],
    "runtimes": [
      {
        "language": "typescript",
        "version": "22.22.0",
        "starterCode": "/**\n * Q1 — Rede de armários de encomendas.\n *\n * Abra questions/q1_parcel_network/LEVEL_1.md e implemente somente o nível\n * atualmente desbloqueado. Preserve todas as assinaturas públicas.\n */\nexport class ParcelLockerService {\n  addLocker(lockerId: string, capacity: number): boolean {\n    return false;\n  }\n\n  storeParcel(timestamp: number, parcelId: string, lockerId: string, size: number): boolean {\n    return false;\n  }\n\n  collectParcel(timestamp: number, parcelId: string): boolean {\n    return false;\n  }\n\n  getLoad(timestamp: number, lockerId: string): number | null {\n    return null;\n  }\n\n  moveParcel(timestamp: number, parcelId: string, targetLockerId: string): boolean {\n    return false;\n  }\n\n  topLockers(timestamp: number, n: number): string[] {\n    return [];\n  }\n\n  scheduleMove(\n    timestamp: number,\n    parcelId: string,\n    targetLockerId: string,\n    executeAt: number\n  ): string | null {\n    return null;\n  }\n\n  cancelScheduledMove(timestamp: number, moveId: string): boolean {\n    return false;\n  }\n\n  processScheduled(timestamp: number): string[] {\n    return [];\n  }\n\n  mergeLockers(timestamp: number, sourceLockerId: string, targetLockerId: string): boolean {\n    return false;\n  }\n\n  getParcelHistory(timestamp: number, parcelId: string): string[] {\n    return [];\n  }\n}\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "ParcelLockerService",
          "methodMap": {}
        }
      },
      {
        "language": "python",
        "version": "3.13.11",
        "starterCode": "\"\"\"Q1 — Rede de armários de encomendas.\r\n\r\nAbra questions/q1_parcel_network/LEVEL_1.md e preserve as assinaturas públicas.\r\n\"\"\"\r\n\r\n\r\nclass ParcelLockerService:\r\n    def add_locker(self, locker_id: str, capacity: int) -> bool:\r\n        return False\r\n\r\n    def store_parcel(\r\n        self, timestamp: int, parcel_id: str, locker_id: str, size: int\r\n    ) -> bool:\r\n        return False\r\n\r\n    def collect_parcel(self, timestamp: int, parcel_id: str) -> bool:\r\n        return False\r\n\r\n    def get_load(self, timestamp: int, locker_id: str) -> int | None:\r\n        return None\r\n\r\n    def move_parcel(\r\n        self, timestamp: int, parcel_id: str, target_locker_id: str\r\n    ) -> bool:\r\n        return False\r\n\r\n    def top_lockers(self, timestamp: int, n: int) -> list[str]:\r\n        return []\r\n\r\n    def schedule_move(\r\n        self,\r\n        timestamp: int,\r\n        parcel_id: str,\r\n        target_locker_id: str,\r\n        execute_at: int,\r\n    ) -> str | None:\r\n        return None\r\n\r\n    def cancel_scheduled_move(self, timestamp: int, move_id: str) -> bool:\r\n        return False\r\n\r\n    def process_scheduled(self, timestamp: int) -> list[str]:\r\n        return []\r\n\r\n    def merge_lockers(\r\n        self, timestamp: int, source_locker_id: str, target_locker_id: str\r\n    ) -> bool:\r\n        return False\r\n\r\n    def get_parcel_history(self, timestamp: int, parcel_id: str) -> list[str]:\r\n        return []\r\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "ParcelLockerService",
          "methodMap": {
            "addLocker": "add_locker",
            "storeParcel": "store_parcel",
            "collectParcel": "collect_parcel",
            "getLoad": "get_load",
            "moveParcel": "move_parcel",
            "topLockers": "top_lockers",
            "scheduleMove": "schedule_move",
            "cancelScheduledMove": "cancel_scheduled_move",
            "processScheduled": "process_scheduled",
            "mergeLockers": "merge_lockers",
            "getParcelHistory": "get_parcel_history"
          }
        }
      }
    ],
    "examples": [],
    "limits": {
      "timeMs": 2000,
      "memoryMiB": 256,
      "outputBytes": 65536
    },
    "provenance": {
      "kind": "native",
      "createdBy": "system",
      "createdByHandle": "silogium",
      "assistedByAi": false,
      "statementLicense": "CC-BY-4.0",
      "codeLicense": "MIT"
    },
    "createdAt": "2026-09-08T12:00:00.000Z",
    "updatedAt": "2026-09-08T12:00:00.000Z"
  },
  {
    "schemaVersion": 1,
    "id": "9b3bf8eb-c1b2-4a0b-a092-b14983e50f0e",
    "version": 1,
    "slug": "reservas-de-coworking",
    "title": "Reservas de coworking",
    "summary": "Construa um sistema de reservas com conflitos, rankings, fila de espera e séries atômicas.",
    "locale": "pt-BR",
    "origin": "native",
    "visibility": "public",
    "status": "published",
    "format": "progressive",
    "executionModel": "call-sequence",
    "difficulty": "hard",
    "tags": [
      "intervalos",
      "ordenação",
      "estado",
      "atomicidade"
    ],
    "stages": [
      {
        "number": 1,
        "statementMd": "# Q2 — Reservas de coworking — Nível 1\r\n\r\nImplemente um sistema de reservas de salas em memória usando a classe `RoomReservationService`.\r\n\r\nOs `timestamp`s das operações são inteiros estritamente crescentes. Horários das reservas também são inteiros, mas são independentes do `timestamp` da chamada.\r\n\r\nIntervalos usam a convenção semiaberta `[start, end)`: uma reserva que termina em `20` não conflita com outra que começa em `20`.\r\n\r\n## Operações\r\n\r\n### `addRoom(roomId, capacity)` / `add_room`\r\n\r\n- Cria uma sala com identificador não vazio e capacidade inteira positiva.\r\n- Não permite identificadores duplicados.\r\n\r\n### `book(timestamp, bookingId, roomId, userId, start, end, attendees)`\r\n\r\n- Cria uma reserva quando `start < end`, `attendees > 0` e `attendees <= capacidade`.\r\n- `bookingId`, `roomId` e `userId` devem ser não vazios.\r\n- O ID de uma reserva bem-sucedida nunca pode ser reutilizado, mesmo após cancelamento.\r\n- A reserva falha quando seu intervalo conflita com uma reserva ativa da mesma sala.\r\n- Retorna `true` ou `false`.\r\n\r\n### `cancel(timestamp, bookingId)`\r\n\r\n- Cancela uma reserva ativa e retorna `true`.\r\n- IDs inexistentes ou já cancelados retornam `false`.\r\n\r\n### `roomSchedule(timestamp, roomId)` / `room_schedule`\r\n\r\n- Retorna somente reservas ativas, ordenadas por `start` e depois por `bookingId`.\r\n- Formato: `bookingId:start-end`, por exemplo `b1:10-20`.\r\n- Sala inexistente retorna lista vazia.\r\n\r\n## Exemplo\r\n\r\n```text\r\naddRoom(\"R1\", 4)                              -> true\r\nbook(1, \"b1\", \"R1\", \"u1\", 10, 20, 3)     -> true\r\nbook(2, \"b2\", \"R1\", \"u2\", 15, 25, 2)     -> false\r\nbook(3, \"b3\", \"R1\", \"u2\", 20, 25, 2)     -> true\r\nroomSchedule(4, \"R1\")                         -> [\"b1:10-20\", \"b3:20-25\"]\r\n```\r\n",
        "points": 150
      },
      {
        "number": 2,
        "statementMd": "# Q2 — Reservas de coworking — Nível 2\r\n\r\nTodos os requisitos anteriores continuam válidos.\r\n\r\nCada usuário possui **minutos históricos reservados**: a soma de `end - start` de todas as reservas que foram criadas com sucesso. Cancelamentos não subtraem essa métrica.\r\n\r\n## Novas operações\r\n\r\n### `availableRooms(timestamp, start, end, attendees)` / `available_rooms`\r\n\r\n- Retorna as salas capazes de receber a quantidade de participantes e sem conflito no intervalo.\r\n- Entradas inválidas (`start >= end` ou `attendees <= 0`) retornam lista vazia.\r\n- Ordene por capacidade crescente e, em empate, por `roomId` crescente.\r\n- O retorno contém apenas os IDs das salas.\r\n\r\n### `topUsers(timestamp, n)` / `top_users`\r\n\r\n- Retorna até `n` usuários ordenados por minutos históricos decrescentes.\r\n- Empates são resolvidos por `userId` crescente.\r\n- Formato: `userId(minutes)`, por exemplo `ana(120)`.\r\n- Inclua apenas usuários que já tiveram ao menos uma reserva bem-sucedida.\r\n- Para `n <= 0`, retorne lista vazia.\r\n",
        "points": 150
      },
      {
        "number": 3,
        "statementMd": "# Q2 — Reservas de coworking — Nível 3\r\n\r\nTodos os requisitos anteriores continuam válidos.\r\n\r\nCada sala passa a possuir uma fila de espera. IDs de solicitações bem-sucedidas também são globais e nunca reutilizáveis, inclusive após cancelamento ou promoção.\r\n\r\n## Novas operações\r\n\r\n### `joinWaitlist(timestamp, requestId, roomId, userId, start, end, attendees)` / `join_waitlist`\r\n\r\n- Adiciona uma solicitação somente quando todos os dados são válidos **e existe conflito** com alguma reserva ativa da sala.\r\n- Se a sala já estiver disponível para o intervalo, retorna `false`; o usuário deve usar `book`.\r\n- Ordene a fila por `timestamp` de entrada e, em empate, `requestId`.\r\n\r\n### `cancelWaitlist(timestamp, requestId)` / `cancel_waitlist`\r\n\r\n- Remove uma solicitação ainda pendente e retorna `true`.\r\n- Solicitações inexistentes, canceladas ou promovidas retornam `false`.\r\n\r\n### `getWaitlist(timestamp, roomId)` / `get_waitlist`\r\n\r\n- Retorna os IDs pendentes na ordem da fila.\r\n- Sala inexistente retorna lista vazia.\r\n\r\n## Promoção automática\r\n\r\nApós um `cancel` bem-sucedido:\r\n\r\n1. percorra a fila da sala em ordem;\r\n2. promova cada solicitação que agora puder ser reservada;\r\n3. uma promoção cria uma reserva cujo `bookingId` é o próprio `requestId`;\r\n4. a promoção aumenta os minutos históricos do usuário;\r\n5. uma solicitação que ainda conflita permanece na fila;\r\n6. as promoções anteriores podem impedir promoções posteriores.\r\n\r\nNão há promoção automática em outros métodos.\r\n",
        "points": 150
      },
      {
        "number": 4,
        "statementMd": "# Q2 — Reservas de coworking — Nível 4\r\n\r\nTodos os requisitos anteriores continuam válidos.\r\n\r\n## Novas operações\r\n\r\n### `bookSeries(timestamp, seriesId, roomId, userId, starts, duration, attendees)` / `book_series`\r\n\r\nCria uma série de reservas de forma **atômica**:\r\n\r\n- `seriesId` deve ser não vazio e nunca pode ser reutilizado após uma série bem-sucedida;\r\n- `starts` deve conter pelo menos um inteiro e não pode possuir valores duplicados;\r\n- `duration` e `attendees` devem ser positivos;\r\n- a sala e o usuário devem ser válidos e a capacidade deve ser suficiente;\r\n- cada ocorrência usa `[start, start + duration)`;\r\n- nenhuma ocorrência pode conflitar com reserva ativa ou com outra ocorrência da mesma série;\r\n- os IDs são `seriesId#1`, `seriesId#2`, ... seguindo a ordem original de `starts`;\r\n- se qualquer ocorrência for inválida, nenhuma é criada e nenhum ID é consumido;\r\n- cada ocorrência criada soma sua duração aos minutos históricos do usuário.\r\n\r\n### `cancelSeries(timestamp, seriesId)` / `cancel_series`\r\n\r\n- Cancela todas as ocorrências ainda ativas da série.\r\n- Retorna a quantidade efetivamente cancelada.\r\n- Cancele todas as ocorrências antes de promover filas de espera.\r\n- Depois, processe uma vez a fila de cada sala afetada usando as regras do nível 3.\r\n- Série inexistente ou totalmente cancelada retorna `0`.\r\n\r\nAo concluir, execute:\r\n\r\n```powershell\r\nnpm run assessment -- submit q2 ts\r\n# ou\r\nnpm run assessment -- submit q2 py\r\n```\r\n",
        "points": 150
      }
    ],
    "runtimes": [
      {
        "language": "typescript",
        "version": "22.22.0",
        "starterCode": "/**\r\n * Q2 — Reservas de coworking.\r\n *\r\n * Abra questions/q2_room_reservations/LEVEL_1.md e implemente somente o nível\r\n * atualmente desbloqueado. Preserve todas as assinaturas públicas.\r\n */\r\nexport class RoomReservationService {\r\n  addRoom(roomId: string, capacity: number): boolean {\r\n    return false;\r\n  }\r\n\r\n  book(\r\n    timestamp: number,\r\n    bookingId: string,\r\n    roomId: string,\r\n    userId: string,\r\n    start: number,\r\n    end: number,\r\n    attendees: number\r\n  ): boolean {\r\n    return false;\r\n  }\r\n\r\n  cancel(timestamp: number, bookingId: string): boolean {\r\n    return false;\r\n  }\r\n\r\n  roomSchedule(timestamp: number, roomId: string): string[] {\r\n    return [];\r\n  }\r\n\r\n  availableRooms(timestamp: number, start: number, end: number, attendees: number): string[] {\r\n    return [];\r\n  }\r\n\r\n  topUsers(timestamp: number, n: number): string[] {\r\n    return [];\r\n  }\r\n\r\n  joinWaitlist(\r\n    timestamp: number,\r\n    requestId: string,\r\n    roomId: string,\r\n    userId: string,\r\n    start: number,\r\n    end: number,\r\n    attendees: number\r\n  ): boolean {\r\n    return false;\r\n  }\r\n\r\n  cancelWaitlist(timestamp: number, requestId: string): boolean {\r\n    return false;\r\n  }\r\n\r\n  getWaitlist(timestamp: number, roomId: string): string[] {\r\n    return [];\r\n  }\r\n\r\n  bookSeries(\r\n    timestamp: number,\r\n    seriesId: string,\r\n    roomId: string,\r\n    userId: string,\r\n    starts: number[],\r\n    duration: number,\r\n    attendees: number\r\n  ): boolean {\r\n    return false;\r\n  }\r\n\r\n  cancelSeries(timestamp: number, seriesId: string): number {\r\n    return 0;\r\n  }\r\n}\r\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "RoomReservationService",
          "methodMap": {}
        }
      },
      {
        "language": "python",
        "version": "3.13.11",
        "starterCode": "\"\"\"Q2 — Reservas de coworking.\r\n\r\nAbra questions/q2_room_reservations/LEVEL_1.md e preserve as assinaturas públicas.\r\n\"\"\"\r\n\r\n\r\nclass RoomReservationService:\r\n    def add_room(self, room_id: str, capacity: int) -> bool:\r\n        return False\r\n\r\n    def book(\r\n        self,\r\n        timestamp: int,\r\n        booking_id: str,\r\n        room_id: str,\r\n        user_id: str,\r\n        start: int,\r\n        end: int,\r\n        attendees: int,\r\n    ) -> bool:\r\n        return False\r\n\r\n    def cancel(self, timestamp: int, booking_id: str) -> bool:\r\n        return False\r\n\r\n    def room_schedule(self, timestamp: int, room_id: str) -> list[str]:\r\n        return []\r\n\r\n    def available_rooms(\r\n        self, timestamp: int, start: int, end: int, attendees: int\r\n    ) -> list[str]:\r\n        return []\r\n\r\n    def top_users(self, timestamp: int, n: int) -> list[str]:\r\n        return []\r\n\r\n    def join_waitlist(\r\n        self,\r\n        timestamp: int,\r\n        request_id: str,\r\n        room_id: str,\r\n        user_id: str,\r\n        start: int,\r\n        end: int,\r\n        attendees: int,\r\n    ) -> bool:\r\n        return False\r\n\r\n    def cancel_waitlist(self, timestamp: int, request_id: str) -> bool:\r\n        return False\r\n\r\n    def get_waitlist(self, timestamp: int, room_id: str) -> list[str]:\r\n        return []\r\n\r\n    def book_series(\r\n        self,\r\n        timestamp: int,\r\n        series_id: str,\r\n        room_id: str,\r\n        user_id: str,\r\n        starts: list[int],\r\n        duration: int,\r\n        attendees: int,\r\n    ) -> bool:\r\n        return False\r\n\r\n    def cancel_series(self, timestamp: int, series_id: str) -> int:\r\n        return 0\r\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "RoomReservationService",
          "methodMap": {
            "addRoom": "add_room",
            "roomSchedule": "room_schedule",
            "availableRooms": "available_rooms",
            "topUsers": "top_users",
            "joinWaitlist": "join_waitlist",
            "cancelWaitlist": "cancel_waitlist",
            "getWaitlist": "get_waitlist",
            "bookSeries": "book_series",
            "cancelSeries": "cancel_series"
          }
        }
      }
    ],
    "examples": [],
    "limits": {
      "timeMs": 2000,
      "memoryMiB": 256,
      "outputBytes": 65536
    },
    "provenance": {
      "kind": "native",
      "createdBy": "system",
      "createdByHandle": "silogium",
      "assistedByAi": false,
      "statementLicense": "CC-BY-4.0",
      "codeLicense": "MIT"
    },
    "createdAt": "2026-09-08T12:00:00.000Z",
    "updatedAt": "2026-09-08T12:00:00.000Z"
  },
  {
    "schemaVersion": 1,
    "id": "fbb9e49b-572b-412d-8690-50c78e57f9a9",
    "version": 1,
    "slug": "fazenda-de-builds",
    "title": "Fazenda de execução de jobs",
    "summary": "Distribua jobs entre workers com capacidade, dependências acíclicas, ranking e drenagem atômica.",
    "locale": "pt-BR",
    "origin": "native",
    "visibility": "public",
    "status": "published",
    "format": "progressive",
    "executionModel": "call-sequence",
    "difficulty": "hard",
    "tags": [
      "grafos",
      "dependências",
      "estado",
      "escalonamento"
    ],
    "stages": [
      {
        "number": 1,
        "statementMd": "# Q3 — Fazenda de execução de jobs — Nível 1\n\nImplemente um serviço em memória que distribui jobs de compilação entre workers.\n\nUse `BuildFarmService`. Os `timestamp`s chegam em ordem estritamente crescente e não precisam ser validados.\n\n## Operações\n\n### `addWorker(workerId, capacity)` / `add_worker`\n\n- Cria um worker com ID não vazio e capacidade inteira positiva.\n- IDs de workers ativos não podem se repetir.\n- Retorna `true` no sucesso e `false` no erro.\n\n### `submitJob(timestamp, jobId, workerId, cost)` / `submit_job`\n\n- Cria um job ativo no worker indicado.\n- `jobId` é não vazio e nunca pode ser reutilizado, mesmo após conclusão.\n- `cost` é inteiro positivo e consome capacidade enquanto o job estiver ativo.\n- Falha quando o worker não existe ou sua capacidade livre é menor que o custo.\n\n### `completeJob(timestamp, jobId)` / `complete_job`\n\n- Conclui um job ativo e libera sua capacidade.\n- Job inexistente ou já concluído retorna `false`.\n\n### `getWorkerLoad(timestamp, workerId)` / `get_worker_load`\n\n- Retorna a soma dos custos dos jobs ativos no worker.\n- Worker inexistente retorna `null`/`None`.\n\n```text\naddWorker(\"w1\", 10)               -> true\nsubmitJob(1, \"build-a\", \"w1\", 6) -> true\nsubmitJob(2, \"build-b\", \"w1\", 5) -> false\ngetWorkerLoad(3, \"w1\")            -> 6\ncompleteJob(4, \"build-a\")         -> true\ngetWorkerLoad(5, \"w1\")            -> 0\n```\n\nQuando terminar:\n\n```powershell\nnpm run assessment -- test q3 ts 1\n# ou\nnpm run assessment -- test q3 py 1\n```\n",
        "points": 150
      },
      {
        "number": 2,
        "statementMd": "# Q3 — Fazenda de execução de jobs — Nível 2\n\nTodos os requisitos anteriores continuam válidos.\n\nCada worker passa a manter **trabalho concluído**, inicialmente zero. Ao concluir um job, some seu `cost` ao worker em que ele estava naquele momento. Transferências não alteram essa métrica.\n\n## Novas operações\n\n### `transferJob(timestamp, jobId, targetWorkerId)` / `transfer_job`\n\n- Move um job ativo para outro worker.\n- Falha se job ou destino não existir, o destino for o worker atual ou não houver capacidade.\n- A operação é atômica: uma falha não altera cargas nem estado.\n\n### `topWorkers(timestamp, n)` / `top_workers`\n\n- Retorna até `n` workers ativos por trabalho concluído decrescente.\n- Empates usam `workerId` lexicográfico crescente.\n- Formato: `workerId(total)`, por exemplo `w1(17)`.\n- Workers com zero são incluídos; `n <= 0` retorna lista vazia.\n\n```text\naddWorker(\"a\", 10)          -> true\naddWorker(\"b\", 10)          -> true\nsubmitJob(1, \"j\", \"a\", 4)  -> true\ntransferJob(2, \"j\", \"b\")   -> true\ncompleteJob(3, \"j\")         -> true\ntopWorkers(4, 2)             -> [\"b(4)\", \"a(0)\"]\n```\n",
        "points": 150
      },
      {
        "number": 3,
        "statementMd": "# Q3 — Fazenda de execução de jobs — Nível 3\n\nTodos os requisitos anteriores continuam válidos.\n\nJobs agora podem depender de outros jobs. Um job está **pronto** quando está ativo e todas as suas dependências foram concluídas. `completeJob` deve retornar `false` enquanto houver qualquer dependência não concluída.\n\n## Novas operações\n\n### `addDependency(timestamp, jobId, prerequisiteJobId)` / `add_dependency`\n\n- O job dependente deve existir e estar ativo.\n- O pré-requisito pode estar ativo ou concluído, mas deve existir.\n- Não permite autodependência, duplicata ou ciclo direto/indireto.\n- Em caso de sucesso, registra a dependência e retorna `true`.\n\nUm ciclo existe quando, após a operação, algum job depende de si por uma cadeia de dependências.\n\n### `readyJobs(timestamp, workerId)` / `ready_jobs`\n\n- Retorna IDs dos jobs ativos e prontos atribuídos ao worker.\n- Ordene por `cost` decrescente e, em empate, `jobId` crescente.\n- Worker inexistente retorna lista vazia.\n\nTransferir um job não altera suas dependências.\n",
        "points": 150
      },
      {
        "number": 4,
        "statementMd": "# Q3 — Fazenda de execução de jobs — Nível 4\n\nTodos os requisitos anteriores continuam válidos.\n\nDesde o nível 1, cada job mantém um histórico cronológico com textos exatos:\n\n- `submitted:WORKER@TIMESTAMP`;\n- `transferred:ORIGEM->DESTINO@TIMESTAMP`;\n- `completed:WORKER@TIMESTAMP`;\n- `depends-on:JOB@TIMESTAMP`;\n- `drained:ORIGEM->DESTINO@TIMESTAMP`.\n\n## Novas operações\n\n### `drainWorker(timestamp, sourceWorkerId, targetWorkerIds)` / `drain_worker`\n\nDesativa um worker e redistribui todos os seus jobs ativos de forma atômica.\n\n- Origem deve existir.\n- A lista de destinos deve ser não vazia, sem duplicatas, sem a origem e composta apenas por workers existentes.\n- Ordene os jobs da origem por `cost` decrescente e depois `jobId` crescente.\n- Para cada job, escolha o destino com **maior capacidade livre naquele momento**; em empate, use `workerId` crescente.\n- Um destino só é elegível se comportar o job.\n- Se algum job não puder ser alocado, nada muda e a origem permanece ativa.\n- No sucesso, registre `drained` nos jobs transferidos e remova o worker de origem.\n- O trabalho concluído histórico da origem não é transferido; ele deixa de aparecer em `topWorkers` porque a origem foi removida.\n- Dependências continuam inalteradas.\n\n### `getJobHistory(timestamp, jobId)` / `get_job_history`\n\n- Retorna uma nova lista com o histórico do job.\n- Job inexistente retorna lista vazia.\n- Alterar o array/lista retornado não pode modificar o estado interno.\n\nAo terminar:\n\n```powershell\nnpm run assessment -- submit q3 ts\n# ou\nnpm run assessment -- submit q3 py\n```\n",
        "points": 150
      }
    ],
    "runtimes": [
      {
        "language": "typescript",
        "version": "22.22.0",
        "starterCode": "/**\n * Q3 — Fazenda de execução de jobs.\n *\n * Abra questions/q3_build_farm/LEVEL_1.md e implemente somente o nível atual.\n * Preserve todas as assinaturas públicas.\n */\nexport class BuildFarmService {\n  addWorker(workerId: string, capacity: number): boolean {\n    return false;\n  }\n\n  submitJob(timestamp: number, jobId: string, workerId: string, cost: number): boolean {\n    return false;\n  }\n\n  completeJob(timestamp: number, jobId: string): boolean {\n    return false;\n  }\n\n  getWorkerLoad(timestamp: number, workerId: string): number | null {\n    return null;\n  }\n\n  transferJob(timestamp: number, jobId: string, targetWorkerId: string): boolean {\n    return false;\n  }\n\n  topWorkers(timestamp: number, n: number): string[] {\n    return [];\n  }\n\n  addDependency(timestamp: number, jobId: string, prerequisiteJobId: string): boolean {\n    return false;\n  }\n\n  readyJobs(timestamp: number, workerId: string): string[] {\n    return [];\n  }\n\n  drainWorker(timestamp: number, sourceWorkerId: string, targetWorkerIds: string[]): boolean {\n    return false;\n  }\n\n  getJobHistory(timestamp: number, jobId: string): string[] {\n    return [];\n  }\n}\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "BuildFarmService",
          "methodMap": {}
        }
      },
      {
        "language": "python",
        "version": "3.13.11",
        "starterCode": "\"\"\"Q3 — Fazenda de execução de jobs.\n\nAbra questions/q3_build_farm/LEVEL_1.md e preserve as assinaturas públicas.\n\"\"\"\n\n\nclass BuildFarmService:\n    def add_worker(self, worker_id: str, capacity: int) -> bool:\n        return False\n\n    def submit_job(\n        self, timestamp: int, job_id: str, worker_id: str, cost: int\n    ) -> bool:\n        return False\n\n    def complete_job(self, timestamp: int, job_id: str) -> bool:\n        return False\n\n    def get_worker_load(self, timestamp: int, worker_id: str) -> int | None:\n        return None\n\n    def transfer_job(\n        self, timestamp: int, job_id: str, target_worker_id: str\n    ) -> bool:\n        return False\n\n    def top_workers(self, timestamp: int, n: int) -> list[str]:\n        return []\n\n    def add_dependency(\n        self, timestamp: int, job_id: str, prerequisite_job_id: str\n    ) -> bool:\n        return False\n\n    def ready_jobs(self, timestamp: int, worker_id: str) -> list[str]:\n        return []\n\n    def drain_worker(\n        self, timestamp: int, source_worker_id: str, target_worker_ids: list[str]\n    ) -> bool:\n        return False\n\n    def get_job_history(self, timestamp: int, job_id: str) -> list[str]:\n        return []\n",
        "entrypoint": {
          "kind": "class",
          "symbol": "BuildFarmService",
          "methodMap": {
            "addWorker": "add_worker",
            "submitJob": "submit_job",
            "completeJob": "complete_job",
            "getWorkerLoad": "get_worker_load",
            "transferJob": "transfer_job",
            "topWorkers": "top_workers",
            "addDependency": "add_dependency",
            "readyJobs": "ready_jobs",
            "drainWorker": "drain_worker",
            "getJobHistory": "get_job_history"
          }
        }
      }
    ],
    "examples": [],
    "limits": {
      "timeMs": 2000,
      "memoryMiB": 256,
      "outputBytes": 65536
    },
    "provenance": {
      "kind": "native",
      "createdBy": "system",
      "createdByHandle": "silogium",
      "assistedByAi": false,
      "statementLicense": "CC-BY-4.0",
      "codeLicense": "MIT"
    },
    "createdAt": "2026-09-08T12:00:00.000Z",
    "updatedAt": "2026-09-08T12:00:00.000Z"
  }
];
