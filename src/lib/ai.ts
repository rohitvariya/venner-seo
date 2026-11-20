import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function model() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

/**
 * Asks Claude for structured output by forcing a single tool call whose input
 * matches the given JSON schema. Returns the parsed tool input.
 */
export async function structured<T>(opts: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await anthropic().messages.create({
    model: model(),
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    tools: [
      {
        name: opts.schemaName,
        description: "Return the result in this exact structure.",
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.schemaName },
    messages: [{ role: "user", content: opts.prompt }],
  });
  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return structured output");
  return block.input as T;
}

/** Plain text generation (used for long-form article bodies). */
export async function text(opts: { system: string; prompt: string; maxTokens?: number }) {
  const res = await anthropic().messages.create({
    model: model(),
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  return res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}
