# Judge no Modal

O protocolo v2 mantém comparação, respostas esperadas, testes e pontuação no controlador autenticado. Cada caso usa uma sandbox nova, que recebe somente fonte + entrada atual + wrapper de valores. As imagens dos candidatos fixam Node 22.22.0 e Python 3.13.11.

**Estado:** implementação e testes offline; não houve deploy nem execução real no Modal nesta alteração. Os testes não certificam o isolamento de infraestrutura. Veja [SECURITY.md](./SECURITY.md) antes de habilitar acesso público.

```bash
python -m pip install -r infra/modal/requirements-deploy.txt
modal setup
modal secret create silogium-judge-token AUTH_TOKEN="um-segredo-longo"
modal deploy -m infra.modal.app
```

Copie a URL publicada e configure no Vercel:

```text
MODAL_JUDGE_ENDPOINT=https://...modal.run
MODAL_JUDGE_TOKEN=um-segredo-longo
```

O token pertence somente ao controlador. A sandbox não recebe token, OIDC, volume, pacote completo, respostas ou solução de referência. Runtimes, entradas, vereditos e diferenças passam por projeção/validação explícita. O adapter TypeScript rejeita endpoints antigos e respostas com IDs, estágios ou pontuação incoerentes.

Limites: até 128 casos por avaliação, 4 em paralelo, 2 s por caso (ou limite menor da questão), 256 MiB (ou menor), 64 KiB somados de stdout/stderr por processo e 30 s globais de processamento. Preparação/compilação não consome o prazo individual do candidato. O prazo global inclui infraestrutura: quando ele expira, retorna `system_error`, não uma penalização `time_limit`. Cleanup pode usar até mais 3 s; o cliente HTTP aguarda 35 s.

Uma sandbox por caso evita acesso aos próximos casos, mas aumenta custo e cold start. Medir latência com os bundles completos é obrigatório antes do rollout; não relaxar isolamento para caber no prazo. Não reutilizar sandboxes ou snapshots após executar código candidato.

Testes sem SDK Modal, secrets, rede ou serviços:

```bash
python -m unittest discover -s infra/modal -p "test_*.py" -v
npx vitest run packages/judge/test/modal.contract.test.ts packages/judge/test/modal-feedback.test.ts
npm run typecheck --workspace @silogium/judge
```

Python 3.13 e Node 22 são suficientes para esses testes. `requirements-deploy.txt` fixa Modal 1.5.5 e FastAPI 0.139.2. Em um venv local separado, `python -m infra.modal.check_sdk` importou as duas aplicações e conferiu assinaturas do SDK com conexões de rede bloqueadas. Isso não constrói imagens nem certifica infraestrutura; autenticação, execução e isolamento reais continuam pendentes.
