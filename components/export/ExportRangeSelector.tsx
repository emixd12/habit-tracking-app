"use client";

import { useState } from "react";

import type { ExportRangeKey, ExportRangeOption } from "@/lib/types/export";

type ExportRangeSelectorProps = Readonly<{
  rangeOptions: ExportRangeOption[];
  selectedRangeKey: ExportRangeKey;
  disabled?: boolean;
}>;

export function ExportRangeSelector({
  rangeOptions,
  selectedRangeKey,
  disabled = false,
}: ExportRangeSelectorProps) {
  const [activeRangeKey, setActiveRangeKey] = useState(selectedRangeKey);

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-bold text-muted-readable">Range</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {rangeOptions.map((option) => {
          const isActive = activeRangeKey === option.key;

          return (
            <label key={option.key} className="cursor-pointer">
              <input
                type="radio"
                name="range"
                value={option.key}
                checked={isActive}
                disabled={disabled}
                onChange={() => setActiveRangeKey(option.key)}
                className="peer sr-only"
              />
              <span
                className={[
                  "product-action min-h-11 py-2 text-sm font-bold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3",
                  isActive
                    ? "product-action-primary"
                    : "product-action-secondary",
                ].join(" ")}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
