# Rotas da estação

Uma rede de transporte possui `n` estações, numeradas de **1 a `n`**, e `m` ligações. Cada ligação pode ser percorrida nos **dois sentidos** e custa exatamente um trecho, independentemente das estações envolvidas.

Dados uma origem `s` e um destino `t`, encontre a menor quantidade de trechos necessária para ir de `s` a `t` e conte quantas rotas distintas usam exatamente essa quantidade.

Duas rotas são distintas quando suas sequências de estações diferem. Conte apenas rotas de comprimento mínimo, não passeios com desvios ou voltas. Como a quantidade pode ser grande, imprima seu resto na divisão por **1000000007**.

## Entrada

A primeira linha contém `n m s t`. Cada uma das `m` linhas seguintes contém `u v`, indicando uma ligação não dirigida entre as estações `u` e `v`.

- `1 ≤ n ≤ 100000`
- `0 ≤ m ≤ 200000`
- `1 ≤ s, t, u, v ≤ n`
- `u ≠ v`; não há ligações repetidas, nem mesmo com a ordem invertida.
- O grafo pode ser desconectado. A origem e o destino podem ser iguais.
- A entrada respeita todas as restrições; os valores podem ser separados por qualquer espaço em branco.

## Saída

Uma linha com `distancia quantidade`, separadas por um espaço.

- Se o destino não for alcançável, imprima `-1 0`.
- Se `s = t`, a rota vazia é a única rota mínima: imprima `0 1`.
- Caso contrário, imprima a distância mínima e a quantidade de rotas mínimas módulo `1000000007`.

Uma contagem modular igual a zero **não** significa, por si só, que o destino seja inalcançável; a distância determina isso.

## Exemplo 1

Entrada:

```text
6 8 1 6
1 2
1 3
2 4
2 5
3 4
3 5
4 6
5 6
```

Saída:

```text
3 4
```

As rotas mínimas são `1 → 2 → 4 → 6`, `1 → 2 → 5 → 6`, `1 → 3 → 4 → 6` e `1 → 3 → 5 → 6`. Todas têm três trechos.

## Exemplo 2

Entrada:

```text
4 1 1 4
1 2
```

Saída:

```text
-1 0
```

## Implementação

Leia da entrada padrão e escreva na saída padrão. O starter oferece `solve`, mas o programa completo é avaliado. Para TypeScript, mantenha as contagens reduzidas pelo módulo a cada soma; assim, `number` é suficiente sem perder precisão. No Python, a mesma redução evita inteiros desnecessariamente grandes.
