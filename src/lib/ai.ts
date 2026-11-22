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

/** Pulls the first JSON object out of a text reply (fallback when no tool call is made). */
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return candidate ? JSON.parse(candidate) : null;
  } catch {
    return null;
  }
}

/**
 * Asks Claude for structured output via a tool whose input matches the given JSON schema.
 * Uses tool_choice "auto" (some models don't support forcing a specific tool) plus a clear
 * instruction; if Claude answers in text instead, asks once more, then falls back to JSON in text.
 */
export async function structured<T>(opts: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const tools: Anthropic.Tool[] = [
    {
      name: opts.schemaName,
      description: "Submit the final result in this exact structure. Always call this tool exactly once.",
      input_schema: opts.schema as Anthropic.Tool.InputSchema,
    },
  ];
  const system = `${opts.system}\n\nAlways deliver your answer by calling the \`${opts.schemaName}\` tool exactly once, with every required field filled.`;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({
      model: model(),
      max_tokens: opts.maxTokens ?? 4096,
      system,
      tools,
      tool_choice: { type: "auto" },
      messages,
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (block && block.type === "tool_use") return block.input as T;

    const replyText = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const json = extractJson(replyText);
    if (json && typeof json === "object") return json as T;

    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: `Now call the \`${opts.schemaName}\` tool with the result.` });
  }
  throw new Error("Claude did not return structured output");
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
