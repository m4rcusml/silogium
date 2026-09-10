import { readFileSync } from "node:fs";

export function solve(input: string): string {
  const values = input.trim().split(/\s+/).map(Number);
  const n = values[0]!;
  if (n === 0) return "0 0";
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) intervals.push([values[2 * i + 1]!, values[2 * i + 2]!]);
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let [start, end] = intervals[0]!;
  let total = 0;
  let longest = 0;
  for (let i = 1; i < n; i += 1) {
    const [nextStart, nextEnd] = intervals[i]!;
    if (nextStart <= end) {
      // Inclui janelas contíguas; intervalos contidos nunca reduzem o fim.
      end = Math.max(end, nextEnd);
    } else {
      total += end - start;
      longest = Math.max(longest, end - start);
      [start, end] = [nextStart, nextEnd];
    }
  }
  total += end - start;
  longest = Math.max(longest, end - start);
  return `${total} ${longest}`;
}

console.log(solve(readFileSync(0, "utf8")));
