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
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const [isOpen, setIsOpen] = useState(false);
  const hasDecisions = occurrenceCount > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
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
          "fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-stretch border text-left transition-colors sm:bottom-6 sm:right-6",
          hasDecisions
            ? "border-line bg-primary text-primary-foreground hover:bg-foreground"
            : "border-line bg-background text-foreground hover:bg-surface",
        ].join(" ")}
      >
        <span
          className="grid min-h-14 min-w-14 place-items-center border-r border-line px-3 text-2xl font-bold leading-none"
          aria-hidden="true"
        >
          {occurrenceCount}
        </span>
        <span className="grid min-h-14 content-center px-3 py-2">
          <span className="text-sm font-bold leading-5">{title}</span>
          <span className="text-xs font-bold leading-5">
            {occurrenceCount} to decide
          </span>
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4"
          onMouseDown={handleBackdropClick}
        >
          <section
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="grid max-h-[calc(100dvh-2rem)] w-[min(920px,100%)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-line bg-background text-foreground"
          >
            <header className="border-b border-line bg-background p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p
                    id={descriptionId}
                    className="text-sm font-bold text-muted-readable"
                  >
                    Prior unresolved
                  </p>
                  <h2
                    id={titleId}
                    className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl"
                  >
                    {title}
                  </h2>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close Needs decision"
                  title="Close"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center border border-line bg-background text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <X aria-hidden="true" size={18} strokeWidth={2.5} />
                </button>
              </div>

              <p className="mt-3 text-sm font-bold text-muted-readable">
                {occurrenceCount} to decide
              </p>
            </header>

            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
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
