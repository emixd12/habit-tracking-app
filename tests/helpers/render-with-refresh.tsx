import {
  LinkProvider,
  RefreshProvider,
  type RuntimeLinkProps,
} from "@cadence/ui/runtime";
import type { ReactNode } from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";

export function renderToStaticMarkup(node: ReactNode): string {
  return renderMarkup(
    <LinkProvider component={TestLink}>
      <RefreshProvider onRefresh={() => undefined}>{node}</RefreshProvider>
    </LinkProvider>,
  );
}

function TestLink({ scroll: _scroll, ...props }: RuntimeLinkProps) {
  void _scroll;
  return <a {...props} />;
}
