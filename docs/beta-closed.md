# Beta fechado — implementação e ativação

Atualizado em 10/09/2026. As migrações 014/015 foram aplicadas, o worker sob demanda foi publicado e uma criação real privada TypeScript passou até validação. O pedido encontrou questões semelhantes, exigiu confirmação, preservou checkpoints durante o processamento e consumiu exatamente uma criação diária após validação. A questão ficou ausente do catálogo público. A conta técnica de email não certifica o OAuth GitHub. **Conferir o estado da web publicada** em [DEPLOYMENT](./DEPLOYMENT.md); os resultados abaixo não equivalem ao benchmark completo ou à homologação integral de isolamento.

## Regras acordadas

| Situação | Comportamento |
| --- | --- |
| Visitante | Pode explorar questões públicas. |
| Primeiro login GitHub | Entra na lista de espera; login não aprova automaticamente. |
| Aguardando, rejeitado ou revogado | Sem autoria assistida nem execução remota, inclusive via CLI. Catálogo público e testes locais continuam úteis. |
| Participante aprovado | Pode usar recursos remotos dentro da capacidade gratuita e dos limites técnicos. |
| Administrador | Gerencia acesso; isento apenas da cota diária de criação. Não contorna limites técnicos ou financeiros. |

O painel **Administração**, na página de revisão existente, reúne participantes, pré-aprovações e pausas de processamento. A conta administradora existente é preservada; este código não promove usuários pelo nome de perfil.

As novas ações administrativas e de cancelamento/retomada exigem sessão do navegador e origem válida nas mutações. Tokens CLI não concedem esses novos poderes; continuam servindo aos fluxos de problemas e submissões existentes.

Convites são **pré-aprovações concedidas somente por administradores**, vinculadas ao ID imutável confirmado no GitHub. O administrador compartilha o endereço da plataforma com o convidado; não há envio automático de e-mail. Um login com essa identidade entra aprovado. Remover uma pré-aprovação não revoga um participante já aprovado: use a ação de revogação do participante. Rejeitar/revogar remove também a pré-aprovação associada, para impedir reingresso automático por ela.

## Duas criações por dia

- Conta somente uma **nova questão nativa criada e validada**. Pesquisar, importar, refinar e chamadas internas não consomem essa cota.
- Uma vaga é reservada após a confirmação das recomendações, ou antes de começar a geração quando não há confirmação pendente.
- Sucesso validado consome a reserva. Falha definitiva ou cancelamento libera a reserva. Repetir um commit não conta duas vezes.
- O dia muda à meia-noite em `America/Sao_Paulo`. Pausas mantêm o dia da reserva original; não debitam uma nova vaga ao retomar amanhã.
- Sem vaga, o pedido confirmado pode aguardar o próximo dia, sem chamada à IA. Reservas concorrentes são serializadas no banco.
- Os limites técnicos de admissão continuam: três tarefas ativas e dez pedidos por minuto por usuário; execução remota mantém 50/dia e dez/minuto. Não são créditos extras para administradores.

## Pausa, retomada e disponibilidade

A fila e seus checkpoints ficam no Supabase. A notificação autenticada acorda o worker depois do commit. Ele drena trabalho pronto e encerra; não fica esperando a renovação de cotas. Uma recuperação leve a cada cinco minutos cobre notificações perdidas e leases expirados. Ela não significa custo literalmente zero.

Pausas de capacidade não expiram após 24 horas nem gastam tentativas de falha. Revogar acesso pausa pedidos sem apagar etapas concluídas; reaprovar pode retomá-los. Cancelar é diferente: encerra o pedido e descarta seus checkpoints. Uma chamada externa já aceita pode terminar, mas seu lease inválido impede a gravação tardia dos efeitos.

Studio mostra acesso, criações concluídas/reservadas, renovação e disponibilidade. Esperas conhecidas usam consulta a cada 30 segundos, suspensa na aba oculta, sem falso timeout após 12 minutos. Pausar Groq não desativa o judge; pausar Modal impede autoria dependente do worker e execução remota. A busca direta em **Explorar** continua independente.

## Proteção financeira

São necessárias duas camadas:

1. **No Modal:** confirmar créditos vigentes, limite bruto compatível com eles e limite líquido de cobrança de US$ 0. Em 10/09/2026, após ajuste do proprietário, a interface confirmou teto bruto salvo de US$ 30 e créditos de US$ 30. Sem valor líquido personalizado, o padrão documentado é limite bruto menos créditos: portanto **US$ 0 no ciclo atual**, não uma proteção ausente. Essa evidência permite iniciar a ativação controlada. Limites são do workspace, não só deste projeto; cobranças de armazenamento podem ter regras distintas. Fonte: [Modal — Budgets](https://modal.com/docs/guide/budgets).
2. **Na aplicação:** atestação operacional do ciclo, observação recente do consumo bruto e reserva conservadora antes de cada trabalho. Dados ausentes, observação com mais de 15 minutos, ciclo não confirmado ou capacidade insuficiente bloqueiam trabalho novo. Não existe formulário web que declare esses limites financeiros verificados.

`operational_capacity('verify_modal', ...)` é somente para o operador com credenciais de serviço, após a confirmação real. Recebe `actorId`, `cycleStart`, `cycleEnd`, `creditMicrousd`, `grossLimitMicrousd`, `netLimitMicrousd` e opcionalmente `workloadLimitMicrousd`.

Para a rodada autorizada de testes, `workloadLimitMicrousd=1000000` estabelece **US$ 1 de teto interno**, mantendo os valores reais de crédito e limites nativos na atestação. Esse teto interno não modifica o cartão, não é um limite de cobrança do Modal e não cobre por si só builds, armazenamento ou outros aplicativos. Toda atividade real exige as travas nativas e acompanhamento do consumo. Não iniciar testes em lote.

A rodada foi concluída em 10/09/2026. Após criação privada validada, probes publicados
de aprovado/espera/revogado, teste delimitado de recuperação e limpeza dos dados técnicos,
o operador elevou **somente o teto interno para US$ 30**, a capacidade gratuita já
confirmada. Preservou o consumo e as reservas do ciclo e renovou a observação real.
A atestação expira em **30/09/2026 às 21h de Brasília**; outro ciclo exige nova
conferência, não simples renovação automática. Consumo observado e ressalvas em
[DEPLOYMENT](./DEPLOYMENT.md#capacidade-financeira-verificada).

A medida interna é consumo bruto observado de todo o workspace **mais todas as reservas do ciclo**. Pode contar parte do consumo duas vezes e pausar cedo. Não é uma fatura nem saldo exato, e não deve ser apresentada assim. Veja recursos, fórmula e limitações em [worker durável](./authoring-worker.md).

Mesmo em desenvolvimento, configurar o judge remoto exige o ledger Supabase. Não existe bypass de reservas usando o endpoint Modal junto da demonstração em memória; ela continua disponível somente com execução local.

O Groq permanece no plano gratuito, sem fallback pago. O controle considera o ledger compartilhado, janelas de requisições/tokens, requisições em curso e cooldown do fornecedor. Um horário de nova tentativa indica uma nova checagem, não garantia de renovação da franquia.

## Ordem segura para ativar

1. Confirmar os limites nativos do Modal no navegador. Aceitar US$ 0 explícito ou o padrão documentado de limite bruto menos créditos quando ambos foram conferidos e o resultado é zero. Se não houver essa proteção, interromper e discutir alternativa — não substituir por um valor positivo sem autorização.
2. Concluir testes locais/SQL e revisar as migrações 014/015. Aplicar somente essas migrações pendentes, preservando usuários, problemas e versões.
3. Registrar a atestação do ciclo com o teto interno de US$ 1 para a rodada. Não habilitar pedidos de participantes antes do smoke.
4. Criar secrets próprios `silogium-authoring-worker` e `silogium-authoring-wakeup`; publicar controller/worker com os limites declarados. Guardar credenciais fora do Git, no diretório de segredos solicitado pelo proprietário. Nunca usar secrets `NEXT_PUBLIC_*`.
5. Confirmar que o contexto remoto pode ler `Workspace.billing.summary()`, atualizar a observação e consumir a fila. Se não puder, falhar fechado; não colocar um token pessoal no código como atalho.
6. Testar com poucas contas técnicas: aprovação/revogação/CLI, concorrência pela segunda vaga, terceira criação aguardando, cancelamento, lease expirado, checkpoint, pausa Groq/Modal e recuperação. Primeiro doubles de provedor; depois poucas chamadas reais dentro do orçamento. Remover apenas os dados técnicos identificados.
7. Só então publicar a web correspondente e habilitar autoria. Conferir OAuth, estados e endpoints no ambiente publicado. Após a rodada, revisar evidências e elevar o teto interno até a capacidade gratuita confirmada, sem aumentar limites nativos.

Continuam fora desta rodada: benchmark cego completo de 40 prompts, comprovação de OOM/isolamento/carga, ensaio integral de restauração e liberação de progresso oficial. Não declarar esses resultados alcançados com testes simulados.

## Verificação e continuidade

- Migrações: `202609100014_beta_access_and_creation_quota.sql` e `202609100015_operational_capacity.sql`.
- SQL: **400 verificações aprovadas em 15 suítes**, incluindo acesso/RLS, beta, capacidade, fila e Groq. Rodada inicial transacional e nova rodada após aplicar realmente as migrações 014/015; fixtures de teste revertidas no PostgreSQL hospedado. Permanecem seis questões e um usuário reais após limpar a conta técnica do smoke.
- Vitest: **634 testes aprovados em 57 arquivos**, com dois workers. Dependências externas simuladas; nenhuma geração real de IA ou execução Modal. Typechecks dos workspaces aprovados.
- Build final de produção web/CLI aprovado, isolado em `.next-build`. Smoke do servidor de produção aprovado nos três cenários sem credenciais: jobs anônimo e bearer retornam 401; autoria retorna 400, sem fallback indevido para demonstração local.
- Playwright desktop/mobile das áreas alteradas: 54 de 56 cenários aprovados na rodada conjunta. As duas falhas eram uma fixture de refinamento que respondia sucesso antes do retry do usuário; depois de corrigida, o cenário passou em quatro reexecuções (duas por dispositivo). Os 18 cenários de beta e os 14 de descoberta passaram na rodada conjunta. Capturas de Studio/admin verificadas visualmente.
- A suíte completa local atual descobriu **212 cenários**: 210 passaram, um foi ignorado por ser exclusivo de mobile e um falhou por texto cortado no filtro de progresso em 1024 px durante carregamento. O mínimo das colunas foi corrigido de 200 para 260 px; os **10 testes de layout passaram depois da correção**, sem alterar testes/textos/fonte/padding. A suíte completa não foi repetida localmente após essa linha CSS.
- No CI do commit publicado `bd2ea46`, a suíte completa passou: **211 Playwright aprovados e um ignorado**, além dos 634 Vitest, 400 pgTAP e 41 Python. A web publicada passou pelos probes HTTP de aprovado/espera/revogado, com bloqueio remoto e privacidade preservados. O problema no primeiro probe era a confusão entre contagem de casos ocultos e conteúdo privado; o helper foi corrigido com regressão offline, sem mudança na aplicação.
- Controller/worker: **41 testes Python aprovados** (21 do judge e 20 do worker) e importação do SDK Modal 1.5.5 com rede bloqueada. Não comprovam execução no Modal real.
- Servidor de testes na porta 3100 encerrado ao finalizar; processo do usuário na porta 3000 preservado. Secrets worker/wakeup e credenciais técnicas do smoke foram guardados somente no vault externo solicitado pelo proprietário. Conta, questão privada, job e token técnicos foram removidos após os probes; credenciais técnicas marcadas revogadas. Código comitado/enviado ao GitHub e web publicada somente após aprovação do CI exato.
- A versão publicada, evidências e bloqueios operacionais devem ser atualizados em [DEPLOYMENT](./DEPLOYMENT.md) a cada publicação.
