# Judge no Modal

O endpoint cria um Sandbox efêmero por avaliação, bloqueia toda a rede de saída e limita a execução a 256 MiB e 30 segundos. As imagens fixam Node 22.22.0 e Python 3.13.11.

```bash
python -m pip install modal fastapi
modal setup
modal secret create silogium-judge-token AUTH_TOKEN="um-segredo-longo"
modal deploy infra/modal/app.py
```

Copie a URL publicada e configure no Vercel:

```text
MODAL_JUDGE_ENDPOINT=https://...modal.run
MODAL_JUDGE_TOKEN=um-segredo-longo
```

O segredo nunca é entregue ao Sandbox que executa a solução. O controller envia apenas a definição da versão, o bundle do judge e o código da submissão.
