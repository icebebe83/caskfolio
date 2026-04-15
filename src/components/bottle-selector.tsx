"use client";

import { useDeferredValue, useEffect, useState, type ReactNode } from "react";

import { bottleSearchText } from "@/lib/format";
import type { Bottle } from "@/lib/types";

export function BottleSelector({
  bottles,
  selectedBottle,
  onSelect,
  query,
  onQueryChange,
  emptyAction,
  inputId,
  loading = false,
}: {
  bottles: Bottle[];
  selectedBottle: Bottle | null;
  onSelect: (bottle: Bottle) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  emptyAction?: ReactNode;
  inputId?: string;
  loading?: boolean;
}) {
  const [internalQuery, setInternalQuery] = useState(selectedBottle?.name ?? "");
  const resolvedQuery = query ?? internalQuery;
  const deferredQuery = useDeferredValue(resolvedQuery);

  useEffect(() => {
    if (selectedBottle) {
      if (onQueryChange) {
        onQueryChange(selectedBottle.name);
      } else {
        setInternalQuery(selectedBottle.name);
      }
    }
  }, [onQueryChange, selectedBottle]);

  const filtered = bottles
    .filter((bottle) =>
      bottleSearchText(bottle).includes(deferredQuery.trim().toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        value={resolvedQuery}
        onChange={(event) => {
          if (onQueryChange) {
            onQueryChange(event.target.value);
          } else {
            setInternalQuery(event.target.value);
          }
        }}
        placeholder="Search bottle, brand, batch, or nickname"
        className="field w-full"
      />
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-[#e2ddd3] bg-[#f5f2ec] p-2">
        {filtered.map((bottle) => (
          <button
            key={bottle.id}
            type="button"
            onClick={() => onSelect(bottle)}
            className={`w-full rounded-2xl px-4 py-3 text-left transition ${
              selectedBottle?.id === bottle.id
                ? "bg-[#171717] text-white"
                : "bg-white text-ink hover:bg-[#fcfbf8]"
            }`}
          >
            <p className="font-medium">{bottle.name}</p>
            <p
              className={`text-xs uppercase tracking-[0.18em] ${
                selectedBottle?.id === bottle.id ? "text-shell/70" : "text-ink/45"
              }`}
            >
              {[bottle.brand, bottle.category, bottle.batch].filter(Boolean).join(" · ")}
            </p>
          </button>
        ))}
        {!filtered.length ? (
          <div className="space-y-3 px-2 py-3">
            <p className="text-sm text-ink/50">
              {loading ? "Loading bottle archive..." : "No bottles matched your search."}
            </p>
            {!loading ? emptyAction : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
