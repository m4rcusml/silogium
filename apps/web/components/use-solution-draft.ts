"use client";

import { useEffect, useRef, useState } from "react";
import type { ProblemDefinition, Runtime } from "@silogium/core";

export function useSolutionDraft(problem: ProblemDefinition, actorId: string) {
  const initial = Object.fromEntries(problem.runtimes.map((item) => [item.language, item.starterCode])) as Record<Runtime, string>;
  const [sources, setSources] = useState(initial);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "unavailable">("loading");
  const current = useRef(initial);
  const key = (runtime: Runtime) => `silogium:draft:${actorId}:${problem.id}:${problem.version}:${runtime}`;

  useEffect(() => {
    const restored = { ...initial };
    try {
      for (const { language } of problem.runtimes) {
        const saved = localStorage.getItem(key(language));
        // Only the local demo may inherit pre-account drafts from the original prototype.
        const legacy = actorId === "local-demo" ? localStorage.getItem(`silogium:draft:${problem.id}:${problem.version}:${language}`) : null;
        restored[language] = saved ?? legacy ?? initial[language];
      }
      setSaveState("saved");
    } catch {
      setSaveState("unavailable");
    }
    current.current = restored;
    setSources(restored);
    setReady(true);
    // The parent keys the workspace by owner, problem and version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSource(runtime: Runtime, source: string) {
    if (!ready) return;
    current.current = { ...current.current, [runtime]: source };
    setSources(current.current);
    try {
      // Persist even empty drafts immediately so a reload cannot restore deleted code.
      localStorage.setItem(key(runtime), source);
      setSaveState("saved");
    } catch {
      setSaveState("unavailable");
    }
  }

  return { sources, updateSource, ready, saveState };
}
