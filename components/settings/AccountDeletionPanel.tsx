"use client";

import { useActionState } from "react";

import {
  ACCOUNT_DELETION_INITIAL_STATE,
  type AccountDeletionActionState,
} from "@/lib/types/account";

export type DeleteAccountAction = (
  state: AccountDeletionActionState,
  formData: FormData,
) => Promise<AccountDeletionActionState>;

export function AccountDeletionPanel({
  confirmationLabel,
  deleteAccountAction,
}: Readonly<{
  confirmationLabel: string;
  deleteAccountAction: DeleteAccountAction;
}>) {
  const [state, formAction, isPending] = useActionState(
    deleteAccountAction,
    ACCOUNT_DELETION_INITIAL_STATE,
  );

  return (
    <section className="border border-line bg-background p-5 sm:p-6 md:col-span-2">
      <h2 className="text-xl leading-tight">Delete account</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid max-w-2xl gap-3 text-sm leading-6 text-muted-readable">
          <p>
            Account deletion removes the signed-in Cadence account and its
            hosted behavior records. This cannot be undone.
          </p>
          <p>
            Download a BehaviorLog or full JSON backup from Export before
            deleting the account.
          </p>
          <p>
            <a
              href="/export"
              className="underline decoration-current underline-offset-4"
            >
              Open Export
            </a>
          </p>
        </div>

        <form action={formAction} className="grid gap-3 border border-line bg-surface p-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
            <input
              type="checkbox"
              name="confirm_export"
              value="yes"
              className="mt-0.5 h-5 w-5 accent-foreground"
            />
            <span>I downloaded an export or do not need one.</span>
          </label>

          <label
            htmlFor="delete-account-confirmation"
            className="text-sm leading-6 text-foreground"
          >
            Type {confirmationLabel} to confirm
          </label>
          <input
            id="delete-account-confirmation"
            name="confirmation"
            type="text"
            autoComplete="off"
            className="min-h-11 border border-line bg-background px-3 py-2 text-base"
          />

          <button
            type="submit"
            disabled={isPending}
            className="min-h-11 border border-line bg-accent px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-foreground disabled:bg-background disabled:text-muted-readable"
          >
            {isPending ? "Deleting..." : "Delete account"}
          </button>

          {state.message ? (
            <p className="border border-line bg-background px-3 py-2 text-sm leading-6 text-accent">
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
