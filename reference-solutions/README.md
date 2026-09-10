# Soluções de referência

Este diretório contém implementações completas para estudo **depois** de uma tentativa cronometrada.

- [`typescript/question1.ts`](typescript/question1.ts): Q1 completa, com os quatro níveis e 600/600 nos testes simulados.
- Clássicas, com referências completas em TypeScript e Python:
  - `pacotes-complementares`: mapa de primeiras ocorrências; O(n) de tempo esperado e memória.
  - `janelas-de-manutencao`: ordenação e união de intervalos; O(n log n) de tempo e O(n) de memória.
  - `rotas-da-estacao`: BFS com contagem modular; O(n + m) de tempo e memória.

As referências clássicas ficam em `typescript/<slug>.ts` e `python/<slug>.py`. São **públicas para estudo**, não soluções secretas. Não são incluídas no starter, no catálogo gerado nem no bundle público entregue pelo CLI; o script de seed pode carregá-las no armazenamento interno para validação editorial. Todos os casos oficiais desses três exercícios são visíveis em `content/judge/<slug>.visible.json`, inclusive os casos grandes.

Para executar apenas a verificação das referências clássicas nas duas linguagens:

```bash
npm run content:generate
npx vitest run packages/core/test/classic-seeds.test.ts packages/judge/test/classic-seeds.integration.test.ts
```

O avaliador de prática executa seu código; os testes de integração executam explicitamente estas referências. Consultar esta pasta antes da tentativa elimina boa parte do valor do exercício.
