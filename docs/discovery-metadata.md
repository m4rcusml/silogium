# Descoberta de questões e confirmação antes de criar

O Studio reaproveita metadados de questões resolvíveis e de links já encontrados para recomendar desafios pertinentes. A comparação inicial é determinística: não precisa chamar a IA, gerar embeddings nem consultar a web.

## Experiência no Studio

Ao enviar um pedido no modo **Criar**:

1. O servidor salva o pedido completo e analisa o acervo que o usuário pode consultar.
2. Se encontrar questões relacionadas, retorna `needs_confirmation` com até cinco sugestões. A IA ainda não criou a questão, e a análise não consome a cota de operações de IA.
3. O Studio mostra título, resumo, fonte, conceitos/habilidades e motivos da recomendação, além do **pedido analisado**: texto, linguagem, formato, dificuldade e visibilidade.
4. O usuário pode abrir uma questão existente, escolher **Ajustar pedido** ou confirmar **Criar nova mesmo assim**.
5. Somente a confirmação autoriza a geração nesse fluxo. O pedido segue para criação e validação normais. Se a análise não encontrar sugestões, segue diretamente para esse processamento.

Uma questão local apresenta **Resolver**. Um link externo apresenta **Ver na fonte**, abre uma nova aba e nunca direciona ao judge local. Ter metadados associados ao link não o transforma em questão importada.

No modo **Pesquisar**, os resultados do catálogo, das fontes licenciadas e da busca na web também mostram metadados e motivos quando disponíveis. Links encontrados são guardados no histórico de descoberta daquele usuário e podem ajudar em pedidos futuros.

## O que é armazenado

`ProblemDefinition.metadata` é opcional para compatibilidade com as questões anteriores. O formato `DiscoveryMetadata` versão 1 contém:

| Campo | Conteúdo |
| --- | --- |
| `concepts` | Estruturas de dados e técnicas, como `priority-queue`, `bfs` e `hash-map`. |
| `skills` | Habilidades, como validação, gerenciamento de estado e histórico. |
| `topics` | Domínio do desafio, como atendimento, logística e reservas. |
| `keywords` | Termos descritivos normalizados, sem palavras genéricas de pedido. |
| `runtimes` | Linguagens disponíveis. |
| `format` | `classic`, `progressive` ou `unknown`. |
| `difficulty` | `easy`, `medium`, `hard` ou `unknown`. |
| `inferred` | Sempre `true`: classificação inferida, não garantia de equivalência. |

Os metadados de questões locais são derivados de título, resumo, tags e enunciados de níveis. Nas novas criações, importações e revisões, acompanham a definição da questão. Definições antigas recebem enriquecimento ao serem lidas, sem reescrever enunciados, versões ou submissões históricas.

Para links externos, a classificação usa título, resumo e pistas descritivas permitidas. A URL identifica a fonte, não é tomada como prova do conteúdo. Não baixa enunciados externos para indexá-los. A URL canônica remove fragmentos e parâmetros de rastreamento, preservando caminho e parâmetros que podem identificar uma questão. A chave de deduplicação é **usuário + URL canônica + linguagem**; o link mantém sua fonte e data de obtenção.

## Escopo e privacidade

O acervo de descoberta combina:

- Questões públicas já publicadas.
- Questões do próprio usuário em estado resolvível (`validated`, `pending_review` ou `published`), incluindo privadas e não listadas.
- Links externos previamente encontrados por esse mesmo usuário.

Ser administrador não amplia o acervo de recomendações para incluir as questões privadas de outras pessoas. O acesso editorial continua separado da descoberta pessoal. Rascunhos e questões rejeitadas não são oferecidos como desafios prontos para resolver.

**Somente campos de descrição da questão entram no índice e no contexto de descoberta.** “Campos públicos” aqui significa o formato de conteúdo que pode ser apresentado ao usuário autorizado, não que uma questão privada se torne pública. Não são usados testes ocultos, respostas esperadas privadas, soluções de referência, tokens ou código de submissões.

Os adapters de IA recebem um contexto reduzido com título, URL, tipo, fonte e metadados de até cinco candidatos autorizados. Isso permite orientar conceitos e evitar recriar desafios já conhecidos, sem transportar o pacote privado do judge. Esse contexto é tratado como dados não confiáveis, nunca como instruções; a IA é orientada a não copiar enunciados, títulos, soluções ou identidade de questões existentes.

Criação clássica e progressiva, pelo Codex ou OpenAI, usam o mesmo contexto reduzido. A busca recebe esse contexto para encontrar outras opções e produz resumos originais com conceitos descritos pela fonte. No adapter OpenAI, URLs estruturadas também precisam aparecer entre as fontes retornadas pela ferramenta de pesquisa; o conteúdo gerado não declara licenças. As instruções separam dados recuperados do pedido e usam um contrato de saída estruturada, conforme as orientações oficiais de [contexto e delimitação](https://developers.openai.com/api/docs/guides/prompt-engineering) e [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Busca relacionada não é prova de duplicidade

A classificação atual é uma heurística com vocabulário de conceitos e sinônimos em português e inglês. Compara conceitos, habilidades, tema e palavras relevantes; formato e dificuldade apenas refinam a classificação após uma correspondência de conteúdo. A linguagem filtra os candidatos.

O score interno de relevância não é uma probabilidade nem uma nota de qualidade e não aparece como porcentagem na interface. O usuário vê motivos compreensíveis, como conceitos em comum ou tema próximo.

Limitações atuais:

- O gate de criação conhece o catálogo acessível e os links já guardados; **não pesquisa a internet antes de pedir confirmação**.
- Sem sugestões não significa que a questão é inédita no mundo. Conceitos não cobertos pela taxonomia ou resumos curtos podem produzir falsos negativos.
- Compartilhar um tema ou uma estrutura de dados não significa ter o mesmo enunciado. As sugestões são opcionais, não um bloqueio editorial por duplicidade.
- Não há embeddings, banco vetorial, crawler contínuo nem catálogo externo completo nesta implementação.
- A análise não verifica se links antigos continuam disponíveis. A data de obtenção registra quando foram encontrados, não uma auditoria permanente.
- O Codex devolve links em JSON, mas o contrato atual do seu runner não fornece citações por URL para conferência independente. Esses links são sugestões não verificadas: podem exigir correção ou estar indisponíveis. Não herdam a verificação de licença do conector Exercism. O adapter OpenAI cruza URLs com fontes da ferramenta, o que também não garante que a página estará disponível no futuro.
- O ranking trabalha sobre o acervo recuperado pelo servidor. Para volume elevado, será necessário medir consultas e evoluir a recuperação; esta versão não implementa um índice semântico distribuído.

## Confirmação, recuperação e cotas

`POST /api/v1/authoring` continua retornando `{ jobId }`. Um job que aguarda confirmação contém:

```ts
{
  status: "needs_confirmation",
  request: { mode: "create", prompt, runtime, format, difficulty, visibility },
  result: { kind: "recommendations", candidates }
}
```

`POST /api/v1/jobs/{id}/confirm` **não recebe corpo**. O servidor usa o snapshot persistido do pedido original, verifica o proprietário e faz uma transição atômica para processamento. Repetir a confirmação de um job já iniciado/concluído retorna o mesmo `jobId`, sem iniciar outra geração.

Alterar o formulário não modifica esse snapshot. A interface avisa que confirmar mantém o pedido analisado; enviar o formulário de novo cria um novo pedido. **Ajustar pedido** restaura os campos analisados e limpa a recomendação local. Pedidos de publicação exigem novo aceite explícito de licença ao serem reenviados; a confirmação do job usa o pedido cujo aceite já foi validado na entrada.

O navegador guarda somente identificador do job, modo e horário de início em uma chave de `localStorage` associada ao usuário. Ao recarregar, consulta o servidor e recupera inclusive a confirmação pendente, sem reenviar o pedido ou confirmar automaticamente. Texto, metadados e candidatas não são duplicados nesse armazenamento de recuperação.

Falhas e timeout de confirmação preservam o job e oferecem consulta do mesmo pedido. Respostas tardias de um job descartado não podem substituir o novo estado da tela. O servidor garante a idempotência; o botão também impede confirmações simultâneas na mesma tela.

A cota de IA é verificada quando o processamento realmente avança para a operação de busca/criação, não ao mostrar a recomendação inicial. Falha terminal de um job não é repetida silenciosamente: o usuário precisa iniciar outro pedido. As cotas e os resultados do judge continuam separados deste mecanismo.

## Fontes e licenças

Metadados inferidos não concedem licença, não atribuem autoria ao solicitante e não autorizam importar conteúdo. Links sem licença confirmada permanecem `external_link`, sem starter, testes ou página de resolução local.

O conector licenciado continua responsável por validar a origem, manter licença/atribuição e executar a conversão e validação antes de liberar uma importação. As sugestões não pulam esse fluxo. Questões publicadas continuam sujeitas à revisão editorial existente.

## Persistência e migração

A migração `supabase/migrations/202609090001_discovery_metadata.sql` acrescenta:

- Estado `needs_confirmation` aos jobs.
- Tabela `external_problem_candidates`, indexada por usuário e data.
- Unicidade por usuário/URL canônica/linguagem e validações do formato do candidato.
- RLS para leitura apenas pelo proprietário; escritas são restritas ao backend, para que um cliente não possa inventar licença ou origem confiável.
- Escrita em `ai_jobs` restrita ao backend: um cliente não pode inserir um snapshot falso em `needs_confirmation` e contornar a validação/aceite da rota inicial. A confirmação também revalida o schema do snapshot.

Os metadados de questões permanecem versionados no JSON de `problem_versions.definition`; não há backfill destrutivo.

**A migração foi preparada no repositório, mas não aplicada a uma instância Supabase neste trabalho.** Ambientes com Supabase configurado precisam aplicá-la pelo processo habitual de migrações antes de usar a descoberta. O backend apresenta um erro específico quando identifica a estrutura ausente. Não é necessário fornecer secrets ao cliente.

No modo local sem Supabase, a persistência continua em memória: jobs, questões geradas e links recuperados são perdidos ao reiniciar o processo. Recarregar somente a página mantém os dados enquanto o servidor permanece ativo.

## Pontos de implementação

- `packages/core/src/discovery.ts`: normalização, taxonomia, classificação e URLs canônicas.
- `packages/authoring/src/discovery.ts`: recuperação autorizada e contexto reduzido da IA.
- `packages/authoring/src/module.ts`: gate, confirmação e processamento.
- `apps/web/components/use-studio-job.ts`: polling, recuperação e confirmação segura.
- `apps/web/components/similar-problems.tsx`: snapshot e sugestões inline.
- `tests/e2e/authoring-discovery.spec.ts`: cenários mockados de confirmação, recuperação, links e layout móvel, sem chamadas reais de IA.

Esta documentação descreve o comportamento implementado. Resultados de execução dos testes e validação de infraestrutura devem ser registrados no handoff do trabalho; a presença dos testes não prova que RLS foi executada contra uma instância real.
