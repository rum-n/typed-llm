/**
 * Streaming example — progressive UI updates as LLM generates output
 *
 * Run: npx tsx examples/streaming.ts
 * Requires: npm install openai
 */
import OpenAI from "openai";
import { buildPrompt, defineOutput, openAIStream, parseStream, t } from "../src/index.js";

const client = new OpenAI();

const SummarySchema = defineOutput({
  headline: t.string(),
  bodyText: t.string(),
  category: t.union(["tech", "science", "business", "culture"] as const),
  wordCount: t.number().coerce(),
});

const userPrompt = `
Summarize this news article as structured data:

"Researchers at MIT have unveiled a new battery technology that could charge electric
vehicles in under five minutes. The solid-state design eliminates the flammable liquid
electrolytes found in conventional lithium-ion batteries, dramatically improving both
safety and energy density. The team estimates commercial availability within three years."
`;

const stream = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: buildPrompt(userPrompt, SummarySchema) }],
  stream: true,
});

console.log("Streaming response:\n");

for await (const partial of parseStream(openAIStream(stream), SummarySchema)) {
  // Clear line and print current state
  process.stdout.write("\r\x1b[K");
  const fields = Object.entries(partial.data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(" | ");
  const missing = partial.incomplete.length > 0 ? ` (pending: ${partial.incomplete.join(", ")})` : " ✓ complete";
  process.stdout.write(fields + missing);
}

console.log("\n\nDone.");
