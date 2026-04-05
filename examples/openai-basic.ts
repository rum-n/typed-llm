/**
 * Basic usage with OpenAI
 *
 * Run: npx tsx examples/openai-basic.ts
 * Requires: npm install openai
 */
import OpenAI from "openai";
import { buildPrompt, defineOutput, parse, t } from "../src/index.js";

const client = new OpenAI(); // uses OPENAI_API_KEY env var

const ArticleSchema = defineOutput({
  title: t.string(),
  sentiment: t.union(["positive", "negative", "neutral"] as const),
  keyPoints: t.array(t.string()),
  readingTimeMinutes: t.number().coerce(),
});

const userPrompt = `
Analyze the following article and return structured data about it.

Article:
"TypeScript 5.0 introduces a raft of improvements including const type parameters,
decorators, and much faster builds. The community response has been overwhelmingly
positive, with many developers reporting 10-30% build time reductions."
`;

const fullPrompt = buildPrompt(userPrompt, ArticleSchema);

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: fullPrompt }],
});

const raw = response.choices[0]?.message.content ?? "";
const result = parse(raw, ArticleSchema);

if (result.success) {
  console.log("Parsed article:", result.data);
  // result.data is fully typed as:
  // { title: string; sentiment: "positive" | "negative" | "neutral"; keyPoints: string[]; readingTimeMinutes: number }
} else {
  console.error("Parse failed:", result.errors);
}
