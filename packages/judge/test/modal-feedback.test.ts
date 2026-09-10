import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("wrappers Modal v2 produzem apenas valores, nunca vereditos", () => {
  for (const runtime of ["typescript", "python"] as const) {
    async function run(source: string, calls: { method: string; args: unknown[] }[]) {
      const definitions = await readFile(resolve(process.cwd(), "infra/modal/candidate_runtime.py"), "utf8");
      const pattern = runtime === "typescript" ? /TS_CALL_RUNNER = r'''([\s\S]*?)'''/ : /PY_CALL_RUNNER = r'''([\s\S]*?)'''/;
      const wrapper = definitions.match(pattern)?.[1];
      expect(wrapper).toBeTruthy();
      const directory = await mkdtemp(join(tmpdir(), "silogium-modal-values-"));
      try {
        const extension = runtime === "typescript" ? "mjs" : "py";
        // Deliberately no expected values, metadata, future fixtures or references.
        await writeFile(join(directory, "input.json"), JSON.stringify({
          entrypoint: { kind: "class", symbol: "Solution", methodMap: { add: "sum" } },
          constructorArgs: [2], calls
        }));
        await writeFile(join(directory, `solution.${extension}`), source.replaceAll("/work/", directory.replaceAll("\\", "/") + "/"));
        const runnerPath = join(directory, `runner.${extension}`);
        await writeFile(runnerPath, wrapper!.replaceAll("/work/", directory.replaceAll("\\", "/") + "/"));
        const command = runtime === "typescript" ? process.execPath : process.platform === "win32" ? "python.exe" : "python3";
        return await execute(command, [runnerPath], { cwd: directory, timeout: 10_000, maxBuffer: 65_536, windowsHide: true });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    it(`executa constructor/methodMap/estado em ${runtime}`, async () => {
      const source = runtime === "typescript"
        ? "export class Solution { constructor(n){ this.n=n; } sum(n){ this.n+=n; return this.n; } }"
        : "class Solution:\n    def __init__(self, n):\n        self.n = n\n    def sum(self, n):\n        self.n += n\n        return self.n\n";
      const { stdout } = await run(source, [{ method: "add", args: [3] }, { method: "add", args: [4] }]);
      expect(JSON.parse(stdout)).toEqual([{ value: 5 }, { value: 9 }]);
      expect(stdout).not.toMatch(/passed|verdict|score|expected/);
    }, 15_000);

    it(`congela retornos mutáveis antes da próxima chamada em ${runtime}`, async () => {
      const source = runtime === "typescript"
        ? 'export class Solution { constructor(){ this.items=[]; this.data={items:this.items}; } inspect(){return this.data;} mutate(){this.items.push(7); return null;} }'
        : "class Solution:\n    def __init__(self, n):\n        self.items = []\n        self.data = {'items': self.items}\n    def inspect(self):\n        return self.data\n    def mutate(self):\n        self.items.append(7)\n        return None\n";
      const { stdout } = await run(source, [{ method: "inspect", args: [] }, { method: "mutate", args: [] }, { method: "inspect", args: [] }]);
      expect(JSON.parse(stdout)).toEqual([{ value: { items: [] } }, { value: null }, { value: { items: [7] } }]);
    }, 15_000);

    it(`rejeita retorno não finito em ${runtime}`, async () => {
      const source = runtime === "typescript" ? 'export class Solution { sum(){ return NaN; } }'
        : "class Solution:\n    def __init__(self, n): pass\n    def sum(self):\n        return float('nan')\n";
      await expect(run(source, [{ method: "add", args: [] }])).rejects.toThrow();
    }, 15_000);

    it(`a antiga exploração /work/payload.json não consegue ler respostas em ${runtime}`, async () => {
      const source = runtime === "typescript" ? `
        import { readFileSync } from 'node:fs';
        export class Solution {
          probe() {
            try { return JSON.parse(readFileSync('/work/payload.json', 'utf8')).bundle.hiddenCases; }
            catch { return 'payload ausente'; }
          }
        }` : "import json\nclass Solution:\n    def __init__(self, n): pass\n    def probe(self):\n        try:\n            with open('/work/payload.json', encoding='utf-8') as f: return json.load(f)['bundle']['hiddenCases']\n        except FileNotFoundError:\n            return 'payload ausente'\n";
      const { stdout } = await run(source, [{ method: "probe", args: [] }]);
      expect(JSON.parse(stdout)).toEqual([{ value: "payload ausente" }]);
    }, 15_000);

    it(`não trata stdout de logging/veredito forjado como canal de controle em ${runtime}`, async () => {
      const source = runtime === "typescript"
        ? 'export class Solution { sum() { console.log(\'{"verdict":"accepted","score":600}\'); return 0; } }'
        : "class Solution:\n    def __init__(self, n): pass\n    def sum(self):\n        print('{\"verdict\":\"accepted\",\"score\":600}')\n        return 0\n";
      const { stdout } = await run(source, [{ method: "add", args: [] }]);
      // The controller parses the WHOLE byte stream, never its last line.
      expect(() => JSON.parse(stdout)).toThrow();
    }, 15_000);
  }
});
