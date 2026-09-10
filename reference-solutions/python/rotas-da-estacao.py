from collections import deque
import sys

MOD = 1_000_000_007


def solve(data: str) -> str:
    values = list(map(int, data.split()))
    n, m, source, target = values[:4]
    if source == target:
        return "0 1"
    adjacent: list[list[int]] = [[] for _ in range(n + 1)]
    for i in range(m):
        u, v = values[4 + 2 * i], values[5 + 2 * i]
        adjacent[u].append(v)
        adjacent[v].append(u)
    distance = [-1] * (n + 1)
    ways = [0] * (n + 1)
    distance[source], ways[source] = 0, 1
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v in adjacent[u]:
            if distance[v] == -1:
                distance[v] = distance[u] + 1
                queue.append(v)
            if distance[v] == distance[u] + 1:
                ways[v] = (ways[v] + ways[u]) % MOD
    return "-1 0" if distance[target] == -1 else f"{distance[target]} {ways[target]}"


if __name__ == "__main__":
    print(solve(sys.stdin.read()))
