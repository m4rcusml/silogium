import { readFileSync } from "node:fs";

const MOD = 1_000_000_007;

export function solve(input: string): string {
  const values = input.trim().split(/\s+/).map(Number);
  const [n, m, source, target] = [values[0]!, values[1]!, values[2]!, values[3]!];
  if (source === target) return "0 1";
  const adjacent: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < m; i += 1) {
    const u = values[4 + 2 * i]!;
    const v = values[5 + 2 * i]!;
    adjacent[u]!.push(v);
    adjacent[v]!.push(u);
  }
  const distance = new Int32Array(n + 1).fill(-1);
  const ways = new Int32Array(n + 1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  distance[source] = 0;
  ways[source] = 1;
  queue[tail++] = source;

  while (head < tail) {
    const u = queue[head++]!;
    for (const v of adjacent[u]!) {
      if (distance[v] === -1) {
        distance[v] = distance[u]! + 1;
        queue[tail++] = v;
      }
      // Vários pais da mesma camada podem contribuir para um mesmo destino.
      if (distance[v] === distance[u]! + 1) ways[v] = (ways[v]! + ways[u]!) % MOD;
    }
  }
  return distance[target] === -1 ? "-1 0" : `${distance[target]} ${ways[target]}`;
}

console.log(solve(readFileSync(0, "utf8")));
