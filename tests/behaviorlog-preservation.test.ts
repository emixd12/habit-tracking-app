/* Parsed fixture edits intentionally create invalid schema shapes. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBehaviorLogImportPreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { portabilityFiles } from "./helpers/portability-fixture";

function files() { return structuredClone(portabilityFiles()); }
function update(input: ReturnType<typeof files>, path: string, edit: (value: any) => void) {
  const file = input.find((entry) => entry.path === path)!;
  const values = file.content.trim().split("\n").map((line) => JSON.parse(line));
  values.forEach(edit); file.content = values.map((value) => JSON.stringify(value)).join("\n") + "\n";
  const manifestFile = input.find((entry) => entry.path === "manifest.json")!;
  const manifest = JSON.parse(manifestFile.content);
  manifest.files.find((entry: {path: string}) => entry.path === path).sha256 = createHash("sha256").update(file.content).digest("hex");
  manifestFile.content = JSON.stringify(manifest);
}
function manifest(input: ReturnType<typeof files>, edit: (value: any) => void) {
  const file = input.find((entry) => entry.path === "manifest.json")!;
  const value = JSON.parse(file.content); edit(value); file.content = JSON.stringify(value);
}
const config = "data/behavior_configuration_events.jsonl";
describe("bounded BehaviorLog preservation", () => {
  it("accepts 0.3 config history and retains validated Cadence snapshot hints", () => {
    const preview = resolveBehaviorLogImportPreview({files: files()});
    expect(preview.errors).toEqual([]);
    expect(preview.portability?.configurationEvents).toHaveLength(1);
    expect(preview.portability?.configurationEvents[0].next).toMatchObject({extensions: {"app.cadence": {category_id: null}}});
    expect(preview.portability?.occurrences[0].timezone).toBe("America/New_York");
  });
  it.each(["0.1.0-draft", "0.2.0-draft"])("continues to read %s", (version) => {
    const input = files(); manifest(input, (value) => {value.schema_version = version;});
    expect(resolveBehaviorLogImportPreview({files: input}).errors).toEqual([]);
  });
  it.each([
    (value: any) => {value.changed_fields = ["timezone"];},
    (value: any) => {value.next.schedules[0].time_entries[0].local_time = null;},
    (value: any) => {value.next.schedules[0].time_entries[0].window_end_local = "23:00";},
    (value: any) => {value.next.schedules[0].recurrence.interval = 0;},
    (value: any) => {value.source.capture_method = "unrecognized";},
    (value: any) => {value.next.intervention_rules[0].timezone = null;},
  ])("rejects invalid known configuration data", (edit) => {
    const input = files(); update(input, config, edit);
    expect(resolveBehaviorLogImportPreview({files: input}).errors.some((issue) => issue.code === "portability_invalid")).toBe(true);
  });
  it("requires authenticated manifest coverage for preserved configuration history", () => {
    const input = files(); manifest(input, (value) => {value.files = value.files.filter((entry: {path:string}) => entry.path !== config);});
    expect(resolveBehaviorLogImportPreview({files: input}).errors.some((issue) => issue.code === "portability_invalid")).toBe(true);
  });
  it("blocks unsupported required semantics but warns about optional losses", () => {
    const input = files(); manifest(input, (value) => {value.rules.required_extensions = ["example.required"]; value.profiles.push("unknown_profile");});
    input.push({path:"raw/unknown.json",content:'{"private":"discard"}\n',mediaType:"application/json"});
    const preview = resolveBehaviorLogImportPreview({files: input});
    expect(preview.errors.some((issue) => issue.code === "portability_invalid")).toBe(true);
    expect(preview.warnings.filter((issue) => issue.code === "portability_loss").map((issue) => issue.message).join(" ")).toContain("unknown_profile");
    expect(JSON.stringify(preview.portability)).not.toContain("discard");
  });
  it("fails closed above the metadata byte limit", () => {
    const input = files(); update(input, config, (value) => {value.next.category = "é".repeat(140_000);});
    expect(resolveBehaviorLogImportPreview({files: input}).errors.some((issue) => issue.message.includes("256 KiB"))).toBe(true);
  });
  it("preserves validated unused categories and fractional configuration times", () => {
    const input = files();
    manifest(input, (value) => {value.extensions["app.cadence"].categories = [{id:"unused",name:"Unused",sort_order:9,created_at:"2026-05-01T12:00:00+00:00"}];});
    update(input, config, (value) => {value.next.schedules[0].time_entries[0].local_time = "22:00:00.123456789";});
    const preview = resolveBehaviorLogImportPreview({files: input});
    expect(preview.errors).toEqual([]);
    expect(preview.portability?.categories).toEqual([{id:"unused",name:"Unused",sort_order:9,created_at:"2026-05-01T12:00:00+00:00"}]);
    update(input, "data/schedules.jsonl", (value) => {value.local_time = "22:00:01.123456";});
    expect(resolveBehaviorLogImportPreview({files: input}).plan.schedules[0].localTime).toBe("22:00:01.123456");
    expect(resolveBehaviorLogImportPreview({files: input}).plan.schedules[0].skipReasons).toContain("unsupported_schedule_precision");
  });
  it("maps explicit native reminder intent only in the desktop adapter", () => {
    const input = files(); update(input, "data/intervention_rules.jsonl", (value) => {
      if (value.channel === "browser_push") {value.channel = "other"; value.extensions = {"app.cadence":{native_notification:true}};}
    });
    expect(resolveBehaviorLogImportPreview({files:input}).warnings.some((issue) => issue.code === "intervention_rule_unmappable")).toBe(true);
    expect(resolveBehaviorLogImportPreview({files:input,reminderChannel:"other"}).plan.interventionRules?.[0]).toMatchObject({action:"create",channel:"browser_push"});
    update(input, "data/intervention_rules.jsonl", (value) => {if (value.channel === "other") delete value.extensions;});
    expect(resolveBehaviorLogImportPreview({files:input,reminderChannel:"other"}).plan.interventionRules?.[0].action).toBe("skip");
  });
  it("normalizes optional interval one and weekly interval semantics", () => {
    const input = files(); update(input, "data/schedules.jsonl", (value) => {value.recurrence = {type:"weekly_on_weekdays",interval:2,weekdays:["monday"]};});
    expect(resolveBehaviorLogImportPreview({files: input}).plan.schedules[0].recurrence.type).toBe("every_n_weeks_on_weekdays");
    update(input, "data/schedules.jsonl", (value) => {value.recurrence = {type:"daily"};});
    expect(resolveBehaviorLogImportPreview({files: input}).plan.schedules[0].recurrence.interval).toBe(1);
  });
  it.each([
    (value: any) => {value.effective_until_utc = "2026-09-01T00:00:00Z";},
    (value: any) => {value.effective_from_utc = "2030-01-01T00:00:00Z";},
  ])("does not operate schedule bounds that Cadence cannot enforce", (edit) => {
    const input = files(); update(input, "data/schedules.jsonl", edit);
    expect(resolveBehaviorLogImportPreview({files: input}).plan.schedules[0].skipReasons).toContain("unsupported_schedule_effective_bounds");
  });
  it("rejects inconsistent effective dates and changed fields", () => {
    const input = files(); update(input, config, (value) => {value.effective_local_date = "1999-01-01";});
    expect(resolveBehaviorLogImportPreview({files: input}).errors.some((issue) => issue.code === "portability_invalid")).toBe(true);
  });
  it("keeps sanitized extension-only revisions valid on re-export", async () => {
    const input = files(); update(input, config, (value) => {
      value.event_kind = "revision"; value.previous = structuredClone(value.next);
      value.next.schedules[0].extensions["example.private"] = {color:"changed"};
      value.changed_fields = ["schedules"];
    });
    const preview = resolveBehaviorLogImportPreview({files:input});
    expect(preview.errors).toEqual([]);
    const retained = preview.portability!.configurationEvents[0];
    expect(retained.changed_fields).toEqual([]);
    expect(retained.source).toMatchObject({transformation_notes:expect.stringContaining("omitted unsupported configuration extensions")});
    expect(preview.warnings.some((issue) => issue.code === "portability_loss")).toBe(true);
    update(input, config, (value) => {for (const key of Object.keys(value)) delete value[key]; Object.assign(value, retained);});
    expect(resolveBehaviorLogImportPreview({files:input}).errors).toEqual([]);
    const directory = await mkdtemp(path.join(tmpdir(), "cadence-sanitized-history-"));
    try {
      for (const file of input) {
        const target = path.join(directory, file.path);
        await mkdir(path.dirname(target), {recursive:true}); await writeFile(target, file.content);
      }
      const result = spawnSync(process.execPath, ["scripts/behaviorlog-conformance.mjs", directory], {encoding:"utf8"});
      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {await rm(directory, {recursive:true,force:true});}
  });
  it("does not operate independently anchored interval schedules", () => {
    const input = files(); update(input, "data/schedules.jsonl", (value) => {value.recurrence = {type:"every_n_days",interval:2}; value.anchor_local_date = "2026-05-02";});
    const preview = resolveBehaviorLogImportPreview({files: input});
    expect(preview.plan.schedules[0].action).toBe("skip");
    expect(preview.plan.occurrences[0].importWithDetachedScheduleSnapshot).toBe(true);
    expect(preview.warnings.some((issue) => issue.code === "unsupported_schedule_anchor")).toBe(true);
  });
  it("requires an interval anchor in 0.3", () => {
    const input = files(); update(input, "data/schedules.jsonl", (value) => {value.recurrence = {type:"every_n_days",interval:2}; delete value.anchor_local_date;});
    expect(resolveBehaviorLogImportPreview({files: input}).errors.some((issue) => issue.code === "portability_invalid")).toBe(true);
  });
});
