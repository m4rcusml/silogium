# Silogium — plano de gamificação

Data: 9 de setembro de 2026. Status: **MVP pessoal implementado, integração real pendente**.

Atualização: metas semanais opt-in, fusos, quatro conquistas, evidência do servidor e projeções idempotentes estão implementados. Perfil e Praticar exibem controles; demo/legado permanecem não verificados. Reconhecimento oficial depende de Supabase, Modal e política de judge explicitamente auditada. Não foram implementados XP, rating, ranking, loja nem reconhecimento público de atividade. O perfil compartilhado expõe somente apresentação. Veja `practice-history-implementation.md` e `platform-completion-plan.md` para o estado atual; as seções abaixo preservam a pesquisa e proposta originais, não comprovam integração de produção.

## Decisão recomendada

Começar com **progresso verificável, meta semanal flexível e poucas conquistas**. Integrar tudo em Praticar, na resolução e no perfil. Não criar uma tela de recompensas, moedas, loja, ligas ou ranking global no MVP.

O objeto central continua sendo a questão. A gamificação deve ajudar a escolher o próximo exercício e perceber aprendizado, não incentivar gerar questões fáceis com IA ou enviar a mesma solução repetidamente.

Separar três conceitos desde o início:

| Eixo | O que comunica | Recomendação |
| --- | --- | --- |
| Prática | O que a pessoa concluiu e em quais temas/linguagens | MVP; pessoal por padrão |
| Contribuição | Autoria/revisões úteis aprovadas por outras pessoas | Etapa posterior; não somar a habilidade |
| Competição | Desempenho relativo em uma prova comum, com regras próprias | Futuro; rating separado de XP |

## O que a pesquisa sustenta

- **Codewars** distingue rank, obtido resolvendo kata, de honor, relacionado a atividade e contribuição. O rank geral conta a primeira resolução de cada kata; repetir em outra linguagem alimenta o rank daquela linguagem. Aproveitar a separação dos eixos e a deduplicação, sem copiar a escala de kyu/dan. [Rewards and Progress](https://docs.codewars.com/gamification/), [Ranks](https://docs.codewars.com/gamification/ranks/).
- **Exercism** combina resolução com mentoria e usa reputação para reconhecer contribuição à plataforma/comunidade. Sua lista oficial inclui conquistas por completar exercícios, explorar linguagens e iterar com um mentor; conquistas de conclusão de trilha não são retiradas quando a trilha cresce. Aproveitar marcos concretos e preservar realizações históricas. [Getting Started](https://exercism.org/docs/using/getting-started), [Reputation](https://exercism.org/docs/using/product/reputation), [lista oficial de badges](https://forum.exercism.org/t/the-official-list-of-exercism-badges/3025).
- **LeetCode** oferece desafio diário e badge por completar o conjunto mensal; também possui badges baseados no rating de concursos. O desafio diário usa UTC e admite recuperação por tickets. Aproveitar a legibilidade de metas e a separação da competição; para o Silogium, propor fuso local e semanas flexíveis sem mecanismo de comprar a recuperação de uma sequência. [Daily LeetCoding Challenge](https://leetcode.com/discuss/post/655704/september-leetcoding-challenge-and-the-badge/), [anúncio oficial dos contest badges](https://leetcode.com/discuss/post/934706/the-new-contest-badge-is-here/).
- **Evidência experimental não autoriza prometer mais aprendizado por adicionar pontos.** Mekler et al. encontraram aumento de quantidade produzida em uma tarefa de anotação de imagens, sem mudança significativa em motivação intrínseca ou competência percebida. Isso não é um experimento com alunos do Silogium nem demonstra melhora na qualidade das soluções. [Artigo de 2017, repositório da Universidade de Basileia](https://edoc.unibas.ch/entities/publication/ccec8ccc-aa54-417d-b205-334b518d6eed).
- Sailer et al. observaram efeitos diferentes de grupos de elementos de jogo sobre necessidades psicológicas em uma simulação. A combinação de badges, placar e gráficos favoreceu competência percebida; o estudo não isola o efeito de cada elemento nem prova resultados em aprendizagem de programação. **Inferência de produto:** testar feedback claro e autonomia antes de acrescentar competição. [Artigo dos autores, 2017](https://www.researchgate.net/profile/Michael-Sailer-2/publication/311879391_How_gamification_motivates_An_experimental_study_of_the_effects_of_specific_game_design_elements_on_psychological_need_satisfaction/links/5874ebdc08ae329d62202795/How-gamification-motivates-An-experimental-study-of-the-effects-of-specific-game-design-elements-on-psychological-need-satisfaction.pdf).

As regras abaixo são propostas do Silogium, não práticas atribuídas às fontes nem resultados já medidos.

## MVP sem novas telas

### Praticar

- Manter a lista como área principal. Inserir uma faixa compacta: “Nesta semana: 2 de 3 dias com progresso” e uma ação “Ajustar meta”. O formulário abre inline ou em diálogo pequeno.
- Continuar mostrando `Não iniciada`, `Em progresso` e `Resolvida`; distinguir “Resolvida na v1” de “v2 disponível”, sem apagar o feito anterior.
- Sugerir uma próxima questão pela coleção e pelos filtros escolhidos, explicando o motivo: “Continue sua prática de mapas”. Não chamar esse dado de domínio ou proficiência.
- Nada de bloquear exercícios porque faltam pontos ou porque a pessoa não cumpriu a meta.

### Resolução

- Após um resultado oficial, manter veredito, erro e próximos passos em primeiro plano. Usar uma linha discreta para um marco novo: “Primeira conclusão desta questão”.
- Em questões progressivas, reconhecer avanço por estágio somente quando confirmado pelo judge oficial; quatro níveis pertencem a uma questão, não contam como quatro questões resolvidas.
- Reexecução pode continuar sendo valiosa para aprender, mas não gera novos pontos por repetição.
- Nenhum modal de celebração que cubra o resultado; sem som, confete automático ou perda do foco do editor.

### Perfil

- Resumo de questões distintas resolvidas, prática por linguagem e temas, meta semanal e conquistas. Mostrar a regra de cada contador no próprio contexto.
- Histórico simples de semanas, com alternativa textual ao calendário colorido. Não publicar horários detalhados de estudo.
- Conquistas discretas, com título, critério e data; não uma grade enorme de cadeados.
- Configurações de meta, fuso e compartilhamento na própria página. Privacidade independente da visibilidade das questões.

### Primeiras conquistas propostas

| Conquista | Regra objetiva | Limite |
| --- | --- | --- |
| Primeira solução | Primeira submissão oficial completa aceita | Uma por conta |
| Etapa por etapa | Concluir todos os estágios de uma questão progressiva | Uma por conta; não um badge por estágio |
| Duas linguagens | Uma conclusão em TypeScript e uma em Python | Uma por conta; pode ser a mesma questão |
| Repertório em construção | Concluir cinco questões canônicas distintas do catálogo revisado | Uma por conta |

Os limiares são hipóteses de design. A pessoa pode ocultar conquistas sem perder acesso a funcionalidades. O MVP não concede privilégios administrativos por acúmulo de badges.

## Meta semanal e continuidade

- Opt-in: sugerir três dias com progresso por semana; permitir escolher de um a sete ou desligar a meta. Esses valores não são uma recomendação científica de carga de estudo.
- Um dia com progresso exige ao menos um novo marco oficial no escopo pessoal: primeira conclusão de uma questão por linguagem, ou primeiro estágio confirmado naquele par questão/linguagem. Vários marcos no mesmo dia contam como um dia.
- `run`, testes próprios, abertura de página, geração de questão e repetição de um marco já obtido não contam. Questões privadas podem contar na meta **pessoal**, sem gerar prestígio público.
- Semana começa na segunda-feira, no fuso IANA escolhido. Guardar o fuso e a meta vigentes na abertura da semana; alterações valem para a próxima. Não reagrupar retroativamente eventos para aumentar a meta.
- Sem perda de conquistas, pontos negativos ou mensagens de culpa quando uma semana não é cumprida. Preferir “Você praticou em 2 dias” a “Você perdeu sua sequência”. Sem obrigação de continuidade diária.
- A meta mede novos resultados confirmados, não todo esforço de estudo. Deixar isso explícito; não insinuar que uma sessão de investigação sem aceitação foi inútil.

## Elegibilidade, justiça e prevenção de acúmulo artificial

### Fonte de verdade

Somente o backend, após finalizar e persistir uma execução oficial, produz eventos de progresso. O browser e a CLI recebem o mesmo tratamento. `silogium test` local continua ilimitado, mas não comprova conclusão oficial. O cliente nunca envia o total de XP ou declara que passou em um estágio.

Registrar também o nível de confiança do resultado: uma execução demo ou com bundle incompleto/apenas público não é equivalente a avaliação oficial revisada. Recompensas públicas exigem bundle aprovado e executor de confiança; resultados locais continuam no histórico pessoal com rótulo correspondente. Não usar apenas `kind: submission` como prova dessa elegibilidade.

O judge continua determinístico. IA pode produzir explicações e questões; não decide pontos, badges, vereditos ou suspeitas de fraude.

### Regras mensuráveis

1. **Repetição/concurrency:** chave única por usuário + questão canônica + marco + linguagem quando aplicável. Dois envios simultâneos aceitos produzem um marco. Reentrega de evento não repete recompensa.
2. **Clássica:** concluída apenas com uma submissão completa aceita. Passar só nos exemplos não basta.
3. **Progressiva:** concluída apenas quando uma mesma submissão passa em todos os estágios da versão. Avanço parcial usa a confirmação interna do judge, não a soma de percentuais inferida no cliente. Não combinar soluções incompatíveis de envios diferentes para declarar conclusão total.
4. **Versionamento:** guardar versão e política de judge como evidência. Nova versão não renova o orçamento de recompensa da mesma questão. Manter “concluída na v1” e oferecer atualização como prática. Renumerar estágios não concede novos marcos; mapear unidades estáveis de aprendizagem na revisão ou, na dúvida, não premiar o estágio novo.
5. **Linguagens:** o total de questões distintas aumenta uma vez por questão; o progresso TypeScript/Python pode reconhecer cada linguagem uma vez. Trocar a versão do runtime não cria uma nova linguagem.
6. **Origem:** `native` e `licensed_import` podem ter o mesmo valor após revisão. `external_link` não tem execução oficial no Silogium, portanto não gera conquista de resolução.
7. **Autoria e IA:** gerar/publicar a própria questão não concede XP de resolução. Questões próprias ou solicitadas à IA podem entrar no histórico pessoal, mas ficam fora de recompensas públicas e futuro rating. Uma importação canônica descoberta por alguém não torna essa pessoa autora.
8. **Privadas/não listadas:** registrar aprendizado pessoal, sem pontos públicos, badges públicos derivados ou vazamento de título, tags e contagens desses exercícios. Publicar depois não deve disparar recompensas retroativas automaticamente; eventual migração exige regra explícita e auditada.
9. **Duplicatas:** deduplicar por identidade canônica e origem; fingerprint ajuda a encontrar cópias exatas, não prova equivalência semântica. Moderação pode unir variantes; o recálculo usa eventos de correção, preservando o histórico de decisões.
10. **Cópia/assistência:** aceitar que código aceito não prova autoria independente. Não alegar detecção confiável de IA, não proibir colar código nem punir similaridade isolada. Histórico de prática pode ter declaração voluntária “com ajuda”, sem tratar isso como evidência de fiscalização. Competição futura exige regras próprias, fiscalização proporcional e recurso.
11. **Falhas e retirada:** `system_error` não concede nem remove progresso. Falha posterior normal não revoga uma conclusão anterior. Teste inválido, duplicata ou fraude confirmada usa correção auditada; questão retirada mantém a conquista histórica pessoal, com indicação de indisponibilidade. Publicidade deve respeitar a nova visibilidade.
12. **Soluções de referência/testes:** contas de autoria, validação e smoke tests não participam das recompensas públicas. Nunca incluir referência, código enviado ou metadados de testes ocultos no evento exibido ao usuário.

## XP e rating: depois, e separados

Não lançar XP antes de histórico durável, idempotência e catálogo com dificuldade revisada. Uma hipótese para experimento posterior seria orçamento fixo de 20/40/60 XP por questão fácil/média/difícil, **uma vez por questão**, não por envio nem por linguagem. Em progressivas, repartir esse orçamento por unidades estáveis aprovadas; o total não multiplica pelo número de níveis. Esses números são apenas um ponto de partida, sem evidência de balanceamento no Silogium.

Se houver XP, chamá-lo de experiência de prática, nunca de competência certificada. Não vender multiplicadores, não dar XP por gerar conteúdo ou usar a IA e não usar tempo bruto de execução como mérito — infraestrutura e linguagens não são diretamente comparáveis.

Um rating competitivo futuro dependerá de concursos opt-in, conjunto comum de questões revisadas, janela temporal, regras sobre assistência e isolamento confiável. Não derivar rating do catálogo livre, de questões privadas criadas pela própria pessoa ou da soma de XP. Adiar leaderboard até existir população e integridade suficientes para a comparação ser útil.

## Contrato técnico proposto

O código atual já versiona questões e registra vereditos; a listagem de atividade é limitada a 100 itens, e o modo sem Supabase usa memória de processo. Isso **não serve como histórico permanente de conquistas**. Antes do MVP, criar projeções duráveis a partir de toda a história, sem atribuir zeros quando faltarem dados. Referências locais: `packages/core/src/schemas.ts`, `apps/web/lib/executions.ts` e `docs/frontend-ux-handoff.md`.

Modelo sugerido, ainda não implementado:

| Registro | Campos essenciais / restrição |
| --- | --- |
| `practice_events` | `id`, `user_id`, `submission_id`, `problem_id`, `canonical_problem_id`, `problem_version`, `runtime`, `event_type`, `unit_id`, `occurred_at`, `policy_version`, `eligibility_snapshot` (inclui confiança do judge/bundle); deduplicação por evento de origem |
| `problem_completions` | Projeção privada: usuário + questão + versão + linguagem; primeira evidência completa e data |
| `practice_milestones` | Usuário + identidade canônica + marco estável + linguagem; chave única independente da versão da política, para evitar premiação duplicada após deploy |
| `achievement_definitions` | Identificador, versão, critério público, rótulo e regra de elegibilidade |
| `user_achievements` | Usuário + conquista; evidência privada, data, estado/correção; exibição pública somente por projeção autorizada |
| `practice_preferences` | Meta semanal, fuso, participação, compartilhamento; RLS do proprietário |
| `weekly_progress` | Usuário + início da semana; meta/fuso congelados e dias com marcos; projeção recalculável |

Eventos de domínio mínimos: `submission.finalized`, `practice.stage_first_completed`, `practice.problem_first_completed`, `achievement.awarded` e `practice.award_corrected`. Os nomes são proposta. O evento de submissão precisa carregar escopo avaliado e confirmação confiável de todos os estágios, além da versão do bundle; não basta reaproveitar somente o resultado público sanitizado.

Persistir a submissão e uma outbox na mesma transação. Consumidor idempotente deriva marcos e projeções; falha da gamificação não muda o veredito nem força reenviar código. Exibir “Progresso atualizando” se necessário. Recálculo/backfill deve ser reexecutável, paginado e sem disparar notificações antigas.

No modo demo, manter rótulo explícito “atividade desta sessão” e não prometer conquistas permanentes. Nunca publicar totais construídos a partir desse armazenamento efêmero como histórico definitivo.

## Privacidade e acessibilidade

- Perfil de aprendizagem privado por padrão; compartilhamento opt-in só de agregados elegíveis. A página pública não consulta diretamente o ledger privado. RLS e projeções públicas precisam de testes separados.
- Questões privadas não podem ser inferidas por URLs, títulos, filtros, contagens ou conquistas públicas. Mudanças de visibilidade invalidam caches públicos; agregados pessoais continuam privados.
- Não expor código, prompts, tokens CLI ou horários precisos. Estabelecer retenção, exclusão da conta e remoção de dados das projeções antes da publicação.
- Indicadores com texto e ícone além de cor; contraste do tema escuro, teclado, foco visível e anúncios não invasivos. Calendário com resumo/lista equivalente; sem interações só por hover.
- Preferência para ocultar gamificação e reduzir movimento. A leitura do enunciado, terminal, judge e catálogo permanece completa sem ela.

## Ordem de implementação

1. **Fundação:** fonte durável, migração do histórico, identidade canônica, escopo do judge, outbox, RLS e idempotência. Explicitar limites de dados demo e de testes públicos.
2. **MVP:** progresso por questão/linguagem, meta semanal opt-in e quatro conquistas propostas, integrados às três telas existentes. Sem XP/ranking.
3. **Validar:** entrevistas e observação de uso; medir retorno voluntário, diversidade de questões e conclusão de novos desafios. Acompanhar envio repetitivo, desconforto relatado e abandono, não só volume de submissões.
4. **Expandir com evidência:** coleções com metas, revisão voluntária de questões e reconhecimento de contribuição aprovada. Considerar XP apenas se ajudar entendimento/continuidade sem incentivar volume vazio.
5. **Competição opcional:** projeto separado com regras, integridade, privacidade e rating próprios; não pré-requisito da experiência de prática.

## Critérios de aceite antes de ativar

- Dois envios aceitos simultâneos e reentrega de eventos concedem um único marco.
- Repetir em outra linguagem altera seu agregado, mas não duplica questões distintas ou futuro XP global.
- `run`, testes próprios, envios locais não oficiais, referências e `system_error` não concedem recompensas públicas.
- Uma progressiva parcialmente correta permanece incompleta; aceitação de uma versão antiga não desaparece após atualização.
- Editar/renumerar/publicar novamente uma questão não gera novo orçamento de recompensa.
- Código/resultado do judge, horário e identidade enviados pelo cliente não podem forjar eventos.
- Acesso cruzado entre contas e usuário anônimo não revela atividade privada, nem por agregados ou badges.
- Meta semanal trata fusos, virada de semana e mudanças de preferência sem duplicar dias; semana não cumprida não retira conquistas.
- Backfill acima de 100 submissões, replay e reinício do servidor preservam os mesmos totais em modo persistente; demo é explicitamente temporário.
- Browser e CLI produzem o mesmo progresso; processamento atrasado não incentiva nova submissão.
- Toda conquista informa seu critério e evidência permitida; ocultá-la não impede resolver exercícios.
- Testes de teclado, leitor de tela, 320 px e movimento reduzido confirmam que os novos indicadores não escondem conteúdo nem ações.

**Próxima decisão de produto:** aprovar este MVP de progresso + metas flexíveis + conquistas, mantendo XP e competição para uma segunda etapa. Nada deste documento adiciona pontuação ou recompensas à aplicação atual.
