# Janelas de manutenção

Um serviço ficará indisponível durante `n` intervalos de manutenção. Os intervalos podem chegar fora de ordem, se sobrepor, estar contidos em outros ou se repetir.

Cada intervalo é representado por `[inicio, fim)`: inclui o instante inicial e exclui o final. Sua duração é `fim - inicio`; estamos medindo tempo contínuo, **não contando pontos inteiros**.

Considere a união dos intervalos. Duas janelas que se sobrepõem **ou se encostam** formam uma única janela contínua. Por exemplo, `[0, 2)` e `[2, 5)` formam `[0, 5)`, sem intervalo de funcionamento entre elas.

Calcule:

1. A duração total da indisponibilidade, sem contar sobreposições mais de uma vez.
2. A duração da maior janela contínua resultante.

## Entrada

A primeira linha contém `n`. Cada uma das `n` linhas seguintes contém dois inteiros `inicio` e `fim`.

- `0 ≤ n ≤ 100000`
- `0 ≤ inicio < fim ≤ 1000000000`
- Intervalos repetidos são permitidos.
- Os horários usam a mesma unidade e origem; não há datas, fusos ou conversões.
- A entrada é válida; os valores podem ser separados por qualquer espaço em branco.

## Saída

Uma única linha com `total maior`, separados por um espaço. Para `n = 0`, imprima `0 0`. Não imprima as janelas individuais.

## Exemplo 1

Entrada:

```text
4
5 8
0 2
2 5
12 14
```

Saída:

```text
10 8
```

As três primeiras manutenções formam `[0, 8)`. A outra forma `[12, 14)`. O total é `8 + 2 = 10` e a maior janela dura `8`.

## Exemplo 2

Entrada:

```text
4
2 9
4 5
2 9
3 7
```

Saída:

```text
7 7
```

Todos os intervalos estão dentro de `[2, 9)`, inclusive sua repetição. Nenhum acrescenta tempo fora dessa janela.

## Implementação

Leia da entrada padrão e escreva na saída padrão. O starter oferece `solve`, mas o programa completo é avaliado. A duração total e a maior duração não ultrapassam `1000000000`; `number` no TypeScript e `int` no Python são suficientes.
