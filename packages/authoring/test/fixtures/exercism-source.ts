import { vi } from "vitest";

export const SOURCE_SHA = "ab".repeat(20);
export const SOURCE_PREFIX = "exercises/practice/two-fer/";
export const MIT_TEXT = `MIT License

Copyright (c) 2026 Exercism contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;

export type SnapshotFixtureOptions = {
  runtime?: "typescript" | "python";
  metadata?: Record<string, unknown>;
  extraFiles?: Record<string, string | Uint8Array>;
  omittedFiles?: string[];
  modes?: Record<string, string>;
  sizes?: Record<string, number | undefined>;
  ref?: unknown;
  truncated?: boolean;
  contentLengths?: Record<string, number>;
};

export function mockSnapshot(options: SnapshotFixtureOptions = {}) {
  const runtime = options.runtime ?? "typescript";
  const metadata = options.metadata ?? { authors: ["autor"], contributors: ["contribuidor"], files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts"] } };
  const files = new Map<string, string | Uint8Array>(Object.entries({
    LICENSE: MIT_TEXT,
    [`${SOURCE_PREFIX}.meta/config.json`]: JSON.stringify(metadata),
    [`${SOURCE_PREFIX}.docs/instructions.md`]: "Diga duas palavras.",
    [`${SOURCE_PREFIX}two-fer.ts`]: "export function twoFer() {}",
    [`${SOURCE_PREFIX}two-fer.test.ts`]: "test('two fer', () => {})",
    ...options.extraFiles
  }));
  for (const path of options.omittedFiles ?? []) files.delete(path);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === `https://api.github.com/repos/exercism/${runtime}/git/ref/heads/main`) {
      return Response.json(options.ref ?? { object: { type: "commit", sha: SOURCE_SHA } });
    }
    if (url === `https://api.github.com/repos/exercism/${runtime}/git/trees/${SOURCE_SHA}?recursive=1`) {
      return Response.json({ sha: "cd".repeat(20), truncated: options.truncated ?? false, tree: [...files].map(([path, content]) => ({
        path, type: "blob", mode: options.modes?.[path] ?? "100644",
        size: Object.hasOwn(options.sizes ?? {}, path) ? options.sizes?.[path] : typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength
      })) });
    }
    const rawPrefix = `https://raw.githubusercontent.com/exercism/${runtime}/${SOURCE_SHA}/`;
    if (url.startsWith(rawPrefix)) {
      expectNoRedirect(init);
      const path = url.slice(rawPrefix.length).split("/").map(decodeURIComponent).join("/");
      const content = files.get(path);
      if (content === undefined) return new Response("not found", { status: 404 });
      return new Response(content as BodyInit, { status: 200, headers: options.contentLengths?.[path] ? { "content-length": String(options.contentLengths[path]) } : {} });
    }
    throw new Error(`Unexpected source request: ${url}`);
  });
  return { fetchMock, files, runtime };
}

function expectNoRedirect(init?: RequestInit) {
  if (init?.redirect !== "error") throw new Error("Capture must reject redirects");
}
