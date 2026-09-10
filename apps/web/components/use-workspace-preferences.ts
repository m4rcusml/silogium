"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JudgeCase, Runtime } from "@silogium/core";
import { defaultWorkspacePreferences, normalizeWorkspacePreferences, readWorkspacePreferences, workspacePreferenceKey, writeWorkspacePreferences, type PreferenceStatus, type WorkspacePreferences } from "../lib/practice-preferences";

export function useWorkspacePreferences(actorId: string, problemId: string, version: number, runtime: Runtime, visibleCases: JudgeCase[]) {
  const key = workspacePreferenceKey(actorId, problemId, version, runtime);
  const fallback = useMemo(() => defaultWorkspacePreferences(JSON.stringify(visibleCases.slice(0, 1).map((test) => ({ ...test, id: `custom-${test.id}`, name: "Meu teste" })), null, 2)), [visibleCases]);
  const [state, setState] = useState<{ key: string; value: WorkspacePreferences; status: PreferenceStatus } | null>(null);
  const current = useRef(state);

  useEffect(() => {
    let restored: { value: WorkspacePreferences; status: PreferenceStatus };
    try { restored = readWorkspacePreferences(window.localStorage, key, fallback); }
    catch { restored = { value: fallback, status: "unavailable" }; }
    current.current = { key, ...restored };
    setState(current.current);
    // Never write defaults on mount or scope changes: another runtime's draft must survive.
  }, [key, fallback]);

  function update<K extends keyof WorkspacePreferences>(field: K, change: WorkspacePreferences[K] | ((previous: WorkspacePreferences[K]) => WorkspacePreferences[K])) {
    if (current.current?.key !== key) return;
    const previous = current.current.value;
    const requested = typeof change === "function" ? (change as (previous: WorkspacePreferences[K]) => WorkspacePreferences[K])(previous[field]) : change;
    const value = normalizeWorkspacePreferences({ ...previous, [field]: requested }, previous);
    let status: PreferenceStatus;
    try { status = writeWorkspacePreferences(window.localStorage, key, value); }
    catch { status = "unavailable"; }
    current.current = { key, value, status };
    setState(current.current);
  }

  return { values: state?.key === key ? state.value : fallback, ready: state?.key === key, status: state?.key === key ? state.status : "loading" as const, update };
}
