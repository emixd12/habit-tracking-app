"use client";

import {
  createContext,
  createElement,
  useContext,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";

const RefreshContext = createContext<(() => void) | null>(null);
export type RuntimeLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  scroll?: boolean;
};
const LinkContext = createContext<ComponentType<RuntimeLinkProps> | null>(null);

export function LinkProvider({
  component,
  children,
}: Readonly<{
  component: ComponentType<RuntimeLinkProps>;
  children: ReactNode;
}>) {
  return (
    <LinkContext.Provider value={component}>{children}</LinkContext.Provider>
  );
}

export function RuntimeLink(props: RuntimeLinkProps) {
  const LinkComponent = useContext(LinkContext);
  if (!LinkComponent) throw new Error("Cadence UI requires a LinkProvider.");
  return createElement(LinkComponent, props);
}

export function RefreshProvider({
  onRefresh,
  children,
}: Readonly<{ onRefresh: () => void; children: ReactNode }>) {
  return (
    <RefreshContext.Provider value={onRefresh}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh(): () => void {
  const refresh = useContext(RefreshContext);
  if (!refresh) throw new Error("Cadence UI requires a RefreshProvider.");
  return refresh;
}
