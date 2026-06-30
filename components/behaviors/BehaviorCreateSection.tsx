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
        <summary className="product-disclosure-trigger flex min-h-12 items-center py-4 text-xl leading-tight text-foreground">
          <span
            aria-hidden="true"
            className="product-disclosure-indicator"
          />
          <span
            className="product-disclosure-trigger-label"
            style={{
              flex: isOpen ? "1 1 auto" : "0 1 auto",
            }}
          >
            Create behavior
          </span>
        </summary>
        <div className="py-5 pl-4">
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
