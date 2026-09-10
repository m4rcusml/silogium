# Silogium — plano de conclusão funcional

Data: 2026-09-09. Status: funcionalidades implementadas e verificadas localmente; **não significa pronto para deploy**.

Atualização de 2026-09-10: Studio com orientação contextual, fluxo de autoria mais claro e catálogo inicial ampliado para três clássicas + três progressivas. Detalhes e validações desta etapa em [studio-ux-2026-09-10.md](studio-ux-2026-09-10.md).

Atualização de infraestrutura de 2026-09-10: fila durável, worker, proteção do judge, bloqueio do modo demo em produção, preparação privada dos seis seeds e CI implementados localmente. O provedor de IA hospedado continua por decidir. Estado e evidências desta rodada em [predeploy-2026-09-10.md](predeploy-2026-09-10.md); não confundir implementação/testes offline com homologação de Supabase/Modal.

## Escopo e decisões

Concluir o inventário funcional da conversa: autoria e revisão, conversa com IA, qualidade dos pacotes, histórico completo, retomada, importação, gamificação leve e expansões de personalização. Não criar páginas para cada recurso: concentrar em Praticar, Studio, resolução e perfil. Manter o tema escuro, tipografia, espaçamento e acessibilidade existentes.

O código anterior e os dados locais pertencem ao usuário. Não resetar o Git, apagar arquivos, reiniciar serviços para simplificar testes, publicar na internet, instalar infraestrutura ou usar provedores pagos sem necessidade e autorização correspondentes.

### Escolhas solicitadas antes das partes dependentes

1. **Material privado de autoria:** escolher entre revelação explícita com aviso de spoiler (recomendação), acesso apenas administrativo ou acesso integral automático pelo autor. Hoje até o autor recebe o resultado de geração sem referência e testes ocultos. Não ampliar esse acesso silenciosamente.
2. **Banco de desenvolvimento:** projeto Supabase separado, Supabase local com Docker ou desenvolver deixando a validação real do banco pendente. Nenhum banco local ativo/configuração Supabase foi encontrado nesta inspeção. Sem banco não declarar transações, RLS ou persistência entre reinícios como validadas.

Após o pedido de continuar, foram comunicados os defaults conservadores: revelar material privado somente com ação explícita e aviso de spoiler; desenvolver os adapters/migrações mantendo o banco real como pendência. Perfil compartilhado inclui somente nome, apresentação e site, não agregados. Nenhuma escolha de infraestrutura, cobrança ou publicação externa foi presumida.

Defaults de produto que não exigem bloqueio:

- Gamificação pessoal e opcional, sem XP, competição, moedas ou ranking; quatro conquistas e meta semanal flexível conforme `gamification-plan.md`.
- Perfil privado por padrão; compartilhamento futuro explicitamente opt-in, sem dados de questões privadas, prompts, código ou horários detalhados.
- Novas gerações/refinamentos que usam IA informam custo de cota; salvar texto não dispara geração escondida. Testes automatizados usam adapters simulados.
- Publicação, editoriais e contribuições comunitárias precisam de revisão; rejeição deve trazer orientação. Não publicar automaticamente conteúdo de terceiros.
- Reutilização de importação somente quando já publicada e acessível. Duplicata privada não concede acesso ao solicitante nem revela autor, conteúdo ou estado privado.
- Conversas e rascunhos são privados. Material recuperado é contexto não confiável, nunca instrução privilegiada.

## 1. Autoria e revisão

- Editor de rascunhos integrado a Minhas questões no Studio: enunciados/estágios, metadados, starter e testes visíveis; material privado conforme escolha acima.
- Salvar rascunho sem publicar; validar explicitamente; exibir relatório e permitir correção, inclusive de questões rejeitadas/nunca publicadas.
- Versões imutáveis: edição de publicada cria nova versão; versão pública anterior continua utilizável até nova aprovação.
- Salvar com controle de concorrência; não sobrescrever alterações de outra aba.
- Revisão fixa a versão revisada; inspeciona artefatos, diferenças, licença e relatório persistido. Rejeição com motivo obrigatório; autor pode corrigir e reenviar.
- IDs, autoria, origem/licença, identidade canônica e timestamps são controlados no servidor, não aceitos cegamente do formulário.

Aceite: A não edita/lê rascunho de B; leitor nunca recebe hidden/reference; rejeitar/corrigir/revalidar/republicar funciona; aprovação não promove uma versão diferente da inspecionada; histórico de versões permanece.

## 2. Histórico e progresso

- Histórico paginado; estatísticas independentes do recorte de 100 execuções.
- Persistir código, versão, escopo avaliado e evidência confiável do judge. Reabrir envio e versão antiga sem alterar rascunho atual sem confirmação.
- Gravar resultado e evento de progresso atomicamente; projeção idempotente por identidade canônica/linguagem. Cliente e IA não determinam conquistas.
- Preservar conclusão antiga após atualização; não somar parciais de envios incompatíveis para declarar questão concluída.
- Eventos legados sem evidência permanecem histórico não verificado; não inventar elegibilidade retroativa. Código local já descartado e versões sobrescritas não podem ser recuperados por promessa de migração.
- Gamificação: Primeira solução, Etapa por etapa, Duas linguagens, Repertório em construção; meta semanal opt-in de 1–7 dias, fuso IANA, semana começando segunda, alterações válidas na próxima semana.
- Demo explicitamente temporária; recompensas públicas jamais derivadas de execução demo, questão privada/própria ou pacote não confiável.

Aceite: mais de 100 submissões; replay/concurrency não duplica marco; outra linguagem não duplica total de questões; testes próprios/run/system_error não dão conquistas; RLS e fusos testados; legado não vira evidência oficial.

## 3. Assistente e importação

- Histórico próprio de conversas/pedidos, reabertura e exclusão; contexto limitado e autorizado independente de sessão proprietária de IA.
- Refinar questão existente preservando vínculo à versão; mostrar mudanças propostas, nunca sobrescrever uma publicada.
- Preservar recomendação antes de criar, confirmação idempotente, fontes e cotas.
- Importar snapshot Exercism fixado em um commit antes de ler os arquivos; capturar arquivos declarados, licença/avisos e hashes, sem truncamento silencioso.
- Os arquivos da fonte podem ser múltiplos; a conversão continua para o contrato de solução de arquivo único suportado pelo judge. Não anunciar execução nativa de qualquer repositório Exercism.
- Recuperar jobs de importação e falhas; não gastar IA para duplicatas conhecidas inacessíveis.

Aceite: continuar conversa não vaza gabarito; preservar estilos/modos de busca/criação; fonte sem licença fica apenas como link; todos os arquivos do snapshot correspondem ao commit; falha de limite/arquivo tem diagnóstico explícito.

## 4. Qualidade e retomada

- Reforçar schema/identidade/consistência das fixtures e verificar cada estágio/runtime.
- Validar referência e starter; introduzir variantes defeituosas e relatório honesto sobre cobertura/casos extremos. Não tratar heurística como prova de correção ou originalidade.
- Persistir filtros, fonte, quebra de linha, painéis e testes próprios com chaves por conta/contexto; recuperar armazenamento corrompido ou indisponível sem quebrar editor.
- Sincronização de rascunhos/preferências entre dispositivos depende do banco e inclui detecção de conflitos, sem sobrescrita silenciosa.

Aceite: fixtures inválidas rejeitadas; referências corretas passam; mutantes relevantes são detectados; reload mantém preferências/testes; contas, runtimes e versões não compartilham estado indevido; mobile 320 px e teclado continuam funcionais.

## 5. Personalização e comunidade

- Favoritos, listas pessoais e trilhas dentro de Praticar, distintos dos agrupamentos estáticos atuais.
- Próxima questão sugerida por histórico/metadados acessíveis, com motivo legível e sem alegar proficiência medida.
- Dicas graduais e editoriais revisados na resolução, com ação explícita para revelar spoilers; nunca reaproveitar bundle privado em respostas públicas.
- Simulado cronometrado integrado à prática, com seleção de questões, retomada e resultado; sem chamá-lo de prova fiscalizada ou competição.
- Perfil editável e compartilhamento opt-in de campos/agregados permitidos.
- Discussões e soluções comunitárias na questão, com denúncia, revisão/ocultação, acesso restrito ao conteúdo elegível, exclusão pelo autor e limites antiabuso. Sem nova rede social, mensagens privadas ou ranking.

Aceite: listas de A não expõem dados a B; recomendações não usam questões privadas alheias; compartilhar perfil não revela atividade privada; spoilers são explícitos; simulado não altera o veredito do judge; moderação comunitária e autorização são testadas.

## Verificação e limites de conclusão

- Testes de domínio pelos mesmos contratos usados pelos consumidores; adapters de memória e Supabase com regras equivalentes.
- Typecheck de todos os workspaces, testes unitários/integrados, build em diretório separado, Playwright desktop/mobile sem substituir o servidor do usuário.
- Testes reais de banco e provedores dependem das configurações ainda solicitadas. Testes simulados não são apresentados como verificação de integrações reais.
- Atualizar este documento ao concluir cada etapa, com evidências e pendências. O deploy permanece separado e depende também dos impedimentos de segurança/infra já relatados.

## Andamento

- [x] Inspeção e divisão do trabalho; impedimentos comunicados antes de desenvolver.
- [x] Defaults de autoria/privacidade comunicados após “continue”; banco real não configurado.
- [x] Snapshot licenciado fixado e completo; atribuição/notices em site e pacote CLI.
- [x] Persistência de preferências/testes no navegador; filtros com URL e cache por conta.
- [x] Regras puras de progresso e gamificação com testes; demo/legado sem conquistas oficiais.
- [x] Validação ampliada: consistência, referência, starter, mutantes e relatório de cobertura heurística.
- [x] Ciclo editorial, revisão fixa, CAS, versões históricas e revelação explícita.
- [x] Histórico paginado completo, recuperação de código e sync com CAS; persistência Supabase implementada, não comprovada no banco.
- [x] Conversas/refinamentos/importação acompanhável por job, sem sobrescrever publicada.
- [x] Favoritos, listas/trilhas, sugestões, simulados, perfil opt-in e comunidade moderada.
- [x] Concluir repetição da suíte Playwright após correções da revisão integrada.
- [ ] Validar migrações/RLS/transações em Supabase real ou local.
- [ ] Validar provedores reais, judge remoto e fila durável antes do deploy.

## Resultado implementado e onde testar

| Área | Caminho e comportamento |
| --- | --- |
| Praticar | `/explorar`: catálogo, progresso de todo o histórico, favoritos, listas/trilhas privadas, recomendações e simulados no painel expansível. Minha atividade continua na mesma tela. |
| Studio | `/studio`: conversas, pesquisa/criação, confirmação de similares, importações por job; `?section=mine&edit=<slug>` abre editor na biblioteca editorial. |
| Resolução | `/problemas/<slug>`: preferências locais, testes próprios, favoritos, sincronização explícita, histórico e comunidade em abas. `?version=N&submission=ID&runtime=typescript` reabre um envio sem sobrescrever automaticamente. |
| Perfil | `/perfil`: atividade completa, meta semanal, quatro conquistas oficiais quando elegíveis, apresentação editável e compartilhamento opcional. |
| Perfil compartilhado | `/p/<handle>`: somente nome/apresentação/site, retirado ao desativar consentimento. |
| Administração | `/admin/revisao`: inspecionar/revisar questões, contribuições e denúncias. Nenhuma aprovação automática. |

O módulo editorial concentra rascunhos/revisões/versões; ambos os adapters usam o mesmo domínio. As regras de progresso são projeções determinísticas. A biblioteca usa uma única transição de estado com CAS e a comunidade exige o timestamp que o autor/revisor efetivamente leu. Esta separação segue a skill `codebase-design`.

### Limites de produto explícitos

- Uma trilha é uma lista ordenada privada, não um curso ou recomendação de proficiência.
- Até 500 favoritos, 30 listas de até 100 questões e 100 simulados por conta nesta versão; exceder o limite dá erro e não apaga o histórico anterior.
- Simulado: 1–8 questões, 5–240 minutos, uma sessão ativa; versão e prazo fixados no servidor. Apenas submissões completas aceitas da versão e do período contam; `system_error` não é tentativa. Não é prova fiscalizada nem ranking.
- Sync é explícito, tem confirmação de restauro, timeout e controle de revisão; código local continua salvo automaticamente. Em demo, o servidor pode perder os dados no reinício.
- Spoilers públicos de dicas/soluções exigem abrir o bloco. Autores só recebem seus materiais privados após ação de revelação; outros usuários nunca recebem o bundle.
- Contribuições/editais de usuários aguardam revisão. Editar publicada retorna a pendente; aprovação/edição obsoleta retorna 409; remoção não pode ser reaprovada.
- Recomendações pessoais são determinísticas e explicáveis; não consomem IA. Refinamento usa uma operação da cota e um provedor real. O simulador `local` não faz refinamento semântico.
- Snapshot Exercism suporta múltiplos arquivos de origem, mas o judge continua com solução de arquivo único. Importação só preserva licença MIT confirmada, autoria e avisos integrais; não promete importabilidade universal.

## Pendências de ambiente e operação (bloqueiam publicação pública)

1. **Banco:** escolher Supabase de desenvolvimento/staging ou instalar infraestrutura local autorizada. Executar todas as migrações e pgTAP, testar OAuth com duas contas, RLS, RPCs service-only, CAS e rollback transacional. Arquivos SQL preparados não equivalem a testes executados.
2. **Fila/worker:** consumo durável implementado para hospedagem, com retry, lease, checkpoints, limites de admissão e gravação transacional dos resultados. O modo local integrado foi preservado. Falta executar migração/pgTAP e comprovar recuperação após morte do worker no ambiente real antes de habilitar autoria hospedada; detalhes em `authoring-worker.md`.
3. **Judge:** o controlador confiável agora compara resultados fora da sandbox e envia somente a entrada do caso atual ao código submetido. Contratos e cenários adversariais passaram offline; falta validar isolamento real de TypeScript/Python, limites de rede/memória/processos/arquivos e tempo de inicialização no Modal. O runner local é somente para código confiável. Não habilitar `SILOGIUM_VERIFIED_JUDGE_POLICY` sem essa auditoria.
4. **IA e serviços reais:** exercitar criação/refinamento multilíngue e importação completa com o provedor escolhido, sem conta pessoal Codex em servidor público. Testes desta etapa não chamaram IA paga nem Modal real.
5. **Operação:** escolher orçamento, retenção de código/prompts, domínio e responsável pela moderação; configurar secrets externos, observabilidade, backups/restauração e pipeline de staging. Nada foi provisionado/publicado nesta etapa.

## Evidências da verificação local da rodada funcional anterior

Os números abaixo são históricos. Para os testes posteriores de infraestrutura/pré-deploy, consultar `predeploy-2026-09-10.md`.

- `npm run typecheck`: todos os workspaces aprovados na versão integrada.
- `npm test -- --maxWorkers=2`: **298 testes aprovados em 31 arquivos**.
- `$env:NEXT_DIST_DIR='.next-build'; npm run build`: Next.js e CLI compilados (diretório separado do desenvolvimento).
- `npm run cli -- --help`: executável reconhece auth/pull/test/submit/submissions.
- Playwright desktop/mobile: primeira rodada com **114 aprovados, 9 falhas e 1 ignorado intencionalmente**; a repetição direcionada teve **14/14 aprovados**, incluindo as nove falhas corrigidas, quatro cenários novos de CAS/refinamento bloqueado e uma repetição adicional do histórico. Total de **127 cenários distintos aprovados e um exclusivo de mobile ignorado no desktop**. Não foi uma única rodada inteira sem retries.
- Falhas corrigidas nos E2E: assert de privacidade passou a distinguir contagem de testes de conteúdo privado, mock de histórico acompanha query parameters, seletores usam papéis acessíveis e casos de moderação enviam a revisão observada. Navegação abortada durante atualização de módulos não se repetiu com os arquivos estabilizados.
- `scripts/qa-personal.mjs`: inspeção de biblioteca/perfil/resolução em 1440, 390 e 320 px, sem overflow horizontal nem erros de JavaScript na captura; inspeção visual confirmou margens/padding e separação dos blocos. Artefatos em `test-results/completion-qa`, recriáveis pelo script.
- Migrações 003–009 e pgTAP preparados, **não executados**. RPCs da 009 substituem acessos REST ao schema privado; seed recusa sobrescrever versão/bundle divergente.
- Não houve push, deploy, criação de infraestrutura, seed/reset de banco, consumo de crédito de reset, chamada de IA real ou execução real no Modal. O servidor dos E2E na porta 3100 foi encerrado pelo próprio Playwright; o processo de desenvolvimento do usuário não foi encerrado.

### Documentação complementar

- `editorial-integration.md`: versões, CAS, spoilers e revisão.
- `assistente-conversas-importacao.md`: conversas, limites de contexto, refinamento e snapshot.
- `practice-history-implementation.md`: histórico, evidência, gamificação e flags de confiança.
- `submission-completion.md`: confirmação após envio completo aprovado, orientação em testes parciais e verificação de acessibilidade desktop/mobile (10/09/2026).
- `gamification-plan.md`: proposta original, com atualização de implementação no início.
- `DEPLOYMENT.md`: runbook atualizado de configuração, staging e deploy; etapas de serviços reais continuam pendentes de execução.
- `predeploy-2026-09-10.md`: implementação e verificação mais recentes de segurança, jobs, seeds e CI.
