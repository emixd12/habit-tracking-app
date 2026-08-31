import { RefreshProvider, RuntimeLink, useRefresh } from "@cadence/ui/runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WebRuntimeProvider } from "../components/layout/WebRuntimeProvider";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

describe("UI refresh runtime", () => {
  it("keeps web links as Next links with the same destination and accessible name", () => {
    const html = renderToStaticMarkup(
      <WebRuntimeProvider>
        <RuntimeLink
          href="/behaviors?range=30"
          scroll={false}
          aria-label="Last 30 days"
        >
          30 days
        </RuntimeLink>
      </WebRuntimeProvider>,
    );
    expect(html).toContain('href="/behaviors?range=30"');
    expect(html).toContain('aria-label="Last 30 days"');
    expect(html).not.toContain("scroll=");
  });

  it("passes the local refresh callback without a Next router", () => {
    const localRefresh = vi.fn();
    let refresh: () => void = () => {
      throw new Error("Probe did not render");
    };
    function Probe() {
      refresh = useRefresh();
      return <span>Local Timeline</span>;
    }
    expect(
      renderToStaticMarkup(
        <RefreshProvider onRefresh={localRefresh}>
          <Probe />
        </RefreshProvider>,
      ),
    ).toBe("<span>Local Timeline</span>");
    refresh();
    expect(localRefresh).toHaveBeenCalledOnce();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("connects the web provider to router.refresh without adding markup", () => {
    let refresh: () => void = () => {
      throw new Error("Probe did not render");
    };
    function Probe() {
      refresh = useRefresh();
      return <span>Web Timeline</span>;
    }
    expect(
      renderToStaticMarkup(
        <WebRuntimeProvider>
          <Probe />
        </WebRuntimeProvider>,
      ),
    ).toBe("<span>Web Timeline</span>");
    refresh();
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("rejects an unconfigured runtime instead of silently skipping refresh", () => {
    function Probe() {
      useRefresh();
      return null;
    }
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "requires a RefreshProvider",
    );
  });
});
