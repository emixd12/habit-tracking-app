"use client";

import { useCallback, useState } from "react";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import { dispatchBehaviorCreated } from "@/components/behaviors/behavior-events";
import type {
  BehaviorActionState,
  BehaviorFormAction,
  CategoryOption,
} from "@/lib/types/behavior";

type BehaviorCreateSectionProps = Readonly<{
  action: BehaviorFormAction;
  categories: CategoryOption[];
  defaultTimezone: string;
  defaultOpen: boolean;
}>;

export function BehaviorCreateSection({
  action,
  categories,
  defaultTimezone,
  defaultOpen,
}: BehaviorCreateSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [successMessage, setSuccessMessage] = useState("");
  const [formKey, setFormKey] = useState(0);

  const handleSuccess = useCallback((state: BehaviorActionState) => {
    setSuccessMessage(state.message);

    if (state.behavior) {
      dispatchBehaviorCreated(state.behavior);
    }

    setIsOpen(false);
    setFormKey((key) => key + 1);
  }, []);

  return (
    <section id="create-behavior" className="scroll-mt-20 border-b border-line">
      <details
        className="group"
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;

          setIsOpen(nextOpen);

          if (nextOpen) {
            setSuccessMessage("");
          }
        }}
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center py-4 text-xl leading-tight text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="mr-[0.8125rem] h-0 w-0 shrink-0 -translate-y-0.5 border-y-[0.25rem] border-l-[0.375rem] border-y-transparent border-l-muted-readable transition-transform duration-200 group-open:rotate-90"
          />
          <span
            className="block min-w-0 whitespace-nowrap"
            style={{
              flex: isOpen ? "1 1 auto" : "0 1 auto",
              backgroundImage: "linear-gradient(currentColor, currentColor)",
              backgroundPosition: "0 100%",
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 1px",
              paddingBottom: "4px",
            }}
          >
            Create behavior
          </span>
        </summary>
        <div className="py-5 pl-[1.1875rem]">
          <BehaviorForm
            key={formKey}
            mode="create"
            action={action}
            categories={categories}
            defaultTimezone={defaultTimezone}
            onSuccess={handleSuccess}
          />
        </div>
      </details>

      {successMessage ? (
        <p
          className="mb-4 border-t border-line pt-3 text-sm leading-6 text-foreground"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}
    </section>
  );
}
