// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DesktopDraftGuard,
  discardUnsavedDesktopDrafts,
  hasPendingDesktopWrites,
  hasUnsavedDesktopDrafts,
} from "../lib/desktop-draft";

import { invoke } from "@tauri-apps/api/core";
import { hasPendingLocalCommands, localCommand } from "../apps/desktop/src/local-store";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe("desktop restart draft guard", () => {
  it("discards every mounted draft only through the explicit discard action", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);

    function Drafts() {
      const [first, setFirst] = useState(true);
      const [second, setSecond] = useState(true);
      return <>
        <DesktopDraftGuard dirty={first} onDiscard={() => setFirst(false)} />
        <DesktopDraftGuard dirty={second} onDiscard={() => setSecond(false)} />
      </>;
    }

    try {
      await act(async () => root.render(<Drafts />));
      expect(hasUnsavedDesktopDrafts()).toBe(true);

      await act(async () => {
        expect(discardUnsavedDesktopDrafts()).toBe(true);
        expect(hasUnsavedDesktopDrafts()).toBe(false);
      });

      expect(hasUnsavedDesktopDrafts()).toBe(false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("refuses to discard drafts while a write is pending", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    let discarded = false;

    try {
      await act(async () => root.render(
        <DesktopDraftGuard dirty pending onDiscard={() => { discarded = true; }} />,
      ));

      expect(hasPendingDesktopWrites()).toBe(true);
      expect(hasUnsavedDesktopDrafts()).toBe(true);
      expect(discardUnsavedDesktopDrafts()).toBe(false);
      expect(discarded).toBe(false);
    } finally {
      await act(async () => root.unmount());
    }
  });
});

it("keeps restart blocked until every queued native command settles", async () => {
  let release!: () => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }))
    .mockRejectedValueOnce(new Error("write failed"));
  const pending = localCommand("readImportSnapshot", { profileId: "local" });
  await expect(localCommand("readImportSnapshot", { profileId: "local" })).rejects.toThrow("write failed");
  expect(hasPendingLocalCommands()).toBe(true);
  release();
  await pending;
  expect(hasPendingLocalCommands()).toBe(false);
});


it("keeps restart blocked throughout database maintenance, including native dialogs", async () => {
  const { backupLocalDatabase, restoreLocalDatabase, deleteStorageRecoveryBackup, createProtectedLocalBackup } = await import("../apps/desktop/src/local-database");
  const operations = [backupLocalDatabase, () => restoreLocalDatabase("RESTORE"), deleteStorageRecoveryBackup, createProtectedLocalBackup];
  for (const operation of operations) {
    let release!: () => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = operation();
    expect(hasPendingLocalCommands()).toBe(true);
    release();
    await pending;
    expect(hasPendingLocalCommands()).toBe(false);
  }
  vi.mocked(invoke).mockRejectedValueOnce(new Error("maintenance failed"));
  await expect(backupLocalDatabase()).rejects.toThrow("maintenance failed");
  expect(hasPendingLocalCommands()).toBe(false);
});
