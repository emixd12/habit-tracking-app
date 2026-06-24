"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

type NeedsDecisionDialogProps = Readonly<{
  title: string;
  occurrenceCount: number;
  children: ReactNode;
}>;

export function NeedsDecisionDialog({
  title,
  occurrenceCount,
  children,
}: NeedsDecisionDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const hasDecisions = occurrenceCount > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openDialog() {
    setIsOpen(true);
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      setIsOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={decisionButtonLabel(occurrenceCount)}
        onClick={openDialog}
        className={[
          "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-40 flex items-stretch justify-between border text-left transition-colors sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-[calc(100vw-2rem)]",
          hasDecisions
            ? "border-line bg-primary text-primary-foreground hover:bg-foreground"
            : "border-line bg-background text-foreground hover:bg-surface",
        ].join(" ")}
      >
        <span
          className="grid min-h-14 min-w-14 place-items-center px-3 text-2xl font-bold leading-none"
          aria-hidden="true"
        >
          {occurrenceCount}
        </span>
        <span className="grid min-h-14 flex-1 content-center px-3 py-2 sm:flex-none">
          <span className="text-sm font-bold leading-5">{title}</span>
          <span className="text-xs font-bold leading-5">
            {occurrenceCount} to decide
          </span>
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid bg-foreground/50 sm:place-items-center sm:p-4"
          onMouseDown={handleBackdropClick}
        >
          <section
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(920px,100%)] sm:border sm:border-line"
          >
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close Needs decision"
              title="Close"
              onClick={() => setIsOpen(false)}
              className="product-icon-action absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-10 min-h-11 min-w-11 shrink-0 bg-background sm:right-3 sm:top-3 sm:min-h-10 sm:min-w-10"
            >
              <X aria-hidden="true" size={18} strokeWidth={2.5} />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              {children}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function decisionButtonLabel(count: number): string {
  if (count === 1) {
    return "Open Needs decision, 1 prior unresolved occurrence";
  }

  return `Open Needs decision, ${count} prior unresolved occurrences`;
}
