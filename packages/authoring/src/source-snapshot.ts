import { createHash } from "node:crypto";
import type { Runtime } from "@silogium/core";
import type { LicensedExerciseSource } from "./types.js";

type SourceFile = LicensedExerciseSource["snapshot"]["files"][number];
type Role = SourceFile["roles"][number];
type TreeEntry = { path: string; type: string; mode: string; size?: number };

/** Hard capture limits, not truncation limits. Larger sources require explicit adaptation. */
export const EXERCISM_SNAPSHOT_LIMITS = {
  files: 40,
  fileBytes: 128 * 1024,
  totalBytes: 512 * 1024,
  treeBytes: 4 * 1024 * 1024,
  treeEntries: 20_000,
  requestTimeoutMs: 8_000,
  totalTimeoutMs: 45_000
} as const;

const gitHeaders = { accept: "application/vnd.github+json", "user-agent": "silogium" };
const immutableSha = /^[0-9a-f]{40}$/i;
const licenseName = /^(?:licen[sc]e|copying)(?:[._-].*)?$/i;
const noticeName = /^(?:notice|copyright|authors|attribution)(?:[._-].*)?$/i;

function sourcePath(value: unknown): string {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > 300
    || value.startsWith("/") || /[\\:%?#\u0000-\u001f\u007f]/.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("A fonte declara um caminho de arquivo inválido. A importação exige revisão manual.");
  }
  return value;
}

function encodedPath(path: string): string { return path.split("/").map(encodeURIComponent).join("/"); }

function json<T>(content: string, label: string): T {
  try { return JSON.parse(content) as T; }
  catch { throw new Error(`O arquivo ${label} não contém JSON válido.`); }
}

function attribution(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 200)) {
    throw new Error(`Os metadados de ${field} da fonte são inválidos.`);
  }
  return [...new Set(value as string[])];
}

const mitBody = `Permission is hereby granted, free of charge, to any person obtaining a copy
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
THE SOFTWARE.`;

function normalizeLicense(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

function ambiguousLegalTerms(text: string): boolean {
  return /\b(?:non[\s-]?commercial|commercial use|prohibited|forbidden|restricted|additional terms|dual licen[cs]|alternatively licen[cs]|gnu|gpl|agpl|apache|creative commons|may not|must|shall|does not permit|purposes only)\b/i.test(text);
}

/** Conservative recognition, not a legal parser: nonstandard/combined grants need review. */
export function confirmsMitLicenseText(text: string): boolean {
  const bodyStart = text.search(/permission is hereby granted/i);
  if (bodyStart < 0 || normalizeLicense(text.slice(bodyStart)) !== normalizeLicense(mitBody)) return false;
  const headers = text.slice(0, bodyStart).replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (headers.some(ambiguousLegalTerms)) return false;
  return headers.every((line) => /^(?:the )?mit license(?:\s*\(mit\))?$/i.test(line)
    || /^spdx-license-identifier:\s*mit$/i.test(line)
    || /^copyright\s*(?:(?:\(c\)|©)\s*)?\d{4}(?:\s*[-–,]\s*\d{4})*\s+\S.*$/i.test(line)
    || /^(?:authors?|contributors?|attribution|licensor|copyright holder):\s+\S.*$/i.test(line)
    || /^all rights reserved\.?$/i.test(line));
}

async function readText(url: string, maximum: number, signal: AbortSignal, api = false): Promise<{ content: string; bytes: number; sha256: string }> {
  const response = await fetch(url, {
    ...(api ? { headers: gitHeaders } : {}),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(EXERCISM_SNAPSHOT_LIMITS.requestTimeoutMs)])
  });
  if (!response.ok) throw new Error(`Não foi possível capturar a fonte no commit fixado (HTTP ${response.status}).`);
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maximum) {
    await response.body?.cancel();
    throw new Error(`Um arquivo da fonte excede o limite de ${maximum} bytes. Nenhum conteúdo foi truncado.`);
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > maximum) {
          await reader.cancel();
          throw new Error(`Um arquivo da fonte excede o limite de ${maximum} bytes. Nenhum conteúdo foi truncado.`);
        }
        chunks.push(result.value);
      }
    } finally { reader.releaseLock(); }
  }
  const buffer = Buffer.concat(chunks, bytes);
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer); }
  catch { throw new Error("A fonte contém um arquivo binário ou texto que não é UTF-8. É necessária uma adaptação manual."); }
  if (content.includes("\0")) throw new Error("A fonte contém um arquivo binário. É necessária uma adaptação manual.");
  return { content, bytes, sha256: createHash("sha256").update(buffer).digest("hex") };
}

/** Capture only; never runs upstream code, follows redirects or installs dependencies. */
export async function captureExercismSource(slug: string, runtime: Runtime): Promise<LicensedExerciseSource> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug do Exercism inválido.");
  if (runtime !== "typescript" && runtime !== "python") throw new Error("Linguagem do Exercism inválida.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXERCISM_SNAPSHOT_LIMITS.totalTimeoutMs);
  try {
    const api = `https://api.github.com/repos/exercism/${runtime}`;
    // Resolve a commit first. Every subsequent source read uses that immutable SHA.
    const resolved = json<{ object?: { sha?: unknown; type?: unknown } }>((await readText(`${api}/git/ref/heads/main`, 64 * 1024, controller.signal, true)).content, "referência Git");
    const sha = resolved.object?.sha;
    if (typeof sha !== "string" || !immutableSha.test(sha) || resolved.object?.type !== "commit") {
      throw new Error("Não foi possível confirmar um commit imutável do Exercism. A importação foi interrompida.");
    }
    const commitSha = sha.toLowerCase();
    const treeResponse = await readText(`${api}/git/trees/${commitSha}?recursive=1`, EXERCISM_SNAPSHOT_LIMITS.treeBytes, controller.signal, true);
    const inventory = json<{ sha?: unknown; truncated?: unknown; tree?: unknown }>(treeResponse.content, "árvore Git");
    if (inventory.truncated !== false || !Array.isArray(inventory.tree) || inventory.tree.length > EXERCISM_SNAPSHOT_LIMITS.treeEntries) {
      throw new Error("A listagem de arquivos da fonte está incompleta ou excede o limite. Nenhum snapshot parcial será importado.");
    }
    const tree = new Map<string, TreeEntry>();
    for (const item of inventory.tree) {
      if (!item || typeof item !== "object" || typeof item.path !== "string" || typeof item.type !== "string" || typeof item.mode !== "string") {
        throw new Error("A árvore Git da fonte contém metadados inválidos.");
      }
      if (tree.has(item.path)) throw new Error("A árvore Git da fonte contém caminhos duplicados.");
      tree.set(item.path, item as TreeEntry);
    }
    const prefix = `exercises/practice/${slug}/`;
    const roles = new Map<string, Set<Role>>();
    const captured = new Map<string, SourceFile>();
    let totalBytes = 0;
    function requireFile(path: string, role: Role) {
      sourcePath(path);
      const entry = tree.get(path);
      if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
        throw new Error(`O arquivo declarado ${path} não existe como arquivo regular no commit fixado. Links simbólicos e submódulos não são importados.`);
      }
      if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > EXERCISM_SNAPSHOT_LIMITS.fileBytes)) {
        throw new Error(`O arquivo ${path} excede o limite de ${EXERCISM_SNAPSHOT_LIMITS.fileBytes} bytes ou informa tamanho inválido. Nenhum conteúdo foi truncado.`);
      }
      if (!roles.has(path) && roles.size >= EXERCISM_SNAPSHOT_LIMITS.files) throw new Error(`A fonte excede o limite de ${EXERCISM_SNAPSHOT_LIMITS.files} arquivos; adapte o exercício manualmente.`);
      const fileRoles = roles.get(path) ?? new Set<Role>();
      fileRoles.add(role);
      roles.set(path, fileRoles);
    }
    async function capture(path: string): Promise<SourceFile> {
      const previous = captured.get(path);
      if (previous) return previous;
      const url = `https://raw.githubusercontent.com/exercism/${runtime}/${commitSha}/${encodedPath(path)}`;
      const read = await readText(url, EXERCISM_SNAPSHOT_LIMITS.fileBytes, controller.signal);
      if (totalBytes + read.bytes > EXERCISM_SNAPSHOT_LIMITS.totalBytes) throw new Error(`O snapshot excede ${EXERCISM_SNAPSHOT_LIMITS.totalBytes} bytes. Nenhum arquivo foi truncado; é necessária uma adaptação manual.`);
      totalBytes += read.bytes;
      const file: SourceFile = { path, url, roles: [...(roles.get(path) ?? [])], ...read };
      captured.set(path, file);
      return file;
    }

    const rootLicenses = [...tree.values()].filter((entry) => !entry.path.includes("/") && licenseName.test(entry.path)).sort((left, right) => (left.path === "LICENSE" ? -1 : right.path === "LICENSE" ? 1 : left.path.localeCompare(right.path)));
    if (!rootLicenses.length) throw new Error("Não foi encontrada uma licença de origem no commit fixado.");
    const applicableAncestors = new Set(["", "exercises/", "exercises/practice/"]);
    for (const { path } of tree.values()) {
      const lastSlash = path.lastIndexOf("/");
      const directory = lastSlash === -1 ? "" : path.slice(0, lastSlash + 1);
      const basename = path.slice(lastSlash + 1);
      if (!applicableAncestors.has(directory) && !path.startsWith(prefix)) continue;
      if (licenseName.test(basename)) requireFile(path, "license");
      else if (noticeName.test(basename)) requireFile(path, "notice");
    }
    // Confirm all applicable licenses before downloading instructions or code.
    for (const [path, fileRoles] of roles) {
      const file = await capture(path);
      if (fileRoles.has("license") && !confirmsMitLicenseText(file.content)) {
        throw new Error(`A licença de ${path} não foi confirmada como MIT. A importação exige revisão manual; a licença raiz não substitui licenças específicas.`);
      }
      if (fileRoles.has("notice") && !confirmsMitLicenseText(file.content) && ambiguousLegalTerms(file.content)) {
        throw new Error(`O aviso legal de ${path} contém termos adicionais ou ambíguos. A importação exige revisão manual, mesmo com licença MIT na raiz.`);
      }
    }
    const licenseFile = captured.get(rootLicenses[0]!.path)!;
    const metadataPath = `${prefix}.meta/config.json`;
    requireFile(metadataPath, "metadata");
    const metadata = json<{ authors?: unknown; contributors?: unknown; files?: unknown }>((await capture(metadataPath)).content, metadataPath);
    const authors = attribution(metadata.authors, "autoria");
    const contributors = attribution(metadata.contributors, "contribuição");
    if (!metadata.files || typeof metadata.files !== "object" || Array.isArray(metadata.files)) throw new Error("A fonte não declara os arquivos necessários para uma importação completa.");
    const declared = metadata.files as Record<string, unknown>;
    for (const required of ["solution", "test"]) {
      if (!Array.isArray(declared[required]) || !(declared[required] as unknown[]).length) throw new Error(`A fonte não declara arquivos de ${required}; é necessária uma adaptação manual.`);
    }
    for (const [group, paths] of Object.entries(declared)) {
      if (!Array.isArray(paths)) throw new Error(`A lista de arquivos ${group} da fonte é inválida.`);
      const role: Role = group === "solution" ? "solution" : group === "test" ? "test" : group === "example" || group === "exemplar" ? "example" : "support";
      for (const path of paths) requireFile(`${prefix}${sourcePath(path)}`, role);
    }
    const instructionsPath = `${prefix}.docs/instructions.md`;
    requireFile(instructionsPath, "instructions");
    for (const { path } of tree.values()) {
      if (path === `${prefix}.docs/instructions.append.md` || path === `${prefix}.docs/introduction.md`) requireFile(path, "instructions");
    }
    const pending = [...roles.keys()].filter((path) => !captured.has(path)).sort();
    // Bounded concurrency avoids opening one connection per upstream file.
    for (let offset = 0; offset < pending.length; offset += 4) await Promise.all(pending.slice(offset, offset + 4).map(capture));
    const files = [...captured.values()].map((file) => ({ ...file, roles: [...roles.get(file.path)!] })).sort((left, right) => left.path.localeCompare(right.path));
    const combine = (role: Role) => {
      const selected = files.filter((file) => file.roles.includes(role));
      if (role === "instructions") {
        const order = [`${prefix}.docs/introduction.md`, instructionsPath, `${prefix}.docs/instructions.append.md`];
        selected.sort((left, right) => order.indexOf(left.path) - order.indexOf(right.path));
      }
      return selected.map((file) => selected.length > 1 ? `=== ${file.path} ===\n${file.content}` : file.content).join("\n\n");
    };
    return {
      sourceName: "Exercism", sourceUrl: `https://github.com/exercism/${runtime}/tree/main/exercises/practice/${slug}`,
      repositoryUrl: `https://github.com/exercism/${runtime}`,
      licenseUrl: `https://github.com/exercism/${runtime}/blob/${commitSha}/${encodedPath(licenseFile.path)}`,
      licenseSpdx: "MIT", licenseText: licenseFile.content,
      title: slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "), slug, runtime,
      instructions: combine("instructions"), starterCode: combine("solution"), sourceTests: combine("test"),
      authors, contributors, commitSha, retrievedAt: new Date().toISOString(), snapshot: { schemaVersion: 1, totalBytes, files }
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("A captura completa do Exercism excedeu 45 segundos. Nenhum snapshot parcial será importado.");
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
