import { describe, expect, it, vi } from "vitest";
import { createDesktopUpdater, type DesktopUpdate, type DesktopUpdateTransport } from "../apps/desktop/src/desktop-updater";

function fixture(configured = true) {
  const update: DesktopUpdate = {
    version: "0.2.0", body: "Fixes local storage.",
    downloadAndInstall: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const transport: DesktopUpdateTransport = {
    configuration: vi.fn(async () => ({ configured, version: "0.1.0" })),
    check: vi.fn(async () => update), restart: vi.fn(async () => {}),
  };
  return { update, transport, controller: createDesktopUpdater(transport) };
}

describe("explicit desktop update approval", () => {
  it("reads configuration without contacting the feed or installing", async () => {
    const { controller, transport, update } = fixture();
    await controller.initialize();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(transport.check).not.toHaveBeenCalled();
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    await controller.install();
    await controller.restart();
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(transport.restart).not.toHaveBeenCalled();
  });

  it("refuses any network check when the build has no signed updater configuration", async () => {
    const { controller, transport } = fixture(false);
    await controller.initialize();
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("unavailable");
    expect(transport.check).not.toHaveBeenCalled();
  });

  it("requires separate check, install, and restart actions", async () => {
    const { controller, transport, update } = fixture();
    await controller.initialize();
    await controller.check();
    expect(controller.getSnapshot()).toMatchObject({ phase: "available", version: "0.2.0" });
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    await controller.install();
    expect(controller.getSnapshot().phase).toBe("installed");
    expect(update.close).toHaveBeenCalledOnce();
    expect(transport.restart).not.toHaveBeenCalled();
    await controller.restart();
    expect(transport.restart).toHaveBeenCalledOnce();
  });

  it("never reports installation or restarts after signature or installation failure", async () => {
    const { controller, transport, update } = fixture();
    vi.mocked(update.downloadAndInstall).mockRejectedValue(new Error("invalid signature"));
    await controller.initialize(); await controller.check(); await controller.install();
    expect(controller.getSnapshot().phase).toBe("error");
    expect(update.close).toHaveBeenCalledOnce();
    await controller.restart();
    expect(transport.restart).not.toHaveBeenCalled();
    vi.mocked(transport.check).mockResolvedValue(null);
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("current");
  });

  it("serializes overlapping actions and does not close an installation in progress", async () => {
    const { controller, transport, update } = fixture();
    let finish!: () => void;
    vi.mocked(update.downloadAndInstall).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await controller.initialize(); await controller.check();
    const installation = controller.install();
    await controller.install(); await controller.check(); await controller.restart();
    expect(transport.check).toHaveBeenCalledOnce();
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(update.close).not.toHaveBeenCalled();
    finish(); await installation;
    expect(controller.getSnapshot().phase).toBe("installed");
  });

  it("releases a declined candidate before checking again and preserves installed state on restart failure", async () => {
    const { controller, transport, update } = fixture();
    await controller.initialize(); await controller.check(); await controller.check();
    expect(update.close).toHaveBeenCalledOnce();
    await controller.install();
    vi.mocked(transport.restart).mockRejectedValue(new Error("restart failed"));
    await controller.restart();
    expect(controller.getSnapshot()).toMatchObject({ phase: "installed", error: "Cadence could not restart. Quit and reopen Cadence to finish the update." });
  });
});
