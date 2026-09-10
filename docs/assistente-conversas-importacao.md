# Studio: conversas, refinamento e importação

## Fluxo disponível

O Studio mantém descoberta, autoria, histórico e edição na mesma área. Cada pedido novo recebe `jobId` e `conversationId`. O histórico lista conversas e mensagens por páginas, permite voltar a um pedido e continuar a conversa ou começar outra.

O servidor envia ao provedor no máximo quatro pedidos anteriores, em ordem cronológica, com até 2.000 caracteres do usuário e 700 do resumo do assistente por pedido. O contexto não depende de uma sessão de OpenAI ou Codex. Código, enunciados completos, testes ocultos, snapshots de fonte e referências não entram nesse histórico; o refinamento autorizado recebe seus artefatos separadamente, apenas no servidor.

Conversas pertencem estritamente ao usuário, inclusive quando outro usuário tem perfil de administrador. A exclusão remove a conversa e seus resumos; não apaga questões, não cancela pedidos em andamento e não apaga registros internos de jobs. Um job que termina depois da exclusão não recria a conversa.

## Refinamento

Use o link **Refinar com IA** na questão criada ou no editor. O pedido contém `slug`, `prompt` e `expectedRevision`. O servidor consulta o rascunho autorizado e verifica a revisão antes de consumir cota; a gravação usa comparação atômica da revisão para não sobrescrever outra edição.

Uma operação de refinamento consome uma operação de IA. O pacote inteiro é preservado: uma geração define os enunciados e testes comuns; quando há outra linguagem, uma geração adicional adapta somente o código à mesma especificação e fixtures. O judge valida todas as linguagens. O servidor rejeita a omissão de qualquer linguagem ou referência e fixa identidade, autoria, origem e proveniência sem confiar na resposta do modelo.

O resultado fica como **rascunho**, mesmo quando a validação preliminar passa. O usuário revisa no editor e executa a validação editorial para materializar uma nova versão. A versão publicada anterior e suas submissões continuam imutáveis. Criação e refinamento nunca habilitam pesquisa web. O simulador determinístico não interpreta refinamentos livres; nesse modo, use o editor manual ou configure um provedor de autoria real.

## Importação

`POST /api/v1/imports/exercism` mantém a resposta síncrona legada. O Studio envia `async: true` e recebe um job em HTTP 202 para consultar por `/api/v1/jobs/:id`, inclusive após recarregar a página. O modo `import` também é aceito em `/api/v1/authoring`.

Uma versão já acessível (pública ou do próprio usuário) é reutilizada com versão explícita, sem buscar a fonte nem gastar IA. Conteúdo privado de terceiros não concede acesso nem revela título ou autor. A verificação de fonte/licença ocorre antes da cota de conversão; erro nessa etapa não gasta IA. O catálogo mantém a unicidade canônica da fonte.

O conector fixa o SHA antes de ler conteúdo, captura arquivos declarados e avisos legais com hashes/tamanhos e converte o conjunto em um único entrypoint. Não executa código upstream nem instala dependências. Limites: 40 arquivos, 128 KiB por arquivo, 512 KiB no total; capturas que excedem limites falham explicitamente. Reconhecimento automático de MIT é conservador: corpo completo normalizado, cabeçalhos permitidos e ausência de restrições/avisos ambíguos. Licenças não padronizadas precisam de revisão manual e não são classificadas como importáveis.

## Persistência e privacidade

Aplique `202609090005_conversations.sql` depois das migrações anteriores. Ela adiciona conversas, mensagens resumidas, índices de paginação, RLS estrita e modo de refinamento. Como `ai_jobs.result` precisa armazenar o pacote privado internamente, leitura direta da tabela é revogada de `anon` e `authenticated`; a UI usa exclusivamente o endpoint autenticado que remove o bundle. Escritas de histórico são somente pelo servidor.

Sem Supabase, histórico e jobs persistem apenas na memória do processo e sobrevivem ao hot reload, não a um reinício completo. Os jobs recuperáveis permitem retomar o **acompanhamento** sem reenviar operações; não implementam reexecução automática após morte do worker. Implantação serverless ainda requer worker/fila durável e configuração externa. Repetir cegamente a geração após falha de processo poderia consumir cota ou produzir duplicatas.

## Verificação

- Unitários: `conversation.test.ts`, `refinement-provider.test.ts`, `discovery.test.ts` e testes do snapshot/conector. Provedores e HTTP externos são simulados.
- Browser: `studio-conversations.spec.ts` cobre continuidade, reload, exclusão, importação assíncrona e refinamento com revisão; todas as respostas de autoria são mockadas.
- Banco: `supabase/tests/database/conversations.test.sql` cobre isolamento, permissões e exclusão sem apagar jobs. Preparado, mas não executado sem Supabase/PostgreSQL configurado.

Nenhuma validação local substitui revisão humana de originalidade, licença ou qualidade pedagógica, nem comprova disponibilidade dos provedores reais.
