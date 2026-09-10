# Banco inicial: três clássicas adicionais

O catálogo tem seis questões: as três progressivas originais, preservadas byte a byte na representação JSON, e as três clássicas abaixo. Clássicas usam uma etapa de 100 pontos, entrada/saída padrão e aceitam TypeScript e Python.

| Slug | Dificuldade | Foco | Casos públicos |
| --- | --- | --- | --- |
| `pacotes-complementares` | Fácil | Mapas, índices e desempate | 11 |
| `janelas-de-manutencao` | Média | Ordenação, sobreposição e união de intervalos | 11 |
| `rotas-da-estacao` | Média | BFS, caminhos mínimos e contagem modular | 12 |

## Fontes e regeneração

- Registro e metadados: `content/problems/classic-registry.json`.
- Enunciados: `questions/classic/<slug>/STATEMENT.md`.
- Starters: `solutions/typescript/<slug>.ts` e `solutions/python/<slug>.py`.
- Referências completas e públicas para estudo: `reference-solutions/<linguagem>/<slug>.<extensão>`.
- Fixtures determinísticas e seus valores esperados: `scripts/classic-seeds.mjs`.
- Artefatos gerados: `content/problems/generated-catalog.json`, `packages/core/src/generated-catalog.ts` e os três `content/judge/<slug>.visible.json` novos.

Execute `npm run content:generate` depois de editar fontes. Esse comando não acessa banco nem provedores de IA. As entradas máximas são públicas e geradas de forma reproduzível; o maior tamanho `n` previsto em cada enunciado é coberto. Os testes não geram respostas esperadas executando a própria referência.

## Verificação e privacidade

```bash
npx vitest run packages/core/test/classic-seeds.test.ts packages/judge/test/classic-seeds.integration.test.ts
```

Os testes verificam schemas, exemplos, metadados, limites, ausência de testes ocultos/referências nos bundles públicos e o hash dos três seeds originais. Oráculos independentes conferem as saídas dos casos pequenos. O judge local executa de fato as seis referências, os seis starters e quatro implementações deliberadamente erradas para conferir os desempates, a continuidade dos intervalos e a contagem de rotas.

Esses seeds são material de treino aberto: não oferecem testes secretos resistentes à memorização de fixtures. `hiddenCases` é vazio e `referenceSolutions` também é vazio no pacote público; não rotular como privado qualquer conteúdo já exposto no Git.

O script de seed Supabase reconhece as referências públicas desses slugs como fallback para o armazenamento interno, preservando a prioridade de arquivos privados explicitamente configurados. O verificador de bundles verifica as clássicas com os casos e referências públicos e continua exigindo os artefatos externos privados das três progressivas. Nenhum desses scripts deve ser confundido com um reset: versões já existentes não são sobrescritas.

## Integração

Não há rotas ou UI específicas dos novos exercícios: catálogo, filtros `classic`/`progressive`, workspace stdio e CLI consomem o contrato existente. O comando legado `npm run assessment` continua atendendo as questões progressivas Q1–Q3; para clássicas, use `silogium pull <slug> --runtime ts|py`, `silogium test` e `silogium submit` com a API local configurada.

Adicionar ao banco Supabase requer executar o seed autorizado em ambiente já configurado; a implementação e os testes locais não aplicam migrations nem fazem essa publicação. No modo local, um processo que já carregou o catálogo em memória pode precisar ser reiniciado para refletir os novos seeds.
