"use client";

import { useEffect, useRef } from "react";

type FocusTarget = Pick<HTMLElement, "focus">;

export function focusAccountDeletedNotice(target: FocusTarget | null) {
  target?.focus({ preventScroll: true });
}

export function AccountDeletedNotice() {
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    focusAccountDeletedNotice(noticeRef.current);
  }, []);

  return (
    <p
      ref={noticeRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      tabIndex={-1}
      className="max-w-[18rem] text-sm leading-6 text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Account deleted.
    </p>
  );
}
