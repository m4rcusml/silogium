# Pacotes complementares

Uma central de logística recebe `n` pacotes em uma ordem fixa. O pacote na posição `i` tem volume inteiro `v[i]`. Você deve escolher **dois pacotes diferentes** cuja soma dos volumes seja exatamente o alvo `t`.

Entre todos os pares válidos `(i, j)`, com `i < j`, escolha:

1. O par com o **menor segundo índice `j`**.
2. Se ainda houver empate, o par com o **menor primeiro índice `i`**.

Os índices começam em **1** e se referem à ordem original. Volumes repetidos representam pacotes diferentes; um mesmo pacote nunca pode ocupar as duas posições. Se não existir um par válido, imprima `-1`.

## Entrada

A primeira linha contém dois inteiros `n` e `t`. A segunda contém os `n` volumes, separados por espaços. Para `n = 0`, não há volumes nem é necessária uma segunda linha.

- `0 ≤ n ≤ 100000`
- `0 ≤ t ≤ 2000000000`
- `0 ≤ v[i] ≤ 1000000000`
- A entrada sempre respeita essas restrições; quebras de linha e espaços adicionais não mudam os valores.

## Saída

Uma única linha com `i j`, separados por um espaço, ou `-1` quando não existir solução. Não imprima rótulos ou explicações.

## Exemplo 1

Entrada:

```text
6 10
1 4 4 6 9 6
```

Saída:

```text
2 4
```

Os pares `(2, 4)` e `(3, 4)` atingem o alvo antes de `(1, 5)`, pois têm o segundo índice menor. Entre eles, o índice inicial `2` vence. O desempate **não** prioriza o menor `i` antes de comparar `j`.

## Exemplo 2

Entrada:

```text
3 8
4 1 2
```

Saída:

```text
-1
```

O único pacote de volume `4` não pode ser escolhido duas vezes. Com menos de dois pacotes, a resposta também é `-1`.

## Implementação

Leia a entrada padrão e escreva na saída padrão. O starter oferece `solve`, mas o contrato avaliado é o programa completo. Todos os cálculos cabem em um inteiro exato de `number` no TypeScript e em `int` no Python.
