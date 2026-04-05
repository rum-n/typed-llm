/**
 * Basic usage with Anthropic SDK — with automatic retry
 *
 * Run: npx tsx examples/anthropic-basic.ts
 * Requires: npm install @anthropic-ai/sdk
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, defineOutput, t, withRetry } from "../src/index.js";

const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var

const ReviewSchema = defineOutput({
  productName: t.string(),
  rating: t.number().coerce(),        // LLMs sometimes return "8/10" — coerce extracts 8
  pros: t.array(t.string()),
  cons: t.array(t.string()),
  recommended: t.boolean().coerce(),  // coerces "yes"/"no" strings
});

const userPrompt = `
Extract structured review data from this text:

"The Sony WH-1000XM5 headphones are fantastic. I'd give them a solid 9 out of 10.
The noise cancellation is world-class and the battery life is excellent (pros).
The only downsides are the price and the slightly bulky case (cons).
Yes, I would definitely recommend these to anyone looking for premium headphones."
`;

const result = await withRetry(
  (feedback) =>
    client.messages
      .create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: buildPrompt(userPrompt, ReviewSchema, feedback) }],
      })
      .then((msg) => {
        const block = msg.content[0];
        return block?.type === "text" ? block.text : "";
      }),
  ReviewSchema,
  {
    maxRetries: 3,
    onRetry: (attempt, feedback) => {
      console.log(`Retry ${attempt + 1}: ${feedback.slice(0, 80)}...`);
    },
  },
);

if (result.success) {
  console.log("Review:", result.data);
} else {
  console.error("Failed after retries:", result.errors);
}
