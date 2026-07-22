"use client";

import { useState } from "react";

import { copyPromptText } from "@/lib/export-prompts";

type CopyStatus = "idle" | "copied" | "failed";

export function PromptCopyAction({
  prompt,
  templateTitle,
}: Readonly<{
  prompt: string;
  templateTitle: string;
}>) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  async function handleCopy() {
    const status = await copyPromptText(prompt, navigator.clipboard);
    setCopyStatus(status);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="product-action product-action-primary min-h-11 w-fit py-2 text-sm font-bold"
        aria-label={`Copy prompt: ${templateTitle}`}
      >
        Copy prompt
      </button>
      <span aria-live="polite" className="text-sm font-bold text-muted-readable">
        {copyStatus === "copied" ? "Copied" : null}
        {copyStatus === "failed" ? "Copy unavailable" : null}
      </span>
    </div>
  );
}
