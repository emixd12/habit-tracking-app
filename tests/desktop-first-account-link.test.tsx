import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { hasRecognizedLocalData } from "@cadence/core/services/first-account-link";
import { DEFAULT_CATEGORY_NAMES } from "@cadence/core/types/database";
import { sha256 } from "@cadence/core/hash";
import type { PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { FirstAccountLinkChoice } from "../apps/desktop/src/account/account-panel";
import { applyVerifiedFirstLinkPlan, assertFirstLinkLocalUnchanged, commitFirstLink, completedFirstLinkState, existingRecordsFromHostedEnvelope, firstLinkFailureBackupPath, localChangedSinceFirstLinkAttempt, planFirstLinkReconciliation, recoverRejectedFirstLinkReview, stabilizeFirstLinkAttempt } from "../apps/desktop/src/account/first-link";

function snapshot(): PortabilitySnapshot {
  const profile = { id: "local", timezone: "America/New_York", email: "", display_name: null, created_at: "now", updated_at: "now" };
  return { revision: 0, profile, categories: DEFAULT_CATEGORY_NAMES.map((name, sort_order) => ({ id: `c${sort_order}`, user_id: profile.id, name, sort_order, created_at: "now", updated_at: "now" })), graphs: [], definitionEvents: [], configurationEvents: [], occurrences: [], statusEvents: [], timeSessions: [], importRuns: [], mappings: [], importedNotes: [], importedInterventions: [] };
}

describe("first desktop account link", () => {
  it("does not mistake untouched seed rows for recognized local data", () => {
    expect(hasRecognizedLocalData(snapshot())).toBe(false);
  });

  it("reuses the pending attempt and pre-commit fingerprints after a hosted-success retry", async () => {
    let saved: { attemptId: string; localFingerprint: string; hostedFingerprint: string; preAttemptBaselineJson: string } | null = null;
    const begin = async (proposed: typeof saved & {}) => saved ??= proposed;
    const first = await stabilizeFirstLinkAttempt({ attemptId: "first", localFingerprint: "local-before", hostedFingerprint: "hosted-before", preAttemptBaselineJson: '{"entities":[]}' }, begin);
    const retry = await stabilizeFirstLinkAttempt({ attemptId: "second", localFingerprint: "local-before", hostedFingerprint: "hosted-after-import", preAttemptBaselineJson: '{"entities":["changed"]}' }, begin);
    expect(retry).toEqual(first);
  });

  it("rejects a restarted pending Import before uploading post-choice local edits", async () => {
    const pending = await stabilizeFirstLinkAttempt({ attemptId: "restart", localFingerprint: "before", hostedFingerprint: "hosted", preAttemptBaselineJson: '{"entities":[]}' }, async (value) => value);
    expect(() => assertFirstLinkLocalUnchanged("after-edit", pending.localFingerprint)).toThrow("before uploading data");
  });

  it("detects product, profile, category, history, and provenance changes", () => {
    const cases: PortabilitySnapshot[] = [];
    const timezone = snapshot(); timezone.profile.timezone = "Europe/Rome"; cases.push(timezone);
    const category = snapshot(); category.categories[0]!.name = "Health"; cases.push(category);
    const graph = snapshot(); graph.graphs.push({} as never); cases.push(graph);
    const history = snapshot(); history.statusEvents.push({} as never); cases.push(history);
    const provenance = snapshot(); provenance.importedNotes.push({} as never); cases.push(provenance);
    expect(cases.every(hasRecognizedLocalData)).toBe(true);
    expect(hasRecognizedLocalData({ ...snapshot(), reminderDeliveries: [{}] })).toBe(true);
  });

  it("renders one explicit import, ignore, or cancel choice", () => {
    const html = renderToStaticMarkup(<FirstAccountLinkChoice busy={false} backupPath="/Backups/cadence.sqlite3" onImport={() => {}} onIgnore={() => {}} onCancel={() => {}} />);
    expect(html).toContain("Import local data into the account");
    expect(html).toContain("Ignore local data and use account data");
    expect(html).toContain("Cancel account link");
    expect(html).toContain("/Backups/cadence.sqlite3");
  });

  it.each([
    ["import", ["hosted", "read", "local", "baseline"]],
    ["ignore", ["backup", "read", "local", "baseline"]],
    ["hydrate", ["read", "local", "baseline"]],
  ] as const)("orders the %s two-commit path before its baseline", async (choice, expected) => {
    const calls: string[] = [];
    const result = await commitFirstLink(choice, {
      importHosted: async () => { calls.push("hosted"); return { conflictCount: 0 }; },
      backupLocal: async () => { calls.push("backup"); return "/protected.sqlite3"; },
      readHosted: async () => { calls.push("read"); return { rows: 1 }; },
      applyLocal: async () => { calls.push("local"); },
      saveBaseline: async () => { calls.push("baseline"); },
    });
    expect(calls).toEqual(expected);
    expect(result.status).toBe("complete");
  });

  it("routes conflicts without writing either the local copy or baseline", async () => {
    const calls: string[] = [];
    const result = await commitFirstLink("import", {
      importHosted: async () => ({ conflictCount: 2 }), backupLocal: async () => "unused",
      readHosted: async () => { calls.push("read"); return {}; }, applyLocal: async () => { calls.push("local"); },
      saveBaseline: async () => { calls.push("baseline"); },
    });
    expect(result).toEqual({ status: "conflict", count: 2 });
    expect(calls).toEqual([]);
  });

  it.each(["hosted", "backup", "local"] as const)("does not advance the baseline after an injected %s failure", async (failure) => {
    const calls: string[] = [];
    const reject = (name: string) => { calls.push(name); throw new Error(`${name} failed`); };
    await expect(commitFirstLink(failure === "backup" ? "ignore" : "import", {
      importHosted: async () => failure === "hosted" ? reject("hosted") : { conflictCount: 0 },
      backupLocal: async () => failure === "backup" ? reject("backup") : "/protected.sqlite3",
      readHosted: async () => ({}), applyLocal: async () => { if (failure === "local") reject("local"); },
      saveBaseline: async () => { calls.push("baseline"); },
    })).rejects.toThrow(`${failure} failed`);
    expect(calls).not.toContain("baseline");
  });

  it("finishes a hosted-success retry from the reconciled snapshot and saves the baseline last", async () => {
    const calls: string[] = [];
    const result = await commitFirstLink("import", {
      importHosted: async () => { calls.push("hosted-idempotent"); return { conflictCount: 0 }; },
      backupLocal: async () => "unused",
      readHosted: async () => { calls.push("read-hosted"); return { version: "after-import" }; },
      applyLocal: async () => { calls.push("reconcile-local"); return { baseline: { version: "after-reconcile" } }; },
      saveBaseline: async (baseline) => { calls.push(`baseline:${(baseline as { version: string }).version}`); },
    });
    expect(result.status).toBe("complete");
    expect(calls).toEqual(["hosted-idempotent", "read-hosted", "reconcile-local", "baseline:after-reconcile"]);
  });

  it("routes divergent recovery into whole-plan conflict review without advancing the baseline", async () => {
    const calls: string[] = [];
    const inputs = { accountLinkId: "hosted", baseline: { entities: [] }, local: { entities: [] }, hosted: { entities: [] }, baselineFingerprint: "b", hostedFingerprint: "h", outboxHighWater: 1 };
    const conflict = { kind: "behavior", id: "shared", reason: "concurrent_update", baseline: null, local: { title: "Mac" }, hosted: { title: "Account" } } as const;
    const result = await commitFirstLink("import", {
      importHosted: async () => ({ conflictCount: 0 }), backupLocal: async () => "unused", readHosted: async () => ({}),
      applyLocal: async () => ({ inputs, conflicts: [conflict], attempt: { attemptId: "attempt", localFingerprint: "l", hostedFingerprint: "h", preAttemptBaselineJson: '{"entities":[]}', choice: "import" } }),
      saveBaseline: async () => { calls.push("baseline"); },
    });
    expect(result).toMatchObject({ status: "conflict", count: 1, inputs, conflicts: [conflict] });
    expect(calls).toEqual([]);
  });

  it("plans divergent first-link rows as reviewable whole-plan conflicts", () => {
    const value = (title: string) => ({ entities: [{ kind: "behavior" as const, id: "shared", value: { id: "shared", title } }] });
    const { inputs, plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", local: value("Mac"), hosted: value("Account"), choice: "import", localUnchanged: false, outboxHighWater: 4 });
    expect(inputs.baseline.entities).toEqual([]);
    expect(plan.conflicts).toMatchObject([{ kind: "behavior", id: "shared", reason: "append_id_collision" }]);
    expect(plan.localWrites).toEqual([]);
    expect(plan.hostedWrites).toEqual([]);
  });

  it("replaces untouched local seed IDs with hosted seed IDs through account sync", () => {
    const category = (id: string) => ({ kind: "category" as const, id, value: { id, user_id: "owner", name: "Medical", sort_order: 0 } });
    const local = { entities: [category("local-seed")] };
    const hosted = { entities: [category("hosted-seed")] };
    const { plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", baseline: local, local, hosted, choice: "hydrate", localUnchanged: true, outboxHighWater: 1 });
    expect(plan.conflicts).toEqual([]);
    expect(plan.hostedWrites).toEqual([]);
    expect(plan.localWrites).toMatchObject([
      { kind: "category", id: "hosted-seed", operation: "upsert" },
      { kind: "category", id: "local-seed", operation: "delete" },
    ]);
  });

  it("hydrates untouched local data from same-status hosted history branches", () => {
    const event = (id: string) => ({ kind: "status_event" as const, id, value: { id, occurrence_id: "occurrence", revises_event_id: null, status: "completed" } });
    const local = { entities: [] };
    const hosted = { entities: [event("first"), event("second")] };
    const { plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", baseline: local, local, hosted, choice: "hydrate", localUnchanged: false, outboxHighWater: 1 });
    expect(plan.conflicts).toEqual([]);
    expect(plan.hostedWrites).toEqual([]);
    expect(plan.localWrites).toMatchObject([{ id: "first", operation: "upsert" }, { id: "second", operation: "upsert" }]);
  });

  it("uploads a post-attempt local edit when the hosted row still matches the baseline", () => {
    const entity = (title: string) => ({ kind: "behavior" as const, id: "shared", value: { id: "shared", title } });
    const baseline = { entities: [entity("Before")] };
    const local = { entities: [entity("Edited on this Mac")] };
    const hosted = { entities: [entity("Before")] };
    const { plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", baseline, local, hosted, choice: "import", localUnchanged: false, outboxHighWater: 2 });
    expect(plan.conflicts).toEqual([]);
    expect(plan.hostedWrites).toMatchObject([{ kind: "behavior", id: "shared", operation: "upsert", value: { title: "Edited on this Mac" } }]);
    expect(plan.localWrites).toEqual([]);
  });

  it("pauses for review when both copies changed after the first-link attempt", () => {
    const entity = (title: string) => ({ kind: "behavior" as const, id: "shared", value: { id: "shared", title } });
    const baseline = { entities: [entity("Before")] };
    const local = { entities: [entity("Edited on this Mac")] };
    const hosted = { entities: [entity("Edited in the account")] };
    const { plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", baseline, local, hosted, choice: "import", localUnchanged: false, outboxHighWater: 2 });
    expect(plan.conflicts).toMatchObject([{ kind: "behavior", id: "shared", reason: "concurrent_update" }]);
    expect(plan.hostedWrites).toEqual([]);
    expect(plan.localWrites).toEqual([]);
  });

  it("applies a post-attempt local deletion through the returned plan", () => {
    const entity = { kind: "category" as const, id: "shared", value: { id: "shared", name: "Before" } };
    const baseline = { entities: [entity] };
    const { plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", baseline, local: { entities: [] }, hosted: baseline,
      choice: "import", localUnchanged: false, outboxHighWater: 2 });
    expect(plan.conflicts).toEqual([]);
    expect(plan.hostedWrites).toMatchObject([{ kind: "category", id: "shared", operation: "delete" }]);
  });

  it("preserves an Ignore backup through conflict review and exits first-link state after review", async () => {
    const inputs = { accountLinkId: "hosted", baseline: { entities: [] }, local: { entities: [] }, hosted: { entities: [] }, baselineFingerprint: "b", hostedFingerprint: "h", outboxHighWater: 1 };
    const conflict = { kind: "behavior", id: "shared", reason: "concurrent_update", baseline: null, local: { title: "Mac" }, hosted: { title: "Account" } } as const;
    const result = await commitFirstLink("ignore", {
      importHosted: async () => ({ conflictCount: 0 }), backupLocal: async () => "/protected.sqlite3", readHosted: async () => ({}),
      applyLocal: async () => ({ inputs, conflicts: [conflict], attempt: { attemptId: "attempt", localFingerprint: "l", hostedFingerprint: "h", preAttemptBaselineJson: '{"entities":[]}', choice: "ignore" } }),
      saveBaseline: async () => { throw new Error("baseline must wait"); },
    });
    expect(result).toMatchObject({ status: "conflict", backupPath: "/protected.sqlite3" });
    expect(completedFirstLinkState({ status: "complete", backupPath: result.backupPath ?? null })).toEqual({
      firstLink: { recognized: false, complete: true, backupPath: "/protected.sqlite3" }, syncReady: true,
    });
  });

  it("does not treat changed local Ignore data as the common baseline", () => {
    const value = (title: string) => ({ entities: [{ kind: "behavior" as const, id: "shared", value: { id: "shared", title } }] });
    const { inputs, plan } = planFirstLinkReconciliation({ accountLinkId: "hosted", local: value("Edited after choice"), hosted: value("Account"), choice: "ignore", localUnchanged: false, outboxHighWater: 5 });
    expect(inputs.baseline.entities).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("returns actionable typed review inputs for import-preview conflicts", async () => {
    const inputs = { accountLinkId: "hosted", baseline: { entities: [] }, local: { entities: [] }, hosted: { entities: [] }, baselineFingerprint: "b", hostedFingerprint: "h", outboxHighWater: 1 };
    const conflict = { kind: "behavior", id: "shared", reason: "append_id_collision", baseline: null, local: { title: "Mac" }, hosted: { title: "Account" } } as const;
    const result = await commitFirstLink("import", {
      importHosted: async () => ({ conflictCount: 1, conflict: { inputs, conflicts: [conflict], attempt: { attemptId: "attempt", localFingerprint: "l", hostedFingerprint: "h", preAttemptBaselineJson: '{"entities":[]}', choice: "import" } } }),
      backupLocal: async () => "unused", readHosted: async () => { throw new Error("must not read"); }, applyLocal: async () => { throw new Error("must not apply"); }, saveBaseline: async () => { throw new Error("must not save"); },
    });
    expect(result).toMatchObject({ status: "conflict", count: 1, inputs, conflicts: [conflict], attempt: { attemptId: "attempt" } });
  });

  it("recovers a rejected reviewed plan by returning to the first-link choice", () => {
    const reviewed = { inputs: { accountLinkId: "hosted", baseline: { entities: [] }, local: { entities: [] }, hosted: { entities: [] }, baselineFingerprint: "b", hostedFingerprint: "h", outboxHighWater: 1 },
      conflicts: [], attempt: { attemptId: "attempt", localFingerprint: "l", hostedFingerprint: "h", preAttemptBaselineJson: '{"entities":[]}', choice: "ignore" as const }, backupPath: "/protected.sqlite3" };
    expect(recoverRejectedFirstLinkReview(reviewed, "The plan is stale.")).toEqual({ recognized: true, backupPath: "/protected.sqlite3",
      error: "The account data changed before those decisions were applied. Choose the data path again. The plan is stale." });
  });

  it("adapts the hosted envelope only for import-preview existing records", () => {
    const envelope = { schemaVersion: 1, userId: "hosted", fingerprint: "0".repeat(64), entities: [
      { kind: "mapping" as const, id: "mapping", value: { import_run_id: "run", record_type: "behavior", external_id: "external", local_id: "local", created_at: "2026-09-01T12:00:00Z" } },
    ] };
    expect(existingRecordsFromHostedEnvelope(envelope).mappings).toEqual([{ recordType: "behavior", externalId: "external", localId: "local" }]);
  });

  it("detects post-attempt local changes before either restore path", () => {
    const original = { revision: 1, rows: [{ id: "one" }] };
    const originalFingerprint = sha256(JSON.stringify(original));
    expect(localChangedSinceFirstLinkAttempt(original, originalFingerprint)).toBe(false);
    expect(localChangedSinceFirstLinkAttempt({ ...original, revision: 2 }, originalFingerprint)).toBe(true);
  });

  it.each(["read", "apply"] as const)("preserves the Ignore backup path after a %s failure", async (failure) => {
    let caught: unknown;
    try {
      await commitFirstLink("ignore", {
        importHosted: async () => ({ conflictCount: 0 }), backupLocal: async () => "/protected.sqlite3",
        readHosted: async () => { if (failure === "read") throw new Error("read failed"); return {}; },
        applyLocal: async () => { if (failure === "apply") throw new Error("apply failed"); }, saveBaseline: async () => undefined,
      });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(`${failure} failed`);
    expect(firstLinkFailureBackupPath(caught)).toBe("/protected.sqlite3");
  });

  it("rejects an invalid hosted fingerprint before mutating local data", async () => {
    const calls: string[] = [];
    await expect(applyVerifiedFirstLinkPlan("expected", async () => { calls.push("hosted"); return { fingerprint: "invalid" }; }, async () => { calls.push("local"); }))
      .rejects.toThrow("fingerprint is invalid");
    expect(calls).toEqual(["hosted"]);
  });

});
