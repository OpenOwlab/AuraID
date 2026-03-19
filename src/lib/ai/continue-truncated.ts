import { generateText } from "ai";
import type { LanguageModel } from "ai";

/**
 * If a generateText result was truncated (finishReason === 'length'),
 * make one follow-up call to complete the response.
 * Returns the combined text (original + continuation).
 */
export async function continueTruncatedResponse(opts: {
  model: LanguageModel;
  systemPrompt: string;
  originalPrompt: string;
  partialResponse: string;
  continuationTokens: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const result = await generateText({
    model: opts.model,
    system: opts.systemPrompt,
    messages: [
      { role: "user", content: opts.originalPrompt },
      { role: "assistant", content: opts.partialResponse },
      {
        role: "user",
        content:
          "Your previous response was cut off. Continue from where you stopped and complete your analysis. Do not repeat content you already wrote.",
      },
    ],
    maxOutputTokens: opts.continuationTokens,
    abortSignal: opts.abortSignal,
  });

  return (opts.partialResponse + "\n\n" + result.text.trim()).trim();
}
