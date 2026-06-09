"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { BehaviorForm } from "@/components/behaviors/BehaviorForm";
import type {
  BehaviorActionState,
  BehaviorFormAction,
  BehaviorView,
  CategoryOption,
} from "@/lib/types/behavior";

type BehaviorListProps = Readonly<{
  activeBehaviors: BehaviorView[];
  archivedBehaviors: BehaviorView[];
  categories: CategoryOption[];
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
}>;

const EMPTY_ACTION_STATE: BehaviorActionState = {
  status: "idle",
  message: "",
};

export function BehaviorList({
  activeBehaviors,
  archivedBehaviors,
  categories,
  updateAction,
  archiveAction,
}: BehaviorListProps) {
  return (
    <div className="grid gap-8">
      <BehaviorSection
        title="Active behaviors"
        emptyMessage="No active behaviors."
      >
        {activeBehaviors.map((behavior) => (
          <BehaviorCard
            key={behavior.id}
            behavior={behavior}
            categories={categories}
            updateAction={updateAction}
            archiveAction={archiveAction}
          />
        ))}
      </BehaviorSection>

      <BehaviorSection
        title="Archived behaviors"
        emptyMessage="No archived behaviors."
      >
        {archivedBehaviors.map((behavior) => (
          <BehaviorCard
            key={behavior.id}
            behavior={behavior}
            categories={categories}
            updateAction={updateAction}
            archiveAction={archiveAction}
          />
        ))}
      </BehaviorSection>
    </div>
  );
}

function BehaviorSection({
  title,
  emptyMessage,
  children,
}: Readonly<{
  title: string;
  emptyMessage: string;
  children: React.ReactNode;
}>) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="grid gap-4">
      <div className="border-b border-line pb-3">
        <h2 className="text-2xl font-bold leading-tight">{title}</h2>
      </div>

      {hasChildren ? (
        <div className="grid gap-4">{children}</div>
      ) : (
        <p className="border border-line bg-surface p-5 text-base leading-7 text-muted-readable">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function BehaviorCard({
  behavior,
  categories,
  updateAction,
  archiveAction,
}: Readonly<{
  behavior: BehaviorView;
  categories: CategoryOption[];
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
}>) {
  return (
    <article className="border border-line bg-background">
      <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold leading-tight">{behavior.title}</h3>
            {!behavior.active ? (
              <span className="border border-line bg-surface px-2 py-1 text-xs font-bold">
                Archived
              </span>
            ) : null}
          </div>

          <dl className="mt-4 grid gap-2 text-sm leading-6 text-muted-readable sm:grid-cols-2">
            <SummaryItem label="Schedule times" value={behavior.scheduleSummary} />
            <SummaryItem label="Category" value={behavior.categoryName} />
            <SummaryItem label="Schedule" value={behavior.recurrenceSummary} />
            <SummaryItem label="Reminders" value={behavior.reminderSummary} />
          </dl>
        </div>

        {behavior.active ? (
          <ArchiveBehaviorForm
            behaviorId={behavior.id}
            action={archiveAction}
          />
        ) : null}
      </div>

      {behavior.description ? (
        <p className="border-t border-line px-5 py-4 text-sm leading-6 text-muted-readable">
          {behavior.description}
        </p>
      ) : null}

      <details className="border-t border-line">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold hover:bg-surface">
          Edit behavior
        </summary>
        <div className="border-t border-line p-5">
          <BehaviorForm
            key={`${behavior.id}-${behavior.updatedAt}`}
            mode="edit"
            action={updateAction}
            categories={categories}
            behavior={behavior}
          />
        </div>
      </details>
    </article>
  );
}

function SummaryItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="min-w-0">
      <dt className="font-bold text-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function ArchiveBehaviorForm({
  behaviorId,
  action,
}: Readonly<{
  behaviorId: string;
  action: BehaviorFormAction;
}>) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="grid justify-start gap-2 sm:justify-end">
      <input type="hidden" name="behavior_id" value={behaviorId} />
      <ArchiveButton />
      {state.status === "error" && state.message ? (
        <p className="max-w-48 border border-line px-3 py-2 text-sm leading-6 text-accent">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ArchiveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 border border-line bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-accent hover:text-background disabled:bg-surface disabled:text-muted-readable"
    >
      {pending ? "Archiving..." : "Archive"}
    </button>
  );
}
