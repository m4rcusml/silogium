"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_CATALOG_FILTERS, normalizeCatalogFilters, readCatalogPreferences, readCatalogUrl, writeCatalogPreferences, writeCatalogUrl, type CatalogFilters, type PreferenceStatus } from "../lib/practice-preferences";

export function useCatalogFilters(actorId?: string) {
  const searchParams = useSearchParams();
  const serializedSearch = searchParams.toString();
  const [filters, setFilters] = useState<CatalogFilters>({ ...DEFAULT_CATALOG_FILTERS });
  const [status, setStatus] = useState<PreferenceStatus | "loading">("loading");
  const current = useRef({ ...DEFAULT_CATALOG_FILTERS });
  const scope = useRef<string | undefined>(undefined);
  const hydrated = useRef(false);
  const lastUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    const actualSearch = new URLSearchParams(window.location.search).toString();
    // A previous effect may already have restored the cached URL in this commit.
    if (serializedSearch !== actualSearch) return;
    const initialize = !hydrated.current || scope.current !== actorId;
    if (!initialize && lastUrl.current === actualSearch) return;
    scope.current = actorId;
    const fromUrl = readCatalogUrl(new URLSearchParams(window.location.search));
    let restored = { value: { ...DEFAULT_CATALOG_FILTERS }, status: "saved" as PreferenceStatus };
    if (initialize && actorId) {
      try { restored = readCatalogPreferences(window.localStorage, actorId); }
      catch { restored.status = "unavailable"; }
    }
    current.current = fromUrl ?? restored.value;
    setFilters(current.current);
    setStatus(restored.status);
    hydrated.current = true;
    // Make restored filters explicit so reload/back/share has one authoritative snapshot.
    const url = writeCatalogUrl(new URL(window.location.href), current.current);
    lastUrl.current = url.searchParams.toString();
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [actorId, serializedSearch]);

  function update(change: Partial<CatalogFilters> | ((previous: CatalogFilters) => CatalogFilters)) {
    if (status === "loading" || scope.current !== actorId) return;
    const next = normalizeCatalogFilters(typeof change === "function" ? change(current.current) : { ...current.current, ...change });
    current.current = next;
    setFilters(next);
    const url = writeCatalogUrl(new URL(window.location.href), next);
    lastUrl.current = url.searchParams.toString();
    window.history.replaceState(window.history.state, "", url);
    if (actorId) {
      try { setStatus(writeCatalogPreferences(window.localStorage, actorId, next)); }
      catch { setStatus("unavailable"); }
    }
  }

  return { filters, update, status, urlView: searchParams.get("view") === "activity" ? "activity" as const : "catalog" as const };
}
