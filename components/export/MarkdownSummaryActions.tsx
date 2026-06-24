"use client";

import { useState } from "react";
import { Clipboard, Download } from "lucide-react";

type CopyStatus = "idle" | "copied" | "failed";

export function MarkdownSummaryActions({
  summary,
  fileName,
}: Readonly<{
  summary: string;
  fileName: string;
}>) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function handleDownload() {
    const blob = new Blob([summary], {
      type: "text/markdown;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="product-action product-action-secondary min-h-11 gap-2 py-2 text-sm font-bold"
      >
        <Clipboard aria-hidden="true" size={18} strokeWidth={2} />
        Copy summary
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="product-action product-action-primary min-h-11 gap-2 py-2 text-sm font-bold"
      >
        <Download aria-hidden="true" size={18} strokeWidth={2} />
        Download .md
      </button>
      <span aria-live="polite" className="text-sm font-bold text-muted-readable">
        {copyStatus === "copied" ? "Copied" : null}
        {copyStatus === "failed" ? "Copy unavailable" : null}
      </span>
    </div>
  );
}
