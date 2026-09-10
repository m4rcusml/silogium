# Feedback após a submissão — 10/09/2026

## Decisões de experiência

- Uma submissão completa aceita abre uma confirmação na própria tela: título da questão, linguagem e versão, pontos, testes aprovados e duração total. Questões progressivas também mostram cada nível concluído.
- A confirmação oferece **Ver resultado**, **Continuar editando** e **Escolher outra questão**. Não existe redirecionamento automático nem alteração do código.
- A abertura automática acontece apenas na primeira conclusão por linguagem durante a visita à questão/versão. Reenvios aprovados atualizam o resultado; **Ver conclusão** permite reabrir a confirmação. Uma nova visita pode mostrar a confirmação novamente: não é um registro de “primeira solução da conta”.
- Depois de fechar a janela, o resumo permanece no resultado daquele envio. Executar novamente ou trocar a linguagem substitui o resultado exibido, sem alterar o histórico.
- Executar testes visíveis não conclui a questão: o feedback oferece avançar ao próximo nível ou submeter. Testes próprios e casos isolados são descritos explicitamente como avaliações parciais.
- Dialog nativo com ciclo explícito de Tab/Shift+Tab, Escape e fechamento explícito. O foco inicial fica no título sem rolar o conteúdo; funciona também em telas baixas. Ctrl/Meta+Enter não aciona botões nem links da confirmação e os atalhos de execução não funcionam atrás de dialogs abertos. Ver resultado devolve o foco ao painel; continuar editando devolve ao editor (ou ao painel de código se o Monaco ainda estiver carregando). Escape não encerra o modo foco por trás da confirmação. O terminal não pode ser aberto enquanto uma avaliação está em andamento.
- Tema existente, margens de 20–28 px, espaçamento entre blocos e bordas arredondadas. Entrada discreta de 160 ms, desativada com `prefers-reduced-motion`. Sem confetes, sons ou telas adicionais.

## Limites e contrato

`getSubmissionOutcome` recebe a definição, um snapshot tipado do pedido e a resposta. Conclusão visual exige `submission`, escopo completo, `accepted`, todos os casos aprovados, cobertura de todos os níveis e pontuação consistente com a definição. Respostas vazias, incoerentes, parciais ou com erro não geram confirmação. O cliente não conhece o inventário privado de testes e não pode provar sua integridade; isso continua sendo responsabilidade do judge.

“Questão resolvida” descreve **esta avaliação**, não uma conquista oficial. O nome interno do escopo `official` distingue o botão Submeter de Executar; não certifica infraestrutura. Pontos da questão não são XP. Não foram adicionados prêmios, ranking ou escrita de progresso no navegador. Evidências, elegibilidade e persistência continuam no servidor. Mensagens sobre fixtures públicas/ambiente local permanecem visíveis, inclusive na confirmação.

O evento já existente `silogium:execution-saved` continua atualizando histórico e consumidores de progresso. Nenhuma solução de referência ou fixture oculta é incluída no feedback.

## Arquivos

- `apps/web/components/submission-outcome.ts`: classificação pura, sem dependências de servidor.
- `apps/web/components/submission-completion.tsx` e `.module.css`: resumo, próximos passos e confirmação acessível.
- `apps/web/components/problem-workspace.tsx`: snapshot do pedido, integração e navegação/foco.
- `packages/core/test/submission-outcome.test.ts`: cenários do contrato.
- `tests/e2e/submission-completion.spec.ts`: fluxos de UI com respostas simuladas; não submetem a solução do usuário.

## Verificação

- Vitest: **363 testes aprovados em 35 arquivos**, incluindo 39 cenários novos do classificador.
- Typecheck de todos os workspaces aprovado; web repetido após os ajustes de foco.
- Primeira rodada Playwright (catálogo/resolução + conclusão): **77 aprovados, 2 falhas e 1 ignorado intencionalmente**. As duas falhas eram o mesmo ciclo de Tab em desktop/mobile.
- Após corrigir o ciclo explícito de foco, a suíte completa de conclusão passou: **34/34**, sem retries. Inclui navegação de teclado nos dois sentidos, Ctrl/Meta+Enter sobre botões e links, Escape preservando modo foco, dois runtimes, reenvios, resultados incoerentes, testes parciais, 320 px, movimento reduzido e 640×360. São **79 cenários distintos aprovados** somando as duas rodadas, não uma única execução integral de 79.
- Capturas de desktop/mobile inspecionadas em `test-results/submission-completion-*/completion.png` e `short-completion.png`. Captura desabilita animações para registrar o estado final. Sem texto cortado ou overflow horizontal na confirmação.
- Build Next.js de produção aprovado novamente após os ajustes finais, em `.next-build`, separado do serviço de desenvolvimento.
- Aba real do usuário inspecionada somente por leitura. Seu código não foi alterado nem reenviado. O serviço de desenvolvimento na porta 3000 foi preservado; o Playwright gerencia apenas seu próprio serviço de teste na porta 3100.

Nenhum deploy, migração, chamada de IA real ou alteração nas regras de gamificação foi realizado. As respostas de sucesso dos novos E2E são simuladas e não representam submissões reais do usuário.
