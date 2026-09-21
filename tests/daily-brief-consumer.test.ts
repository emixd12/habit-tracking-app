import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { validateAdvisorDayContext } from "@cadence/core/services/advisor-day-context";
import fixture from "./fixtures/advisor-day-context.valid.json";
import { generateDailyBrief } from "@/lib/services/daily-brief-consumer";
import { generateOpenAIDailyBrief } from "@/lib/services/daily-brief-openai";
const context = validateAdvisorDayContext(fixture);
const now = () => Temporal.Instant.from(context.capturedAt);
const advice = { text: "Make room for your planned walk.", occurrenceRefs: [context.cadence.occurrences[0].ref] };

describe("provider-neutral daily briefing", () => {
  it("passes bounded facts and untrusted-data instructions to a capability-free adapter", async () => {
    const generate = vi.fn().mockResolvedValue(advice);
    const result = await generateDailyBrief(context, { generate, now, signal: new AbortController().signal });
    expect(result).toMatchObject({ text: advice.text, localDate: context.localDate, expiresAt: context.expiresAt });
    const input = generate.mock.calls[0][0];
    expect(input.instructions).toContain("untrusted data");
    expect(Object.keys(input).sort()).toEqual(["facts", "instructions", "signal"]);
    expect(JSON.parse(input.facts)).toEqual(context);
  });
  it.each([
    { ...advice, occurrenceRefs: ["invented-reference"] }, { ...advice, text: "" },
    { ...advice, text: "a".repeat(2001) }, { ...advice, command: "mutate" },
  ])("rejects malformed or invented model output", async (result) => {
    await expect(generateDailyBrief(context, { generate: async () => result, now, signal: new AbortController().signal })).rejects.toMatchObject({ code: "advisor_unavailable" });
  });
  it("rejects expiry before and during generation", async () => {
    const generate = vi.fn().mockResolvedValue(advice);
    const expired = () => Temporal.Instant.from(context.expiresAt);
    await expect(generateDailyBrief(context, { generate, now: expired, signal: new AbortController().signal })).rejects.toMatchObject({ code: "context_expired" });
    expect(generate).not.toHaveBeenCalled();
    const clock = vi.fn().mockReturnValueOnce(now()).mockReturnValue(expired());
    await expect(generateDailyBrief(context, { generate, now: clock, signal: new AbortController().signal })).rejects.toMatchObject({ code: "context_expired" });
  });
});

describe("OpenAI adapter", () => {
  const input = { instructions: "Instructions", facts: "Synthetic facts", signal: new AbortController().signal };
  const response = { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(advice) }] }] };
  it("pins Luna, disables storage/tools, rejects redirects, and separates credentials from facts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    expect(await generateOpenAIDailyBrief(input, { apiKey: "synthetic-key", fetch: fetcher })).toEqual(advice);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options).toMatchObject({ redirect: "error", signal: input.signal });
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, background: false, tools: [], tool_choice: "none", input: input.facts });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(options!.body).not.toContain("synthetic-key");
  });
  it.each([
    { ...response, status: "incomplete" },
    { ...response, output: [{ type: "function_call" }] },
    { ...response, output: [{ ...response.output[0], content: [{ type: "refusal", refusal: "No" }] }] },
    { ...response, output: [] },
  ])("rejects incomplete, tool or refusal responses", async (body) => {
    await expect(generateOpenAIDailyBrief(input, { apiKey: "key", fetch: async () => Response.json(body) })).rejects.toMatchObject({ code: "advisor_unavailable" });
  });
  it("bounds response bytes and sanitizes provider failures", async () => {
    await expect(generateOpenAIDailyBrief(input, { apiKey: "key", fetch: async () => new Response("a".repeat(65537)) })).rejects.toMatchObject({ code: "advisor_unavailable" });
    await expect(generateOpenAIDailyBrief(input, { apiKey: "key", fetch: async () => new Response("provider secret", { status: 429 }) })).rejects.toMatchObject({ code: "rate_limited" });
  });
});
