"use client";

import { useActionState, useState } from "react";
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
  restoreAction: BehaviorFormAction;
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
  restoreAction,
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
            restoreAction={restoreAction}
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
            restoreAction={restoreAction}
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
        <div className="grid divide-y divide-line">{children}</div>
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
  restoreAction,
}: Readonly<{
  behavior: BehaviorView;
  categories: CategoryOption[];
  updateAction: BehaviorFormAction;
  archiveAction: BehaviorFormAction;
  restoreAction: BehaviorFormAction;
}>) {
  const [hasOpenedEdit, setHasOpenedEdit] = useState(false);

  return (
    <article className="bg-background">
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
            <SummaryItem label="Scheduled for" value={behavior.scheduleSummary} />
            <SummaryItem label="Category" value={behavior.categoryName} />
            <SummaryItem label="Schedule" value={behavior.recurrenceSummary} />
            <SummaryItem label="Reminders" value={behavior.reminderSummary} />
          </dl>
        </div>

        {behavior.active ? (
          <BehaviorStateForm
            behaviorId={behavior.id}
            action={archiveAction}
            buttonLabel="Archive"
            pendingLabel="Archiving..."
            hoverClassName="hover:bg-accent hover:text-background"
          />
        ) : (
          <BehaviorStateForm
            behaviorId={behavior.id}
            action={restoreAction}
            buttonLabel="Restore"
            pendingLabel="Restoring..."
            hoverClassName="hover:bg-primary hover:text-primary-foreground"
          />
        )}
      </div>

      {behavior.description ? (
        <div className="grid gap-1 px-5 pb-3 text-sm leading-6">
          <p className="font-bold text-foreground">Notes</p>
          <p className="max-w-[75ch] break-words text-muted-readable">
            {behavior.description}
          </p>
        </div>
      ) : null}

      <details
        onToggle={(event) => {
          if (event.currentTarget.open) {
            setHasOpenedEdit(true);
          }
        }}
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold marker:text-muted-readable hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Edit behavior
        </summary>
        {hasOpenedEdit ? (
          <div className="px-5 pb-5 pt-1">
            <BehaviorForm
              key={`${behavior.id}-${behavior.updatedAt}`}
              mode="edit"
              action={updateAction}
              categories={categories}
              behavior={behavior}
            />
          </div>
        ) : null}
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

function BehaviorStateForm({
  behaviorId,
  action,
  buttonLabel,
  pendingLabel,
  hoverClassName,
}: Readonly<{
  behaviorId: string;
  action: BehaviorFormAction;
  buttonLabel: string;
  pendingLabel: string;
  hoverClassName: string;
}>) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);

  return (
    <form action={formAction} className="grid justify-start gap-2 sm:justify-end">
      <input type="hidden" name="behavior_id" value={behaviorId} />
      <BehaviorStateButton
        label={buttonLabel}
        pendingLabel={pendingLabel}
        hoverClassName={hoverClassName}
      />
      {state.status === "error" && state.message ? (
        <p className="max-w-48 border border-line px-3 py-2 text-sm leading-6 text-accent">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function BehaviorStateButton({
  label,
  pendingLabel,
  hoverClassName,
}: Readonly<{
  label: string;
  pendingLabel: string;
  hoverClassName: string;
}>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "min-h-11 border border-line bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors disabled:bg-surface disabled:text-muted-readable",
        hoverClassName,
      ].join(" ")}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
