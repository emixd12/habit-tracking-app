"use client";

import {
  LinkProvider,
  RefreshProvider,
  type RuntimeLinkProps,
} from "@cadence/ui/runtime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

export function WebRuntimeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <LinkProvider component={WebLink}>
      <RefreshProvider onRefresh={refresh}>{children}</RefreshProvider>
    </LinkProvider>
  );
}

function WebLink(props: RuntimeLinkProps) {
  return <Link {...props} />;
}
