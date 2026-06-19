"use client";

import { useCallback, useState } from "react";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import type {
  BehaviorFormAction,
  CategoryOption,
} from "@/lib/types/behavior";

type BehaviorCreateSectionProps = Readonly<{
  action: BehaviorFormAction;
  categories: CategoryOption[];
  defaultOpen: boolean;
}>;

export function BehaviorCreateSection({
  action,
  categories,
  defaultOpen,
}: BehaviorCreateSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [successMessage, setSuccessMessage] = useState("");
  const [formKey, setFormKey] = useState(0);

  const handleSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setIsOpen(false);
    setFormKey((key) => key + 1);
  }, []);

  return (
    <section className="border-b border-line">
      <details
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;

          setIsOpen(nextOpen);

          if (nextOpen) {
            setSuccessMessage("");
          }
        }}
      >
        <summary className="cursor-pointer py-4 text-xl font-bold leading-tight marker:text-muted-readable hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Create behavior
        </summary>
        <div className="border-t border-line py-5">
          <BehaviorForm
            key={formKey}
            mode="create"
            action={action}
            categories={categories}
            onSuccess={handleSuccess}
          />
        </div>
      </details>

      {successMessage ? (
        <p
          className="mb-4 border border-line px-3 py-2 text-sm leading-6 text-foreground"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}
    </section>
  );
}
