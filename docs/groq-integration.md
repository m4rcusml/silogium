# Groq no Silogium

Atualizado em 10/09/2026. Integração disponível para avaliação local; **não é
aprovação de qualidade nem autorização para ligar autoria pública**.

## Configuração e fronteiras

- Único provedor real selecionável: `groq`; modelo fixo `openai/gpt-oss-120b`.
- `local` é um simulador determinístico de desenvolvimento/CI. OpenAI/Codex
  permanecem adapters legados inativos, sem seleção ou fallback automático.
- `GROQ_API_KEY` fica no processo integrado local ou no worker hospedado.
  Nunca no navegador, no CLI distribuído, em `NEXT_PUBLIC_*`, no judge ou no Git.
- `GROQ_WEB_SEARCH_ENABLED=true` habilita pesquisa externa experimental.
  O exemplo de produção mantém false; o arquivo local pessoal está com true.
- A assinatura ChatGPT não é usada. O Silogium não faz upgrade de plano,
  cadastra cartão nem alterna para provedores pagos. O administrador deve manter
  a conta Groq Free; o aplicativo não consulta nem garante o plano de faturamento.
- A chave temporária deve ser substituída no ambiente antes da expiração.

## Geração e revisão

O adapter divide a criação em contrato/enunciado, código e fixtures. Cada fase
concluída tem checkpoint privado no worker. Um marcador de erro de formato pode
ser guardado sem o corpo inválido, evitando repetir uma primeira tentativa já
recusada ao retomar o job.

Questões progressivas fixam classe, parâmetros, métodos e nível de introdução.
São recusados argumentos que não sejam arrays, aridade divergente, métodos
inexistentes/de níveis futuros, nomes duplicados e níveis fora da sequência.
O contrato fica também no bundle privado e volta a ser verificado pelo validador.

O starter final é um template incompleto, não a solução devolvida pelo modelo.
Python usa anotações adiadas para evitar conflitos de nomes como `list` dentro
de classes. Seções de exemplos geradas na definição são removidas; exemplos
finais vêm das fixtures visíveis. Essa organização não substitui revisão semântica
do restante do enunciado.

O judge continua determinístico: schema, identidade, consistência, cobertura por
nível, execução da referência, starter e mutantes. Criação admite **uma correção
após o judge** (código/fixtures, preservando regras e identidade). Há também
**uma correção de JSON por job durável**, sem retry ilimitado de parsing.
Importação/refinamento compartilham as fases; conservam licença/proveniência e
passam pela validação existente. Não há cópia de referência para conteúdo público.

Pacotes recusados não ficam disponíveis para resolver/publicar. Conteúdo público
continua sujeito ao administrador. Nenhuma mudança foi feita na política de
progresso oficial: `accepted` em demo não cria validação oficial.

## Pesquisa

1. Catálogo e metadados disponíveis ao próprio usuário.
2. Exercism, com importação licenciada pelo fluxo existente.
3. Se houver menos de três sugestões e a opção estiver ativa, `browser_search`
   no mesmo modelo Groq; depois uma chamada separada de formatação JSON.

Ferramenta de busca e Structured Outputs **não** são combinados na mesma chamada.
Somente URLs presentes em `executed_tools[].search_results.results` são aceitas.
Links escritos apenas na resposta do modelo não contam como fonte. O formatter
não pode conceder uma licença ou tornar um resultado importável.

A web recebe apenas o pedido atual e a linguagem — não recebe histórico,
enunciados privados, starters, testes ou referências. O cache local de resultados
é separado por usuário, dura 15 minutos e tem no máximo 100 entradas. Os metadados
persistidos por usuário também permitem reaproveitar descobertas entre workers.
Não há cache global de conversas privadas. Uma fonte com URL real ainda pode ter
resumo impreciso: abrir a página original e manter pesquisa web experimental.

## Capacidade e falhas

No worker, a migração `202609100012_groq_capacity.sql` adiciona admissão transacional
compartilhada: uma chamada simultânea, 8.000 tokens/minuto, 200.000 tokens/24h,
30 requests/minuto e 1.000/24h. São limites conservadores desta integração,
não uma consulta ao entitlement da conta. O limite real do provedor pode ser menor.

A reserva estima entrada + saída máxima. A liquidação usa tokens reportados;
uso desconhecido mantém a reserva conservadoramente. O ledger não armazena
prompts, respostas ou chaves. Se o banco falha, não há fallback para limitador
em memória no worker. O limitador de desenvolvimento é apenas por processo;
outros programas/chaves da mesma organização não são observáveis por ele.

Pesquisa pode executar várias ações internas que o modelo não limita rigidamente.
Seu consumo pode exceder a estimativa de uma chamada: contabilizamos o total
retornado e pausamos chamadas posteriores, sem prometer um teto por pesquisa.

- 429: respeita `Retry-After`/reset de tokens; worker devolve à fila com data de
  próxima tentativa, sem consumir uma das três tentativas de falha. Jobs antigos
  não são adiados indefinidamente (janela de admissão de 24h).
- Timeouts/5xx: até três tentativas do worker; o transporte não multiplica retries.
- 401/403/modelo indisponível, contexto excessivo ou saída inválida final: falha
  explícita, sem outro modelo/provedor. Corpos de erro não chegam ao usuário.
- Limites padrão: 90s por chamada, 2 MiB de resposta, aproximadamente 5.000 tokens
  de entrada e até 2.400 de saída. Pedidos/importações grandes são recusados;
  fontes licenciadas **não são truncadas silenciosamente**.
- Cota do usuário: reserva única por job durável; falhas finais de infraestrutura
  devolvem essa reserva de forma idempotente e na data original. Isso não devolve
  tokens à Groq. O fluxo integrado de demo mantém a cota local existente; para
  testar devolução transacional e recuperação após reinício, use o worker/Supabase.
- Sem worker, o desenvolvimento integrado espera até dez minutos por fase para
  capacidade; reiniciar o processo perde jobs em memória. Produção não usa isso.

Como em qualquer API externa sem idempotência de geração, morrer entre a resposta
e o checkpoint pode repetir uma chamada. Não prometemos exactly-once do provedor.
O commit dos efeitos continua atômico, sem duplicação de questão.

## Verificação e operação

Testes determinísticos:

```text
npm run typecheck
npm test -- --maxWorkers=2
npx playwright test tests/e2e/studio-orientation.spec.ts tests/e2e/authoring-discovery.spec.ts --workers=1
npm run test:db
```

O último comando requer PostgreSQL/Supabase local; mocks de RPC **não comprovam**
as transações/RLS. O teste SQL novo cobre acesso, reserva compartilhada,
liquidação idempotente, deferral, fencing e devolução de cota.

Smoke real opt-in:

```text
node --env-file=apps/web/.env.local --import tsx scripts/evaluate-groq.ts --generate=classic-ts
node --env-file=apps/web/.env.local --import tsx scripts/evaluate-groq.ts --generate=progressive-py
node --env-file=apps/web/.env.local --import tsx scripts/evaluate-groq.ts --search="questões de anagramas em TypeScript"
```

Saídas ficam em `.silogium/groq-evaluations/*.private.json`, fora do Git. Geração
não executa o código. Depois de **revisar** o código, use
`npm run test:groq -- --trusted-validate=<arquivo>` no ambiente de desenvolvimento.
O runner local é subprocesso, não sandbox de segurança. `--repair=<arquivo>`
aceita `--diagnostics=<relatório JSON>`; não executa código nem publica questões.

### Evidência e limitações desta implementação

Verificação final local desta revisão:

- `npm run typecheck`: todos os workspaces aprovados.
- `npx vitest run --maxWorkers=2`: **522 testes / 49 arquivos aprovados**.
- Playwright no recorte Studio/discovery: **38 testes desktop/mobile aprovados**.
- Build web Next e CLI aprovados com `NEXT_DIST_DIR=.next-build`, sem interromper
  o servidor do usuário; proteção contra fallback demo em produção aprovada.
- Regressão de build cobre o minificador SWC: crases escapadas em templates
  produziam JavaScript inválido, então as cercas Markdown usam strings comuns.
- Varredura de segredos em 379 arquivos do repositório e 71 arquivos públicos do
  build: nenhuma ocorrência das chaves locais nem dos padrões de chave privada.
- PostgreSQL/pgTAP e execução Modal real **não executados neste ambiente**.

As chamadas reais da conta Free responderam 200 tanto na criação por fases quanto
na busca. Foram observados também 400 `json_validate_failed`, gabarito incorreto,
espaço indevido em saída esperada, starter que resolvia a questão e conflito de
anotação Python. O judge recusou os pacotes defeituosos. Os templates e a correção
limitada foram adicionados com base nesses resultados. Houve pacotes clássicos e
progressivos aprovados pelo judge durante a iteração, mas isso **não constitui
taxa de sucesso de um benchmark fixo**.

A busca real encontrou a URL de Anagram do Exercism, sem conceder licença. Um
resumo saiu em inglês e com detalhes que exigem conferência na fonte; a instrução
de PT-BR foi reforçada. Não considerar URL verificada como prova de todo o resumo.

Uma checagem adicional, sem IA, construiu oráculos a partir dos dois contratos
fixados no smoke: soma de pares e CounterStore. As quatro referências selecionadas
passaram em **64 casos independentes** (20 por clássica TS/Python e 12 por
progressiva TS/Python, incluindo prefixos, ausência, zero, remoção e sobrescrita).
Isso avalia essas referências, não a fidelidade de qualquer questão futura. A
clássica Python, por exemplo, tinha referência correta nesses casos, mas foi
recusada pelo pacote original por um espaço inicial indevido em uma saída esperada.
Esse pacote permanece não aprovado; não corrigimos o gabarito à revelia do judge.

Antes de ativar produção ainda falta:

- Aplicar migrações até 012 e executar pgTAP/concorrência/recuperação no banco real.
- Rodar o worker com Modal e verificar limites/isolamento reais.
- Benchmark cego de pelo menos 40 pedidos variados (10 por célula:
  clássico/progressivo × TypeScript/Python), com oráculos independentes e revisão
  de enunciado, starter, licença e limites; meta proposta 80% na primeira tentativa
  e 90% após uma correção, **ainda não comprovada**.
- Ampliar avaliação de relevância/fidelidade dos resumos de pesquisa e observar
  consumo real da organização. Até lá, busca é opt-in experimental.
- Tratar pacotes cujo contexto excede o orçamento por edição manual ou uma futura
  estratégia de conversão segmentada auditável; não remover arquivos da licença.

Mantenha `SILOGIUM_AUTHORING_ENABLED=false` em produção até concluir esses gates.

Referências oficiais consultadas: [Structured Outputs](https://console.groq.com/docs/structured-outputs),
[browser search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search),
[limites](https://console.groq.com/docs/rate-limits) e
[faturamento](https://console.groq.com/docs/billing-faqs).
