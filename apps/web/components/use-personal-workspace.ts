"use client";
import { useCallback, useEffect, useState } from "react";
import type { PersonalAction, PersonalState } from "@silogium/core";

type PersonalResponse = { state: PersonalState; mode: "demo" | "persistent"; handle: string; problems: Array<{ id: string; slug: string; title: string; version: number }> };
export function usePersonalWorkspace() {
  const [data, setData] = useState<PersonalResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/personal", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Entre para usar sua biblioteca pessoal.");
      setData(body); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível carregar sua biblioteca."); }
  }, []);
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener("silogium:personal-changed", listener);
    return () => window.removeEventListener("silogium:personal-changed", listener);
  }, [refresh]);
  async function mutate(action: PersonalAction) {
    if (!data || busy) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/personal", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: data.state.revision, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      setData({ ...data, state: body.state }); window.dispatchEvent(new Event("silogium:personal-changed")); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar."); return false; }
    finally { setBusy(false); }
  }
  return { data, error, busy, mutate, refresh };
}
