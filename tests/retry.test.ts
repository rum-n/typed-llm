import { describe, expect, it, vi } from "vitest";
import { defineOutput } from "../src/schema/define.js";
import { t } from "../src/schema/types.js";
import { withRetry } from "../src/retry/withRetry.js";

const Schema = defineOutput({
  score: t.number(),
  label: t.string(),
});

const validResponse = JSON.stringify({ score: 8, label: "great" });
const invalidResponse = JSON.stringify({ score: "not-a-number", label: 42 });

describe("withRetry()", () => {
  it("returns success on the first attempt if the response is valid", async () => {
    const callLLM = vi.fn().mockResolvedValue(validResponse);
    const result = await withRetry(callLLM, Schema);
    expect(result.success).toBe(true);
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledWith(undefined);
  });

  it("retries on failure and succeeds on the second attempt", async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(validResponse);

    const result = await withRetry(callLLM, Schema, { maxRetries: 3 });
    expect(result.success).toBe(true);
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it("passes field-level feedback to the LLM on retry", async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(validResponse);

    await withRetry(callLLM, Schema, { maxRetries: 3 });

    const feedbackArg = callLLM.mock.calls[1]?.[0] as string;
    expect(feedbackArg).toBeTruthy();
    expect(feedbackArg).toContain("score");
    expect(feedbackArg).toContain("label");
  });

  it("calls onRetry callback on each retry", async () => {
    const onRetry = vi.fn();
    const callLLM = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(validResponse);

    await withRetry(callLLM, Schema, { maxRetries: 3, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(0, expect.any(String));
  });

  it("returns the last failure after exhausting all retries", async () => {
    const callLLM = vi.fn().mockResolvedValue(invalidResponse);
    const result = await withRetry(callLLM, Schema, { maxRetries: 2 });
    expect(result.success).toBe(false);
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries: 1 (no retries, only initial call)", async () => {
    const callLLM = vi.fn().mockResolvedValue(invalidResponse);
    await withRetry(callLLM, Schema, { maxRetries: 1 });
    expect(callLLM).toHaveBeenCalledTimes(1);
  });
});
