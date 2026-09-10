# Histórico completo e progresso pessoal

Implementação de 9 de setembro de 2026. O MVP não adiciona XP, ranking ou competição certificada.

## Funciona na aplicação

- Histórico paginado com ordenação estável por data e ID, filtros por questão/versão/tipo/veredito e totais de todas as páginas.
- Novos envios guardam código, linguagem, versão e `maxStage`. O detalhe, restrito ao proprietário, permite ver o código e abrir a versão correspondente quando ainda autorizada.
- O perfil lê agregados de todo o histórico disponível, separados das últimas atividades carregadas. Erros não são apresentados como zero.
- Meta semanal opcional, fuso IANA, preferência para esconder os indicadores e quatro conquistas discretas, integradas ao perfil. A faixa de prática é exportada para uso no catálogo.
- Eventos oficiais são produzidos pelo servidor. O cliente não informa progresso, elegibilidade ou conquistas.

## Demonstração não é avaliação oficial

Sem Supabase, o armazenamento continua em memória de processo e a UI informa **atividade desta sessão**. As referências globais preexistentes foram preservadas; esta implementação não inicia nem reinicia servidores.

O código descartado por versões antigas da aplicação não pode ser reconstruído. Atividades antigas permanecem consultáveis, com “código não preservado”; somente novos envios garantem captura do código.

Resultados demo, locais sem confiança explícita e registros legados sem evidência não geram marcos ou conquistas oficiais. Eles continuam nos contadores de atividade e no histórico. Dados locais não são migrados automaticamente para outra conta.

## Confiança do judge

O backend só pode produzir evidência `official` quando há armazenamento persistente e uma implantação remota explicitamente aprovada. Além de `MODAL_JUDGE_ENDPOINT`, a variável de servidor `SILOGIUM_VERIFIED_JUDGE_POLICY` identifica a política auditada, por exemplo um identificador interno de release.

**Não configurar essa variável apenas para fazer aparecer conquistas.** O isolamento, a integridade do harness e os testes privados precisam ser validados na infraestrutura real antes de habilitá-la. O default permanece sem reconhecimento oficial.

Mesmo com o gate habilitado, um bundle precisa conter testes privados em cada estágio. A construção de evidência confere os IDs e estágios de todos os casos esperados, rejeita resultados duplicados/desconhecidos e exige avaliação completa de uma mesma submissão para concluir a questão. `run` e testes próprios nunca contam.

Uma nova versão não renova o marco da questão. Versões iniciais recebem identidades de estágio estáveis dentro da questão; para revisões, novos marcos de estágio ficam desativados até existir um mapa editorial explícito. Conclusões completas da nova versão continuam sendo guardadas sem duplicar a contagem canônica.

## Supabase e outbox

Aplicar `supabase/migrations/202609090004_practice.sql` depois das migrações anteriores. Ela acrescenta:

- Escopo e evidência às submissões, com escrita restrita ao backend.
- Finalização transacional de submissão + outbox, idempotente por ID.
- Preferências versionadas por CAS, projeções privadas, marcos, conclusões por versão e conquistas.
- RLS de proprietário, sem leitura anônima dos dados de prática; funções de escrita restritas ao `service_role`.

O banco guarda evidência imutável como fonte de verdade. A projeção é reconstruída sob demanda a partir de **toda** a história, com páginas de 500 registros no backend; não depende da janela de 50/100 itens do frontend. Um futuro worker pode consumir a outbox. Não há worker assíncrono de gamificação instalado nesta entrega.

Falha ao recalcular progresso não muda o veredito já salvo e não exige reenviar a solução. Falhas de infraestrutura da execução ou da persistência tentam devolver a cota; falha da própria devolução requer retry operacional, não é ocultada como sucesso da persistência.

O seed de questões precisa existir no banco antes de salvar submissões desses IDs, devido às chaves estrangeiras. Não aplicar seed destrutivamente a questões editadas em produção.

## Semanas e privacidade

- Primeiro opt-in no meio da semana não reconta a semana atual: mantém o snapshot desativado e agenda a configuração seguinte.
- A semana começa segunda-feira no fuso IANA salvo. Metas/fusos de snapshots existentes não são reescritos.
- Uma mudança para leste pode sobrepor algumas horas do calendário; `countFrom` conserva essas horas exclusivamente na semana anterior. Para oeste, se ainda for domingo no novo fuso, a próxima semana começa na segunda local, sem meta nesse curto intervalo neutro. Nenhum evento é contado em duas semanas.
- Semanas não cumpridas não retiram conquistas nem geram penalidade. Datas são resultados confirmados, não medida de todo esforço de estudo.
- Privadas e não listadas podem alimentar progresso pessoal quando oficialmente avaliadas. Não alimentam reconhecimento público.
- Nenhuma conquista ou agregado público é exposto. `publicEligibleAchievements` do módulo puro é um candidato privado, não autorização para publicação: seria necessário opt-in, reautorização da visibilidade atual e invalidar caches quando o conteúdo se tornar privado.

## Verificação e limites

Foram executados 50 testes do módulo puro e 14 testes do backend em memória, cobrindo mais de 100 registros, paginação, replay, versões, proteção entre contas, escopo exato do judge, fuso e opt-in. Os três testes anteriores de resumo também passaram.

`supabase/tests/database/practice.test.sql` contém 13 verificações pgTAP de RLS, funções restritas, replay, outbox e legado. **Não foi executado contra um banco real nesta implementação.**

`tests/e2e/practice-history.spec.ts` adiciona cenários de UI para totais completos, meta opcional, layout de 320 px e código/versionamento no histórico; a execução desses cenários deve constar na validação integrada do projeto.

Correções auditadas por testes inválidos, fusão de identidades canônicas, retirada de recompensas e pipeline de migração de uma conta demo para autenticada ainda exigem regras e ferramentas específicas. Não reescrever evidência antiga para simular essas operações.
