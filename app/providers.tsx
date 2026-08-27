"use client";

import { PopmeltProvider } from "@popmelt.com/core";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();

  return <PopmeltProvider navigate={router.push}>{children}</PopmeltProvider>;
}
