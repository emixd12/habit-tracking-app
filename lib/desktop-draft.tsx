"use client";

import { useEffect, type ReactNode } from "react";
import { flushSync, useFormStatus } from "react-dom";

const DISCARD_EVENT = "cadence:discard-desktop-drafts";
const DRAFT_SELECTOR = '[data-desktop-unsaved-draft="true"]';
const PENDING_SELECTOR = '[data-desktop-pending-write="true"]';

export function hasUnsavedDesktopDrafts(root?: ParentNode): boolean {
  const target = root ?? (typeof document === "undefined" ? null : document);
  return Boolean(target?.querySelector(DRAFT_SELECTOR));
}

export function hasPendingDesktopWrites(root?: ParentNode): boolean {
  const target = root ?? (typeof document === "undefined" ? null : document);
  return Boolean(target?.querySelector(PENDING_SELECTOR));
}

export function discardUnsavedDesktopDrafts(target?: EventTarget): boolean {
  if (hasPendingDesktopWrites()) return false;
  const eventTarget = target ?? (typeof window === "undefined" ? null : window);
  flushSync(() => eventTarget?.dispatchEvent(new Event(DISCARD_EVENT)));
  return true;
}

export function DesktopDraftGuard({
  dirty = false,
  pending = false,
  onDiscard,
}: Readonly<{
  dirty?: boolean;
  pending?: boolean;
  onDiscard?: () => void;
}>) {
  useEffect(() => {
    if (!onDiscard) return;
    const discard = () => onDiscard();
    window.addEventListener(DISCARD_EVENT, discard);
    return () => window.removeEventListener(DISCARD_EVENT, discard);
  }, [onDiscard]);

  return (
    <span
      hidden
      data-desktop-unsaved-draft={dirty || pending ? "true" : undefined}
      data-desktop-pending-write={pending ? "true" : undefined}
    />
  );
}

export function DesktopFormDraftGuard({
  children,
  dirty,
  onDiscard,
}: Readonly<{
  children?: ReactNode;
  dirty: boolean;
  onDiscard: () => void;
}>) {
  const { pending } = useFormStatus();
  return (
    <>
      <DesktopDraftGuard dirty={dirty} pending={pending} onDiscard={onDiscard} />
      {children}
    </>
  );
}
