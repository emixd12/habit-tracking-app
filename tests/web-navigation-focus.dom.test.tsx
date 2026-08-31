// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppShell } from "../components/layout/AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/timeline", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
// This DOM test needs no Next image loader or network requests.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (props: ComponentProps<"img">) => <img {...props} alt={props.alt ?? ""} /> }));

it("restores the web drawer launcher after a pointer click that started with body focus", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<AppShell>Timeline</AppShell>));
    const launcher = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!;
    expect(document.activeElement).not.toBe(launcher);
    await act(() => launcher.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher);
    expect(document.body.style.overflow).toBe("");
  } finally {
    await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
