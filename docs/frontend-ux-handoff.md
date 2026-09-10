# Silogium — estado do frontend e UX

Atualizado em 09/09/2026, após retomar a implementação aprovada.

> Atualização posterior, 09/09/2026: este documento preserva o handoff da reformulação visual. O estado funcional mais recente está em `platform-completion-plan.md`. Histórico completo, preferências/testes persistidos, editor editorial, conversas/refinamentos, biblioteca/simulados, sync e comunidade agora estão implementados. A lista de “próximas evoluções” abaixo é histórica; limites de banco, worker durável e judge seguro continuam reais. As contagens de testes abaixo pertencem à etapa visual, não à última rodada.

## Estado

A reformulação está implementada e os fluxos principais foram verificados em desktop e mobile. O handoff anterior descrevia incorretamente a ausência do rodapé de ações e de `result.message`; ambos já existiam na retomada. Este documento substitui aquele diagnóstico intermediário.

O working tree também contém alterações anteriores do provider Codex/IA. Elas foram preservadas; não houve commit, push, publicação externa ou alteração de secrets nesta retomada.

## Entregue

### Navegação e prática

- Navegação principal reduzida a **Praticar**, **Studio** e perfil.
- Catálogo e **Minha atividade** compartilham `/explorar`.
- Busca, filtros por linguagem/dificuldade/formato/progresso, coleções e densidade compacta/confortável.
- Densidade persistida no navegador. Origem/licença visíveis, sem misturar links externos ao catálogo.
- Progresso por questão e versão a partir das últimas 100 execuções da conta. Apenas submissões completas aceitas marcam a questão como resolvida; execuções de teste não marcam.
- Histórico com nome da questão, versão, filtros e detalhes expansíveis na própria tela. Não mostra atividade de outros usuários, inclusive para o administrador nesta área pessoal.

### Resolução

- Enunciado e Monaco lado a lado; separadores ajustáveis por mouse e teclado.
- Abas Questão/Código/Resultado em telas pequenas. Rodapé de ações acessível mesmo em 320 × 568.
- Modo foco, fonte ajustável, quebra de linha e atalhos Ctrl/Command+Enter e Ctrl/Command+Shift+Enter.
- Rascunhos separados por usuário, questão, versão e linguagem; o restauro antecede a montagem do editor e preserva rascunhos vazios. Falhas de armazenamento são comunicadas.
- Níveis progressivos exibem requisitos cumulativos e acesso aos enunciados anteriores.
- **Executar** avalia casos visíveis até o nível selecionado. **Submeter** avalia todos os níveis.
- Resultado com veredito em PT-BR, pontuação, tempo, seleção da primeira falha e comparação estruturada entre esperado/recebido.
- Execução de um caso visível e cópia para **Testes próprios**. Testes próprios são JSON editável, nunca modificam o bundle oficial e são proibidos na submissão oficial.
- Falhas de conexão e respostas inválidas liberam o editor. Espera máxima de 90 segundos no cliente; após timeout o aviso orienta consultar o histórico antes de repetir.
- Comando da CLI em diálogo acessível, com cópia e instruções.

### Studio

- Pesquisa/criação e Minhas questões na mesma área, com links diretos `?mode=create` e `?section=mine`.
- Estado real de processamento, tempo decorrido e recuperação do último pedido após reload/navegação, sem reenviar automaticamente o pedido.
- Falhas temporárias permitem consultar o mesmo job novamente. O navegador guarda somente ID/modo/horário do job, não seus resultados privados.
- Estados e atribuição em PT-BR, biblioteca editorial e consentimento de publicação inline.
- Importações mantêm origem e licença; resultados externos continuam abrindo a fonte original.

### Visual

- Refinamento posterior: Manrope variável servida pela própria aplicação, header com marca vetorial/navegação/perfil, scrollbars discretos com handles arredondados (incluindo Monaco).
- Selects têm um único espaço reservado para a seta e largura suficiente para a maior opção. Grids reorganizam as opções em vez de comprimir o texto. Menus laterais quebram linha em telas pequenas.
- `node scripts/check-select-layout.mjs`: reproduziu os cortes originais (rótulo de 124 px em área útil de 86 px) e agora retorna `failures: []` em 320/390/768/1024/1440 px.
- `tests/e2e/controls-layout.spec.ts`: 10 verificações passaram (cinco larguras nos dois projetos), incluindo download WOFF2 real, carregamento da Manrope, texto dos selects, navegação e ausência de overflow horizontal.
- Suíte após o refinamento: 45 cenários passaram na primeira execução; dois atingiram timeout no carregamento durante o build concorrente e passaram ao repetir com dois workers. Total: 47 aprovados, um cenário exclusivo de mobile ignorado no desktop. Typecheck web e build aprovados.
- Paleta escura preservada, bordas de 1 px e raios contidos de 4/6/8 px.
- Escala de espaçamento 4/8/12/16/20/24/32 px.
- Layout sem gradientes, glassmorphism, chat permanente na resolução ou telas adicionais desnecessárias.
- Capturas em 1440×900, 1024×768, 800×600, 390×844 e 320×568; ajustado o excesso de espaço do cabeçalho do Studio no mobile.

## Rotas antigas

| Rota | Destino |
| --- | --- |
| `/` | `/explorar` |
| `/assistente` | `/studio` |
| `/minhas-questoes` | `/studio?section=mine` |
| `/submissoes` | `/explorar?view=activity` |

## Verificação

- `npm run typecheck`: aprovado em todos os workspaces.
- `npx vitest run`: **50 testes passaram em 10 arquivos**; inclui core, autoria, judge local, contrato remoto e wrappers Modal executados localmente.
- `npm run test:e2e`: **37 passaram, 1 ignorado intencionalmente** (cenário exclusivo de mobile não roda no projeto desktop).
- E2E cobre redirecionamentos, filtros, progresso, drafts TS/Python, níveis, histórico por versão, erros de rede/timeout, teste individual/próprio, foco, separadores, recuperação do Studio, tokens e consentimento de licença.
- Metadados indisponíveis de uma questão não derrubam todo o histórico. Diagnósticos extras do judge respeitam o orçamento existente de saída (inputs grandes são omitidos).
- `npm run build`: Next.js e CLI compilados.
- `node scripts/qa-frontend.mjs`: gera capturas em `test-results/frontend-qa/` e relatório de dimensões/erros JS. Usa `http://localhost:3000` ou `SILOGIUM_QA_URL`. As execuções da inspeção visual são simuladas no navegador; não fazem submissões reais nem chamam IA.

A Manrope está em `@fontsource-variable/manrope`; a aplicação carrega somente o subset latino variável (aproximadamente 25 KiB). A licença OFL acompanha os assets em `apps/web/public/fonts/manrope-license.txt`.

Os testes de UI usam mocks e o provider local determinístico; **não foi gerada uma nova questão pelo Codex real** nesta retomada. Modal foi verificado por contrato/wrappers e sintaxe, não por deploy remoto. RLS/Supabase em serviço real não foram revalidados nesta etapa de frontend.

## Limites e próximas evoluções

1. Soluções comunitárias e discussões ainda não existem; não foram inseridos botões sem função para elas. Exigem regras de publicação, moderação e persistência próprias.
2. O progresso exibido é uma visão das últimas 100 execuções, não um agregado permanente de toda a história da conta. Para escalar, criar consulta/endpoint agregado e paginação do histórico.
3. Testes próprios, tamanho de fonte e divisões dos painéis não persistem após reload. O código da solução e a densidade do catálogo persistem.
4. Sem Supabase, questões geradas, jobs e atividade do modo demo ficam em memória do processo. Recuperar um job no navegador não faz esse job sobreviver a uma reinicialização do servidor.
5. O judge local continua sendo para código de confiança. Isolamento e limites remotos dependem do Modal configurado. Não expor a instância local publicamente como sandbox de produção.
6. A importação ainda usa a requisição síncrona existente; a UI orienta manter a página aberta. Migrar importações para jobs recuperáveis é uma evolução de backend.
7. Sem bundle privado configurado, a submissão local usa fixtures públicas e informa isso no resultado. Não é um veredito com testes secretos.
8. O Monaco ainda depende do carregamento padrão de assets; empacotar workers/assets localmente é uma melhoria futura para uso offline.

## Para testar localmente

```powershell
cd C:\Users\Inteli\Documents\Anotações\silogium
npm run dev
```

Abrir `http://localhost:3000/explorar`. Caso já exista um servidor nesta porta, usar o processo existente ou encerrá-lo antes de iniciar outro. O E2E administra seu próprio servidor na porta 3100 e usa `.next-e2e`.

O wireframe aprovado permanece em `C:\Users\Inteli\Documents\ChatGPT\Carreira e tals\outputs\silogium-ux-wireframe.html`.

## Refinamento de 09/09 — espaçamento, perfil e gamificação

### Entregue

- Ritmo vertical explícito nos resultados do Studio: 16 px entre blocos/cards e 24 px entre cabeçalho e biblioteca. Avisos, estados vazios, verificações abertas e ações não ficam mais encostados.
- Catálogo mantém a tabela no desktop; no mobile as questões têm borda completa, padding de 16 px e intervalo de 12 px. A densidade confortável quebra as descrições em linhas, sem cortar o parágrafo; título, tags e progresso têm espaços próprios.
- Enunciados Markdown têm separação explícita entre parágrafos/listas e entre itens. A introdução de páginas auxiliares também se separa do conteúdo seguinte.
- `/perfil` reúne identidade, ambiente/permissão, resumo das últimas 100 execuções, linguagens, quatro atividades recentes, atalhos e acesso ao terminal, sem criar novas telas.
- Métricas não fingem um histórico completo: o uso de `Executar` não conta como `Submeter`; falhas de infraestrutura são excluídas dos contadores. Questões praticadas são distintas por ID, mesmo com várias versões. Aceitação parcial não é apresentada como questão concluída.
- Tokens têm carregamento, erro/retry, criação/cópia com feedback, status/datas e confirmação inline antes da revogação. O segredo permanece somente no estado do componente; não é salvo em localStorage e desaparece após sair/recarregar.
- Aviso explícito de que a conta demo é compartilhada nesse servidor e os dados locais ficam em memória.

### Diagnóstico e validação

- `node scripts/check-content-spacing.mjs` reproduziu separações de 0 px em desktop/mobile antes das correções. O controle experimental mostrou que mudar somente o tipo de layout não bastava; faltava definir o intervalo entre blocos. O script agora verifica 12 relações reais de espaçamento com respostas mockadas e sem enviar pedidos de IA.
- `tests/e2e/content-spacing.spec.ts` cobre biblioteca, criação, verificações abertas, resultados de pesquisa e catálogo confortável/mobile.
- `tests/e2e/profile.spec.ts` cobre resumo real, estados de carregamento/vazio/erro, tokens com mocks, sigilo do segredo, confirmação/falha de revogação e tela de 320 px.
- `npm run test:e2e -- --workers=2`: **65 aprovados e um ignorado intencionalmente**, sem falhas.
- Revisão visual final acrescentou 16 px entre filtros e primeiro card mobile e padding lateral de 16 px na biblioteca preenchida. A suíte específica `content-spacing.spec.ts` foi repetida após essas correções: **6 aprovados**, incluindo o novo cenário com biblioteca preenchida.
- `npm test`: **53 testes aprovados em 11 arquivos**. Typecheck web e `npm run build` (Next.js + CLI) aprovados.
- `node scripts/qa-profile.mjs`: perfil conferido em 1440, 1024, 768, 390 e 320 px; sem overflow horizontal ou erros JS. Capturas usam dados ilustrativos mockados, não estatísticas reais nem tokens reais.

### Apenas planejado

[Plano de gamificação](gamification-plan.md) contém pesquisa em fontes primárias, regras de elegibilidade/privacidade, modelo técnico e critérios de aceite. Proposta de MVP: progresso verificável, meta semanal flexível opt-in e quatro conquistas integradas às telas atuais; XP e rating competitivo ficam para depois.

**Não foram implementados pontos, badges, metas ou ranking.** Antes disso, é necessário histórico durável e idempotente: as últimas 100 execuções e o armazenamento demo em memória não bastam. O perfil permanece privado à sessão; compartilhamento público e edição de dados pessoais não fazem parte desta entrega.

## Descoberta por metadados — 09/09

Implementado o pedido de metadados para busca/criação, detalhado em [Descoberta e confirmação](discovery-metadata.md).

- Metadados versionados de conceitos, habilidades, tema, palavras-chave, linguagem, formato e dificuldade. Questões antigas são enriquecidas ao ler; revisões recalculam a classificação a partir do conteúdo atual.
- Comparação determinística com sinônimos PT/EN compartilhada por catálogo pessoal, conector Exercism e contexto dos provedores Codex/OpenAI. Não usa código de referência nem testes ocultos.
- Antes de gerar, o Studio mostra até cinco questões relacionadas e exige confirmação explícita. Sem correspondência, o fluxo de criação segue normalmente. O preflight não chama IA e não consome cota.
- Confirmação atômica/idempotente do snapshot: duplo clique, reload, alteração do formulário e resposta de rede perdida não criam silenciosamente um novo pedido. Continua tudo na tela atual, sem uma etapa de navegação adicional.
- Links externos ficam no histórico pessoal de descoberta, com URL canônica/fonte/data; não entram no catálogo nem recebem licença por afirmação da IA.
- Migração `202609090001_discovery_metadata.sql` acrescenta armazenamento externo com RLS e impede escrita direta de jobs por clientes, para não contornar schema/consentimento de publicação. **Não aplicada a um serviço real.** Teste pgTAP com 17 verificações preparado, não executado (sem Supabase/psql/Docker local).
- Ajustada a borda da cota local: a quinta operação de IA e a décima execução no minuto agora são permitidas; somente a seguinte é recusada. Dois testes cobrem a correção.

### Verificação desta entrega

- `npm test`: **98 testes aprovados, em 16 arquivos**.
- `npm run typecheck`: todos os workspaces aprovados.
- Build Next.js + CLI aprovado, com `NEXT_DIST_DIR=.next-build` para preservar o servidor de desenvolvimento ativo. O diretório gerado está no `.gitignore`.
- E2E completo: **82 passaram, 1 ignorado intencionalmente e 1 falha transitória de ambiente**. O trace identificou o Windows bloqueando leitura do diretório temporário do esbuild durante validação da referência/starter no teste de publicação. A repetição isolada dos contratos de API (incluindo esse teste e a confirmação real com simulador local) passou **4/4**, desktop e mobile. Não houve alteração do judge nem afrouxamento das verificações para contornar a falha.
- Os **16 cenários novos E2E** (14 de UI e 2 de API) passaram; incluem confirmação, alteração do pedido, recarga, erros, timeout, links, ausência de artefatos privados e layout em 320 px. Capturas desktop/mobile foram inspecionadas.
- Provedores testados com transporte/runner simulado. Não houve chamada real ao Codex/OpenAI nem gasto de geração durante a validação.
- Servidor `localhost:3000`, PID 22472, preservado. Uma consulta somente de leitura confirmou os metadados da questão de armários nesse servidor.

### Para testar

No Studio, selecione **Criar** e envie “reservas e cancelamentos em coworking”, com TypeScript. A questão existente de coworking deve aparecer antes de qualquer geração; abrir a sugestão não cria outra questão. Só **Criar nova mesmo assim** inicia a IA e usa sua cota normal.

Limitações: correspondência heurística (não embeddings), apenas acervo acessível e links já registrados, cache local em memória enquanto não houver Supabase, e links sugeridos pelo Codex sem conferência independente por URL. Esses pontos estão explicados no documento de descoberta.
