# Recursos online para treinar o CodeSignal ICA em TypeScript

Pesquisa atualizada em **02/09/2026**, usando apenas páginas oficiais das plataformas. Esta lista treina o **formato e as habilidades**, não tenta reproduzir nem antecipar uma questão real do Nubank.

## O que priorizar

O Industry Coding Assessment (ICA) oficial tem **uma questão baseada em projeto, quatro níveis progressivos e limite de 90 minutos**. Os requisitos se acumulam; o quarto nível exige reaproveitar, encapsular ou refatorar o que já existe sem quebrar compatibilidade. O primeiro nível enfatiza operações básicas e casos extremos; o segundo adiciona processamento de dados; os dois últimos estendem o sistema com funcionalidades mais avançadas. [Regras oficiais do ICA — CodeSignal](https://support.codesignal.com/hc/en-us/articles/19116922232983-What-are-the-Industry-Coding-Assessment-ICA-rules)

TypeScript consta entre as linguagens oficialmente disponíveis para o ICA. [Linguagens e ambientes por assessment — CodeSignal](https://support.codesignal.com/hc/en-us/articles/10656138860823-What-languages-environments-are-available-per-certified-assessment)

Por isso, a ordem de prioridade é:

1. praticar na interface oficial da CodeSignal;
2. fazer os dois simulados locais de quatro níveis;
3. resolver exercícios com classes e estado persistente entre chamadas;
4. treinar `Map`, agregação, ordenação e desempate determinístico;
5. fazer uma revisão curta de SQL, sem roubar tempo dos simulados.

## 1. CodeSignal Practice — prioridade máxima

- [Abrir a área oficial de prática](https://app.codesignal.com/assessments/practice)
- [Como funciona o conteúdo de prática](https://support.codesignal.com/hc/en-us/articles/12984563824279-Practice-Content-Overview)

A prática oficial serve para conhecer os tipos de questão e se acostumar ao IDE. Quando há um convite pendente, a opção **Get familiar with the platform** mostra os tipos de questão incluídos naquele assessment; a empresa não vê a atividade nem o desempenho da sessão de prática. [Practice Content Overview — CodeSignal](https://support.codesignal.com/hc/en-us/articles/12984563824279-Practice-Content-Overview)

Durante essa sessão, pratique deliberadamente:

- selecionar TypeScript e localizar os arquivos editáveis;
- executar testes antes de submeter;
- interpretar rapidamente a primeira falha;
- conferir mudanças de arquivos entre níveis pelo recurso **Level changes**, documentado pela própria CodeSignal; [Level diff em questões progressivas](https://support.codesignal.com/hc/en-us/articles/13291037055255-Viewing-changes-between-question-levels-in-progressive-workspace-questions)
- criar casos de teste próprios para depurar. A CodeSignal informa que testes personalizados não afetam a pontuação e que, em questões progressivas, o avanço continua dependendo dos testes padrão. [Custom tests — CodeSignal](https://support.codesignal.com/hc/en-us/articles/8105682814487-Creating-custom-test-cases-for-single-function-questions)

## 2. Exercism TypeScript — melhor alinhamento por habilidade

A trilha oficial de TypeScript oferece exercícios executados contra testes e apresenta atualmente mais de cem exercícios ativos. [Trilha de TypeScript — Exercism](https://exercism.org/tracks/typescript)

Faça nesta ordem:

1. [Grade School](https://exercism.org/tracks/typescript/exercises/grade-school) — cadastrar itens sem duplicidade, agrupar por chave e devolver resultados ordenados. O enunciado exige ordenação por série e por nome, o que o torna um treino direto de `Map`, cópias e desempates.
2. [Tournament](https://exercism.org/tracks/typescript/exercises/tournament) — transformar eventos em estado agregado, calcular contadores e ordenar por pontos em ordem decrescente, com nome em ordem alfabética como desempate.
3. [Robot Simulator](https://exercism.org/tracks/typescript/exercises/robot-simulator) — manter estado mutável coerente entre uma sequência de comandos e testar transições.
4. [Bank Account](https://exercism.org/tracks/typescript/exercises/bank-account) — modelar um objeto com ciclo de vida e operações de abertura, fechamento, depósito e saque.
5. [Clock](https://exercism.org/tracks/typescript/exercises/clock) — praticar normalização, limites e sequências de alterações sobre um objeto.

Meta sugerida: resolva os dois primeiros antes dos demais. Não leia soluções da comunidade antes de concluir sua tentativa e seus testes de borda.

## 3. LeetCode — somente problemas de design/stateful

Ignore, por enquanto, listas amplas de algoritmos. Estes problemas oficiais exercitam uma classe que conserva estado entre chamadas:

1. [Design Underground System](https://leetcode.com/problems/design-underground-system/) — dois conjuntos de estado: viagens em andamento e agregações por rota; exige atualizar e consultar médias.
2. [Design a Food Rating System](https://leetcode.com/problems/design-a-food-rating-system/) — atualização de registros, agrupamento e desempate lexicográfico no maior valor.
3. [Time Based Key-Value Store](https://leetcode.com/problems/time-based-key-value-store/) — múltiplas versões de uma chave por timestamp e consulta da versão mais recente não posterior ao instante pedido.
4. [LRU Cache](https://leetcode.com/problems/lru-cache/) — estado mutável com regra de remoção e restrição explícita de complexidade média `O(1)` para `get` e `put`; é o mais difícil e menos urgente desta lista.

Para o prazo atual, faça no máximo os dois primeiros. Use o terceiro apenas se timestamps forem um ponto fraco; deixe o LRU para depois da avaliação.

## 4. HackerRank SQL — revisão complementar

O domínio oficial de SQL permite filtrar por **Basic Select, Aggregation, Basic Join** e outros subdomínios. [Prática de SQL — HackerRank](https://www.hackerrank.com/domains/sql)

Sequência curta:

1. [Revising the Select Query I](https://www.hackerrank.com/challenges/revising-the-select-query/problem) — `SELECT` e `WHERE`.
2. [Top Earners](https://www.hackerrank.com/challenges/earnings-of-employees/problem) — expressão calculada, máximo e contagem.
3. [African Cities](https://www.hackerrank.com/challenges/african-cities/problem) — `JOIN` por chaves relacionadas e filtro.
4. [New Companies](https://www.hackerrank.com/challenges/the-company/problem) — várias tabelas, contagem distinta e ordenação; faça apenas se os três anteriores estiverem fáceis.

SQL é complementar neste roteiro: não substitua um simulado incremental por uma sessão longa de consultas.

## Roteiro curto até 04/09/2026

### 02/09 — familiarização e primeiro simulado

- 20–30 min: CodeSignal Practice em TypeScript; execute testes, abra a visão de mudanças e crie ao menos um caso de borda.
- 90 min: questão local 1, com cronômetro e sem consultar soluções.
- 30 min: revisar falhas e registrar quais foram de interpretação, modelagem de estado, TypeScript ou testes.
- Se ainda houver energia: Grade School, priorizando correção sobre velocidade.

### 03/09 — segundo simulado e correção dirigida

- 90 min: questão local 2 nas mesmas condições da avaliação.
- 30–45 min: corrigir a solução e testar regressões dos níveis anteriores.
- 45 min: escolher **um** entre Tournament, Design Underground System e Design a Food Rating System, conforme a maior fraqueza observada.
- 25–30 min: os três primeiros exercícios de SQL da lista, ou apenas os dois primeiros se o tempo estiver curto.

### 04/09 — consolidação e avaliação

- 20–30 min no máximo: aquecimento leve com `Map`, `Set`, um comparador de `sort` com desempate e dois casos extremos escritos à mão.
- Se este for o dia do teste real, não faça outro simulado completo. Preserve energia e reserve um bloco contínuo, sem compromissos imediatamente antes ou depois.
- Se o teste real ficar para 05/09, revise apenas a falha mais recorrente dos simulados; evite introduzir um tema novo.

## Checklist de uso dos exercícios

Em cada solução, confira:

- o estado pertence a uma estrutura central e tem uma fonte de verdade clara;
- `Map.get()` inexistente foi tratado explicitamente;
- duplicatas, coleção vazia, identificador ausente e limites foram testados;
- toda ordenação tem critério de desempate determinístico;
- métodos de consulta não expõem arrays internos que possam ser alterados por quem chama;
- a implementação do nível atual ainda passa os testes dos níveis anteriores;
- antes de otimizar, a versão simples e correta está passando.
