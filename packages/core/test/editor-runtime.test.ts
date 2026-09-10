import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import type { Monaco } from "@monaco-editor/react";
import { configureEditorRuntime } from "../../../apps/web/components/editor-runtime.js";

function editorLanguageService() {
  let options: Record<string, unknown> = { strict: true, allowNonTsExtensions: true, lib: ["es2022", "dom"] };
  const extraLibs: Record<string, { content: string; version: number }> = { "file:///unrelated.d.ts": { content: "declare const otherLibrary: number;", version: 1 } };
  const dispose = vi.fn();
  const defaults = {
    getCompilerOptions: () => options,
    setCompilerOptions: vi.fn((next: Record<string, unknown>) => { options = next; }),
    getExtraLibs: () => extraLibs,
    setDiagnosticsOptions: vi.fn(),
    setExtraLibs: vi.fn(),
    addExtraLib: vi.fn((content: string, uri: string) => {
      extraLibs[uri] = { content, version: 1 };
      return { dispose: () => { dispose(); delete extraLibs[uri]; } };
    })
  };
  const monaco = { languages: { typescript: { typescriptDefaults: defaults, ModuleKind: { ESNext: 99 }, ModuleResolutionKind: { NodeJs: 2 } } } } as unknown as Monaco;
  return { monaco, defaults, extraLibs, dispose };
}

/** Compile in-memory editor input against the same bounded declarations; no source file is written. */
function diagnostics(source: string) {
  const editor = editorLanguageService();
  configureEditorRuntime(editor.monaco);
  const declaration = editor.defaults.addExtraLib.mock.calls[0]![0];
  const options: ts.CompilerOptions = { ...editor.defaults.getCompilerOptions(), types: [], skipLibCheck: false } as ts.CompilerOptions;
  // Monaco accepts short lib names; the standalone compiler host uses file names.
  options.lib = ["lib.es2022.d.ts", "lib.dom.d.ts"];
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) => {
    if (name === "solution.ts") return ts.createSourceFile(name, source, languageVersion, true);
    if (name === "node-stdio.d.ts") return ts.createSourceFile(name, declaration, languageVersion, true);
    return originalGetSourceFile(name, languageVersion, ...rest);
  };
  return ts.getPreEmitDiagnostics(ts.createProgram(["solution.ts", "node-stdio.d.ts"], options, host));
}

describe("Node stdio editor configuration", () => {
  it("keeps diagnostics and unrelated libraries while adding one typed UTF-8 module", () => {
    const { monaco, defaults, extraLibs } = editorLanguageService();
    configureEditorRuntime(monaco);
    expect(defaults.getCompilerOptions()).toMatchObject({ strict: true, allowNonTsExtensions: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs, lib: ["es2022", "dom"], noEmit: true });
    expect(defaults.setDiagnosticsOptions).not.toHaveBeenCalled();
    expect(defaults.setExtraLibs).not.toHaveBeenCalled();
    expect(defaults.addExtraLib).toHaveBeenCalledTimes(1);
    const [source, uri] = defaults.addExtraLib.mock.calls[0]!;
    expect(uri).toBe("file:///silogium/typings/node-stdio.d.ts");
    expect(source).toContain('declare module "node:fs"');
    expect(source).not.toMatch(/\bany\b|declare module ["']\*/);
    expect(extraLibs["file:///unrelated.d.ts"]?.content).toContain("otherLibrary");
  });

  it("is idempotent across mounts and disposes stale registration before replacing it", () => {
    const { monaco, defaults, extraLibs, dispose } = editorLanguageService();
    configureEditorRuntime(monaco); configureEditorRuntime(monaco);
    expect(defaults.addExtraLib).toHaveBeenCalledTimes(1);
    const uri = defaults.addExtraLib.mock.calls[0]![1];
    delete extraLibs[uri];
    configureEditorRuntime(monaco);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(defaults.addExtraLib).toHaveBeenCalledTimes(2);
    expect(Object.keys(extraLibs)).toHaveLength(2);
  });

  it("accepts real UTF-8 stdin and modern ECMAScript operations", () => {
    const errors = diagnostics(`import { readFileSync } from "node:fs";
      const text: string = readFileSync(0, "utf8");
      const count = new Map<string, number>();
      for (const value of text.trim().split(/\\s+/)) count.set(value, (count.get(value) ?? 0) + 1);
      console.log([...count.values()].at(-1) ?? 0);
      console.warn("preserved existing console typings");
      console.error(readFileSync(0, { encoding: "utf-8" }).replaceAll("\\r", ""));`);
    expect(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))).toEqual([]);
  });

  it("still reports type mistakes, unknown imports and invalid encoding", () => {
    const errors = diagnostics(`import { readFileSync, readImaginaryFile } from "node:fs";
      import nonexistent from "definitely-not-a-package";
      const count: number = readFileSync(0, "utf8");
      readFileSync(0, "not-an-encoding");`);
    const codes = errors.map((error) => error.code);
    expect(codes).toContain(2305); // nonexistent node:fs member
    expect(codes).toContain(2307); // unresolved external package
    expect(codes).toContain(2322); // string assigned to number
    expect(codes).toContain(2345); // invalid UTF-8 overload
  });
});
