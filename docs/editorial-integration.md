# Integração editorial — 9 de setembro de 2026

## Fluxo implementado

O Studio abre a edição em `/studio?section=mine&edit=<slug>`. O autor pode corrigir título, resumo, dificuldade, tags, enunciados, starters e testes visíveis. Salvar preserva um rascunho privado; validar materializa uma nova versão imutável e permite resolvê-la. Solicitar publicação exige consentimento sobre licença/atribuição. Um administrador inspeciona todos os materiais e decide sobre o ID exato da revisão; rejeições exigem justificativa.

A versão publicada continua disponível enquanto outra é editada, validada ou revisada. Submissões e leituras históricas usam `problemId + version`. Reabrir ou corrigir questões privadas/rejeitadas também preserva a versão anterior. Identidade, origem, autoria e licença não são editáveis pelo formulário ou pelo refinamento.

`EditorialRecord.phase` é o estado do rascunho (`draft`, `validating`, `validated`), não o estado da revisão pública. As decisões atualizadas ficam em `EditorialView.reviews`. Uma revisão `validated` já foi materializada: sua próxima edição inicia a versão seguinte.

## Contratos internos

`ProblemEditorial` recebe repositório e validador por injeção. Interface para rotas: `open`, `saveDraft`, `validateDraft`, `submitPublication`, `moderate`.

- `revision` e `expectedRevision` são inteiros não negativos. Cada escrita usa compare-and-set; conflitos não sobrescrevem outra aba.
- `getDraftForRefinement(slug, actor)` retorna `{ revision, problem, bundle }` **somente para uso interno do servidor**.
- `saveGeneratedDraft(slug, actor, { expectedRevision, problem, bundle })` salva um rascunho, não publica nem materializa a versão. O refinamento encaminha para o editor; a validação editorial deve ocorrer antes da resolução dessa nova versão.
- `getPackageVersion(problemId, version, actor?, accessKey?)` autoriza proprietário/admin; terceiros só leem versões publicadas enquanto a questão continua pública, ou versões resolvíveis autorizadas por link não listado. Versão explícita não concede acesso a rascunhos alheios.
- O repositório em memória atualiza seus métodos durante HMR e conserva os mapas existentes. Não é armazenamento durável após encerrar o processo, nem recupera snapshots que já haviam sido descartados por versões antigas do aplicativo.

## Privacidade e spoilers

O DTO padrão contém enunciado, starter, testes visíveis, relatório de validação e decisões. Não contém `JudgeBundle`, chave de acesso, referências ou testes ocultos. A UI exige checkbox de aviso e uma ação separada para solicitar `GET .../editorial?revealSpoilers=true`; somente proprietário/admin são autorizados. O acesso é registrado em `spoilersViewedBy`, nunca restaurado automaticamente como material visível após reload. Requisições que editam materiais privados sem esse opt-in são recusadas. Não há cópia desses materiais em localStorage.

Esse registro possibilita regras futuras de elegibilidade, mas **não implementa por si só exclusão de conquistas ou ranking**. A inspeção administrativa é uma capacidade separada, protegida por papel admin. Todas as respostas editoriais têm `Cache-Control: private, no-store`.

## Banco e operação

Aplicar `supabase/migrations/202609090003_editorial.sql` e `202609090009_private_artifacts.sql` na ordem das migrações. Elas criam o rascunho privado, persistem relatórios e adicionam RPCs transacionais/CAS com execução somente por `service_role`. O adapter e o seed acessam registros/bundles por RPCs públicas restritas, **sem expor o schema `private` no PostgREST/GraphQL**. `read_private_editorial_record` e `read_private_judge_bundle` retornam materiais somente ao servidor; `insert_private_judge_bundle` usa INSERT, nunca UPSERT. A identidade do bundle é conferida, e repetir uma versão existente falha sem sobrescrevê-la.

O seed preserva definições/bundles idênticos, completa somente bundle ausente de uma versão idêntica e recusa conteúdo divergente na mesma versão. Leitura por ID/slug respeita a visibilidade atual do parent antes de consultar artefatos: tornar uma questão privada revoga o acesso mesmo quando seu snapshot histórico ainda tem status publicado. Dono/admin e link não listado válido continuam autorizados. Refinamento é recusado antes de consumir cota quando o rascunho já está em validação.

A validação HTTP local pode ser longa: o formulário oferece consulta após timeout e não repete automaticamente. Locks podem ser retomados após dez minutos; conclusões antigas não sobrescrevem o rascunho mais recente. Um worker durável ainda é necessário antes de depender desse fluxo em hospedagem serverless. O editor cobre questões geradas/importadas persistidas na biblioteca; as três questões seed ainda são conteúdo estático e não são listadas como autoria editável.

## Verificações

- 39 testes Vitest passaram: editorial de domínio, rotas, módulo e descoberta.
- Na rodada final, 35 testes específicos passaram (domínio editorial, rotas e adapter Supabase mockado), incluindo preflight sem consumo de IA, revogação de visibilidade e RPCs sem schema privado exposto. `node --check scripts/seed-supabase.mjs` passou; o seed não foi executado.
- Typecheck do pacote authoring e do app web passaram.
- `tests/e2e/editorial.spec.ts`: quatro cenários mockados de opt-in, conflito, 320px e moderação, preparados para a execução integrada; não chamam IA nem consomem cotas.
- `supabase/tests/database/editorial.test.sql`: 15 verificações pgTAP preparadas (CAS, privilégios e RLS). **Não executadas em Supabase/PostgreSQL real nesta etapa.**
- `supabase/tests/database/private-artifacts.test.sql`: 17 verificações preparadas de RPCs privadas, guards NULL, checksum/relatório e inserção imutável; também pendentes de banco real.

O typecheck web, E2E integrado e validação real da migração devem ser registrados no handoff principal depois que terminarem; testes mockados não comprovam o comportamento do banco remoto.
