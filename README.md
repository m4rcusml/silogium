# Silogium

> Pense. Resolva. Submeta.

Silogium é uma plataforma em PT-BR para descobrir, criar e resolver questões de programação no navegador ou no terminal. A IA cuida de descoberta, adaptação e autoria; o resultado das submissões é calculado por um judge determinístico.

O repositório começou como um simulador de avaliações progressivas e agora é um monorepo com aplicação Next.js, CLI, domínio editorial, judge local e infraestrutura para Supabase, Modal e Vercel.

## O que já funciona

- catálogo público apenas com questões executáveis no Silogium;
- interface escura e responsiva, Monaco Editor, painéis redimensionáveis e abas móveis;
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

As três questões originais do simulador estão migradas para `ProblemDefinitionV1`. Os antigos “testes ocultos” continuam no Git apenas como fixtures públicas de regressão; testes oficiais novos ficam fora do repositório e são enviados ao schema privado do Supabase.

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
questions/tests       simulador legado, mantido temporariamente
```

O frontend não conhece detalhes de OpenAI, Exercism, licenciamento ou testes privados. Ele chama a interface pequena de autoria; adapters e repositórios ficam atrás desse limite.

## Desenvolvimento local

Requisitos: Node `22.22`, npm e Python `3.13.11`.

```powershell
git clone https://github.com/m4rcusml/silogium.git
cd silogium
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. Sem credenciais externas, a aplicação usa um administrador local de demonstração, um gerador determinístico e o judge local. Isso permite experimentar todo o fluxo sem enviar código ou prompts a terceiros.

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

## OpenAI

Somente o servidor lê `OPENAI_API_KEY`. O modo **Criar** usa Structured Outputs e não recebe ferramenta de busca; o modo **Pesquisar** usa web search e sempre devolve URLs de origem. Configure:

```text
OPENAI_API_KEY=...
OPENAI_DISCOVERY_MODEL=gpt-5.6-luna
OPENAI_AUTHORING_MODEL=gpt-5.6-terra
```

O validador verifica schema, identidade do bundle, cobertura dos níveis, presença de testes privados e solução de referência. Quando um judge está disponível, também executa a referência, compila o starter e confirma que os testes rejeitam a implementação defeituosa.

## Supabase

Crie um projeto e aplique a migration:

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

A migration cria `profiles`, `problems`, `problem_versions`, `problem_sources`, `publication_reviews`, `ai_jobs`, `submissions`, `api_tokens`, contadores privados, bundles privados, o bucket `problem-assets` e filas `authoring_jobs`/`grading_jobs`. As políticas RLS impedem acesso direto a rascunhos de terceiros; bundles e soluções de referência vivem no schema `private`.

### Catálogo e testes privados

O gerador cria `content/problems/generated-catalog.json`. Depois da migration, carregue as três questões:

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

Importe o repositório na Vercel, mantenha a raiz do projeto no repositório e use o `vercel.json` incluído. Cadastre todas as variáveis de Supabase, OpenAI e Modal. Em produção, execução local fica desabilitada; sem `MODAL_JUDGE_ENDPOINT`, o sistema retorna `system_error` sem consumir cota.

Antes do deploy:

```powershell
npm run typecheck
npm test
npm run build
```

## Aviso sobre o simulador

As três avaliações iniciais são originais. Elas não foram extraídas, reproduzidas ou vazadas de processos seletivos. O diretório legado existe para treino e compatibilidade; o produto web usa as definições e fixtures em `content/`.
