import sys


def solve(data: str) -> str:
    values = list(map(int, data.split()))
    n, target = values[:2]
    first_index: dict[int, int] = {}
    for j in range(1, n + 1):
        volume = values[j + 1]
        i = first_index.get(target - volume)
        if i is not None:
            return f"{i} {j}"
        # Não substituir a primeira ocorrência: ela vence os desempates.
        if volume not in first_index:
            first_index[volume] = j
    return "-1"


if __name__ == "__main__":
    print(solve(sys.stdin.read()))
