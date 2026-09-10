import { readFileSync } from "node:fs";

// A primeira ocorrência de cada volume é suficiente para desempatar pelo menor i.
// Consultar antes de inserir impede que um pacote forme um par consigo mesmo.
export function solve(input: string): string {
  const values = input.trim().split(/\s+/).map(Number);
  const n = values[0]!;
  const target = values[1]!;
  const firstIndex = new Map<number, number>();
  for (let j = 1; j <= n; j += 1) {
    const volume = values[j + 1]!;
    const i = firstIndex.get(target - volume);
    if (i !== undefined) return `${i} ${j}`;
    if (!firstIndex.has(volume)) firstIndex.set(volume, j);
  }
  return "-1";
}

console.log(solve(readFileSync(0, "utf8")));
