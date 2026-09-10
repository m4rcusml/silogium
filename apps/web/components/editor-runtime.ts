import type { BeforeMount, Monaco } from "@monaco-editor/react";

type TypeScriptDefaults = Monaco["languages"]["typescript"]["typescriptDefaults"];
type CompilerOptions = ReturnType<TypeScriptDefaults["getCompilerOptions"]>;
type Registration = { content: string; dispose(): void };

const STDIO_TYPES_URI = "file:///silogium/typings/node-stdio.d.ts";
const STDIO_TYPES = `/**
 * Minimal Node.js stdio declarations for Silogium starters, not the complete Node API.
 * Only UTF-8 reads are described here. The judge runs the real runtime.
 */
declare module "node:fs" {
  /** Reads a file or descriptor (0 is stdin) as UTF-8 text. */
  export function readFileSync(
    path: string | number,
    options: "utf8" | "utf-8" | { encoding: "utf8" | "utf-8"; flag?: string }
  ): string;
}
`;

// Monaco's public enum stops at ES2020 before jumping to ESNext. Its bundled
// TS worker supports ES2022=9; use that stable target instead of opting into
// future ESNext features that the judge's Node 22 runtime might not implement.
const ES2022 = 9 as NonNullable<CompilerOptions["target"]>;

// Keep one library per Monaco language service across editor mounts and HMR.
// Replacements dispose only our previous registration, never unrelated extra libs.
const runtimeState = globalThis as typeof globalThis & {
  __silogiumEditorStdioLibraries?: WeakMap<TypeScriptDefaults, Registration>;
};
const libraries = runtimeState.__silogiumEditorStdioLibraries ??= new WeakMap<TypeScriptDefaults, Registration>();

/** Editor-only assistance; it neither executes code nor changes judge validation. */
export const configureEditorRuntime: BeforeMount = (monaco) => {
  const typescript = monaco.languages.typescript;
  const defaults = typescript.typescriptDefaults;
  defaults.setCompilerOptions({
    ...defaults.getCompilerOptions(),
    target: ES2022,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    // Preserve existing standard libraries and globals such as console. This
    // adapter does not attempt to model the complete Node environment.
    noEmit: true
  });
  // Keep syntax and semantic diagnostics intact. Unsupported Node APIs may still
  // need declarations; silently accepting every module would hide actual mistakes.
  const previous = libraries.get(defaults);
  if (previous?.content === STDIO_TYPES && defaults.getExtraLibs()[STDIO_TYPES_URI]?.content === STDIO_TYPES) return;
  previous?.dispose();
  const registration = defaults.addExtraLib(STDIO_TYPES, STDIO_TYPES_URI);
  libraries.set(defaults, { content: STDIO_TYPES, dispose: () => registration.dispose() });
};
