# Silogium

> Pense. Resolva. Submeta.

Silogium é uma plataforma em PT-BR para descobrir, criar e resolver questões de programação no navegador ou no terminal. A IA cuida de descoberta, adaptação e autoria; o resultado das submissões é calculado por um judge determinístico.

O repositório começou como um simulador de avaliações progressivas e agora é um monorepo com aplicação Next.js, CLI, domínio editorial, judge local e infraestrutura para Supabase, Modal e Vercel.

## O que já funciona

- catálogo público apenas com questões executáveis no Silogium;
- interface escura e responsiva, Monaco Editor, painéis redimensionáveis e abas móveis;
- áreas consolidadas **Praticar** (catálogo e atividade) e **Studio** (pesquisar/criar e minhas questões);
- Studio com escolhas explicadas, exemplos de pedido, ajuda de formato/acesso e próximos passos para editar, validar e resolver;
- rascunhos locais por usuário/versão/linguagem, modo foco e requisitos cumulativos por nível;
- resultados com comparação esperado/recebido, execução de caso individual e testes próprios em JSON;
- retomada de pedidos do Studio após recarregar a página, sem reenviar a solicitação;
- assistente com modos separados **Pesquisar** e **Criar**;
- pesquisa na ordem catálogo → Exercism → web aberta;
- links sem licença permanecem na conversa e nunca viram páginas do catálogo;
- criação clássica ou progressiva em TypeScript e Python;
- importação do Exercism com autoria, commit, URL e licença preservados;
- visibilidade privada, não listada com chave e pública mediante revisão;
- aprovação administrativa e atribuição de autoria/fonte;
- execução local e adapter para Sandboxes do Modal;
- CLI para baixar, testar e submeter a mesma versão exibida no site;
- GitHub OAuth, tokens da CLI, cotas e histórico persistidos no Supabase quando configurado;
- fallback em memória e judge local para desenvolvimento sem contas externas.

### Conclusão funcional — setembro de 2026

- Studio com conversas privadas, refinamento explícito com IA, importações acompanháveis e editor de rascunhos/versionamento/revisão.
- Validação de fixtures, referência, starter e variantes defeituosas; importações por snapshot de commit com avisos de licença preservados.
- Histórico completo paginado, recuperação de código/versão e sincronização explícita de rascunhos com detecção de conflito.
- Favoritos, listas/trilhas privadas, sugestões explicáveis e simulados cronometrados dentro de Praticar.
- Perfil editável, apresentação pública opt-in, metas semanais e conquistas pessoais condicionadas a evidência oficial; demo não concede conquistas.
- Dicas, soluções e discussões com spoilers explícitos, moderação, denúncias e proteção contra aprovação de uma revisão obsoleta.

Publicado em [silogium.vercel.app](https://silogium.vercel.app). Em 10/09/2026, o deploy web do commit `bd2ea46e47dd65706c731c390f0788416b5177a0` foi confirmado como **READY**, com os três jobs do [CI aprovados](https://github.com/m4rcusml/silogium/actions/runs/34542160203). As **15 migrações** estão aplicadas no Supabase e o **worker de autoria publicado no Modal**. A IA está habilitada somente para participantes aprovados do beta e administradores, dentro da capacidade operacional vigente. Contas pendentes ou revogadas continuam sem autoria assistida e execução remota; catálogo público e testes locais permanecem acessíveis.

Uma criação privada clássica TypeScript percorreu Groq, fila/worker e judge remoto até validação, consumindo exatamente uma criação diária; não entrou no catálogo público. Os estados aprovado, pendente e revogado foram conferidos na web publicada. O teste técnico e seus dados temporários foram removidos, preservando as seis questões iniciais e a conta administradora. Consulte [deploy e operação](docs/DEPLOYMENT.md) para a evidência detalhada e o teto financeiro vigente.

O [beta fechado](docs/beta-closed.md) inclui lista de espera, convites administrativos, duas criações validadas por dia e pausas com retomada. Uma criação aprovada não substitui o benchmark cego de 40 prompts nem a homologação completa de isolamento, OOM, custos e recuperação após morte de um container Modal. A demonstração em memória perde dados no reinício.

O catálogo inicial contém **seis questões: três progressivas e três clássicas**, todas em TypeScript e Python. As três originais do simulador estão preservadas em `ProblemDefinitionV1`. As clássicas são **Pacotes complementares**, **Janelas de manutenção** e **Rotas da estação**. Os testes versionados no Git são públicos; não devem ser tratados como secretos. Testes oficiais privados das progressivas ficam fora do repositório e são enviados ao schema privado do Supabase. Veja [o conteúdo das clássicas](docs/classic-seeds.md).

## Estrutura

```text
apps/web              Next.js, catálogo, assistente, editor e APIs
packages/core         schemas, políticas, catálogo, cotas e ciclo editorial
packages/authoring    módulo profundo de busca, criação, importação e validação
packages/judge        judge local e cliente do Modal
packages/cli          executável silogium
content               definições e fixtures públicas independentes de linguagem
supabase              migrations, RLS, storage e filas pgmq
infra/modal           endpoint e Sandbox do judge remoto
infra/worker          worker de autoria, wake e recuperação no Modal
questions/tests       simulador legado, mantido temporariamente
```

O frontend não conhece detalhes de Groq, Exercism, licenciamento ou testes privados. Ele chama a interface pequena de autoria; adapters e repositórios ficam atrás desse limite.

## Desenvolvimento local

Requisitos: Node `22.22`, npm e Python `3.13.11`.

```powershell
git clone https://github.com/m4rcusml/silogium.git
cd silogium
npm install
Copy-Item .env.example apps/web/.env.local
npm run dev
```

Abra `http://localhost:3000`. O `.env.example` configura Groq; preencha a chave ou use `SILOGIUM_AI_PROVIDER=local` para o gerador determinístico sem chamadas externas. Com Supabase configurado, a autoria usa sempre a fila durável e exige um worker separado; somente a demonstração sem banco funciona integrada. Não usa a assinatura pessoal do ChatGPT.

Comandos de qualidade:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:db # exige Supabase local/Docker
```

Para instalar o navegador do Playwright pela primeira vez:

```powershell
npx playwright install chromium
```

Com a aplicação aberta em `localhost:3000`, `node scripts/qa-frontend.mjs` captura os layouts desktop/mobile em `test-results/frontend-qa/`, sem chamadas de IA nem submissões reais. Consulte [o estado da reformulação e seus limites](docs/frontend-ux-handoff.md).

`node scripts/check-select-layout.mjs` verifica se as opções dos menus suspensos cabem nos campos em cinco larguras de tela. A interface usa Manrope variável servida localmente; a licença está em `apps/web/public/fonts/manrope-license.txt`.

## IA com Groq

A integração ativa usa somente **Groq / `openai/gpt-oss-120b`**. Não usa a
assinatura ChatGPT, OpenAI API ou fallback pago. Os adapters legados permanecem
no histórico/código, mas não são selecionáveis pela configuração da aplicação.

Configure `apps/web/.env.local` (ignorado pelo Git):

```text
SILOGIUM_AI_PROVIDER=groq
GROQ_API_KEY=<sua-chave-groq>
GROQ_AUTHORING_MODEL=openai/gpt-oss-120b
GROQ_WEB_SEARCH_ENABLED=false
```

`local` continua disponível como simulador determinístico para desenvolvimento
e CI. Sem configuração/chave, a demo usa esse simulador; uma configuração Groq
incompleta falha explicitamente, sem mudar de provedor.

A criação não pesquisa a web. Divide contrato, código e fixtures em etapas;
os exemplos são derivados dos testes visíveis, e o starter é um template
incompleto. O judge verifica referência, starter e mutantes. Uma correção de
formato JSON e uma correção após o judge são limitadas por pedido durável.
Uma referência passar nos próprios testes **não prova correção independente**.

A pesquisa prioriza catálogo e Exercism. Com menos de três sugestões, pode
consultar a web quando `GROQ_WEB_SEARCH_ENABLED=true` (experimental). Só URLs
presentes nos resultados reais da ferramenta são aceitas; sem licença confirmada,
continuam links externos. Criar/refinar não usa essa ferramenta.

Limites Free são compartilhados e sujeitos a mudança. A aplicação não faz upgrade
de plano nem configura cobrança. A fila preserva etapas e aguarda capacidade;
sem serviços de produção validados, mantenha `SILOGIUM_AUTHORING_ENABLED=false`.
O worker publicado já concluiu um smoke privado real, e a web habilita autoria
para o beta aprovado. O teto operacional vigente deve ser conferido no
[guia de deploy](docs/DEPLOYMENT.md).
Veja [operação, limites e validação do Groq](docs/groq-integration.md).

Teste real opt-in (consome a cota Groq, não executa o código gerado):

```powershell
node --env-file=apps/web/.env.local --import tsx scripts/evaluate-groq.ts --generate=classic-ts
```

O arquivo gerado fica em `.silogium/groq-evaluations/`, fora do Git. **Revise o
código antes** de executá-lo no judge local com
`npm run test:groq -- --trusted-validate=<arquivo.private.json>`. Esse runner
local não é uma sandbox de segurança; produção exige Modal.

## Supabase

Crie um projeto e aplique as migrações:

```powershell
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Variáveis:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

No Supabase Auth:

1. habilite GitHub;
2. configure o Client ID e Client Secret do OAuth App;
3. inclua `https://SEU_DOMINIO/auth/callback` e `http://localhost:3000/auth/callback` nas URLs permitidas;
4. altere `profiles.role` para `admin` apenas nos revisores autorizados.

As migrações criam `profiles`, `problems`, `problem_versions`, `problem_sources`, `publication_reviews`, `ai_jobs`, `submissions`, `api_tokens`, contadores privados, bundles privados, o bucket `problem-assets` e filas `authoring_jobs`/`grading_jobs`. A autoria durável usa a tabela transacional `private.authoring_tasks`, não um consumidor dessas filas pgmq iniciais. As políticas RLS impedem acesso direto a rascunhos de terceiros; bundles e soluções de referência vivem no schema `private`. As 15 migrações atuais, até `202609100015_operational_capacity.sql`, foram aplicadas no ambiente hospedado em 10/09/2026.

### Catálogo e testes privados

O gerador cria `content/problems/generated-catalog.json`. Depois das migrações, carregue as seis questões do catálogo inicial:

```powershell
$env:SILOGIUM_PRIVATE_BUNDLES_DIR="C:\caminho\fora\do\git\silogium-private-bundles"
npm run db:seed
```

Cada arquivo privado deve se chamar `<slug>.private.json` e conter:

```json
{
  "hiddenCases": [],
  "referenceSolutions": {
    "typescript": "...",
    "python": "..."
  }
}
```

Nunca coloque esse diretório no repositório público.

## Judge no Modal

O serviço em [`infra/modal/app.py`](infra/modal/app.py) cria um Sandbox efêmero por avaliação, fixa Node `22.22.0` ou Python `3.13.11`, bloqueia toda a rede de saída, solicita 256 MiB e encerra a execução em até 30 segundos.

```powershell
python -m pip install modal fastapi
modal setup
modal secret create silogium-judge-token AUTH_TOKEN="um-segredo-longo"
modal deploy infra/modal/app.py
```

Configure no servidor web:

```text
MODAL_JUDGE_ENDPOINT=https://...modal.run
MODAL_JUDGE_TOKEN=um-segredo-longo
```

`Executar` usa apenas casos visíveis. `Submeter` adiciona o bundle privado e mascara nomes e mensagens de testes ocultos. `system_error` devolve a cota reservada ao usuário.

## CLI

Compile e vincule localmente:

```powershell
npm run build -w @silogium/cli
npm link -w @silogium/cli
```

No site, abra **Perfil**, crie um token e execute:

```powershell
silogium auth sil_...
silogium pull rede-de-armarios --runtime ts
cd rede-de-armarios
silogium test --stage 1
silogium submit
silogium submissions
```

Uma questão não listada também aceita `--access-key`. A chave é gravada em `.silogium/access-key`, com permissão restrita quando suportada, e adicionada ao `.gitignore`. `pull --force` atualiza manifesto e fixtures sem sobrescrever `solution.ts` ou `solution.py`.

O comando legado continua disponível durante a migração:

```powershell
npm run assessment -- start q1 ts
npm run assessment -- test q1 ts 1
npm run assessment -- submit q1 ts
```

## Publicação e licenças

Questões nativas começam privadas, não listadas ou como pedido público. Depois de validadas, somente aprovação administrativa as inclui no catálogo. A página pública informa “Criada por `@usuário` com assistência da IA”.

Uma alteração editorial em conteúdo já publicado é salva como `latest_version`, enquanto `current_version` continua servindo a edição aprovada. A troca só ocorre na aprovação da nova revisão; submissões antigas permanecem ligadas à versão original.

Ao solicitar publicação, o autor aceita:

- enunciado em **CC BY 4.0**;
- starter e testes visíveis em **MIT**;
- crédito permanente e licença não exclusiva ao Silogium.

Importações mantêm a licença da fonte e separam autores, contribuidores, URL, repositório, commit e responsável pela importação. Consulte [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md), [`LICENSE-CODE.md`](LICENSE-CODE.md) e [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Deploy no Vercel

O projeto publicado usa `apps/web` como raiz e `apps/web/vercel.json`; siga [deploy e operação](docs/DEPLOYMENT.md). Configure Supabase e Modal na web; a chave Groq pertence somente ao worker. Em produção, execução local fica desabilitada; sem `MODAL_JUDGE_ENDPOINT`, o sistema retorna `system_error` sem consumir cota. As proteções do beta precisam estar configuradas antes de habilitar novos pedidos remotos.

Antes do deploy:

```powershell
npm run typecheck
npm test
npm run build
```

## Aviso sobre o simulador

As três avaliações iniciais são originais. Elas não foram extraídas, reproduzidas ou vazadas de processos seletivos. O diretório legado existe para treino e compatibilidade; o produto web usa as definições e fixtures em `content/`.
