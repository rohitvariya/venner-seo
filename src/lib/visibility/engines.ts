// Asks AI assistants a buyer's question the way a real person would, and returns the answer
// text plus the sources it cited. Claude (with live web search) is always on; Perplexity and
// ChatGPT are added when their API keys are set.

import Anthropic from "@anthropic-ai/sdk";
import type { AiEngine } from "../schema";
import { model } from "../ai";

export type EngineAnswer = { text: string; citations: string[] };

export function enabledEngines(): AiEngine[] {
  const list: AiEngine[] = ["claude"];
  if (process.env.PERPLEXITY_API_KEY) list.push("perplexity");
  if (process.env.OPENAI_API_KEY) list.push("openai");
  return list;
}

export const ENGINE_LABEL: Record<AiEngine, string> = { claude: "Claude", perplexity: "Perplexity", openai: "ChatGPT" };

const SYSTEM = "You are a helpful assistant. Answer the user's question helpfully and concretely, recommending specific companies or websites where that is useful.";

async function askClaude(question: string, location: string | null): Promise<EngineAnswer> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = location ? `${question}\n\n(I'm based in ${location}.)` : question;
  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model: model(),
      max_tokens: 2000,
      system: SYSTEM,
      // Server-side web search, so answers reflect what's on the web today.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as unknown as Anthropic.Tool],
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    // Web search can be disabled for an organisation: fall back to the model's own knowledge.
    if (!/web_search|tool/i.test(String(err))) throw err;
    res = await client.messages.create({ model: model(), max_tokens: 2000, system: SYSTEM, messages: [{ role: "user", content: prompt }] });
  }
  const citations = new Set<string>();
  let text = "";
  for (const block of res.content as unknown as Record<string, unknown>[]) {
    if (block.type === "text") {
      text += String(block.text ?? "");
      for (const c of (block.citations as { url?: string }[] | undefined) ?? []) if (c.url) citations.add(c.url);
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content as { url?: string }[]) if (r.url) citations.add(r.url);
    }
  }
  return { text, citations: [...citations] };
}

async function askPerplexity(question: string, location: string | null): Promise<EngineAnswer> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: location ? `${question} (I'm based in ${location}.)` : question },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[]; citations?: string[]; search_results?: { url: string }[] };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    citations: json.citations ?? json.search_results?.map((r) => r.url) ?? [],
  };
}

async function askOpenAI(question: string, location: string | null): Promise<EngineAnswer> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      tools: [{ type: "web_search" }],
      instructions: SYSTEM,
      input: location ? `${question} (I'm based in ${location}.)` : question,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  type Out = { type: string; content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[] };
  const json = (await res.json()) as { output?: Out[] };
  let text = "";
  const citations = new Set<string>();
  for (const o of json.output ?? []) {
    for (const c of o.content ?? []) {
      if (c.type === "output_text") {
        text += c.text ?? "";
        for (const a of c.annotations ?? []) if (a.url) citations.add(a.url);
      }
    }
  }
  return { text, citations: [...citations] };
}

export async function askEngine(engine: AiEngine, question: string, location: string | null): Promise<EngineAnswer> {
  if (engine === "perplexity") return askPerplexity(question, location);
  if (engine === "openai") return askOpenAI(question, location);
  return askClaude(question, location);
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Did the answer mention the business, cite its site, and which competitors appeared? */
export function analyzeAnswer(
  answer: EngineAnswer,
  brand: { name: string | null; domain: string },
  competitors: { name: string; domain: string }[],
) {
  const text = answer.text.toLowerCase();
  const domain = brand.domain.toLowerCase().replace(/^www\./, "");
  const hosts = answer.citations.map(host);
  const nameHit = !!brand.name && brand.name.length > 2 && text.includes(brand.name.toLowerCase());
  const cited = hosts.some((h) => h === domain || h.endsWith(`.${domain}`));
  const mentioned = nameHit || text.includes(domain) || cited;
  const competitorsMentioned = competitors
    .filter((c) => {
      const d = c.domain.toLowerCase().replace(/^www\./, "");
      return (c.name.length > 2 && text.includes(c.name.toLowerCase())) || text.includes(d) || hosts.some((h) => h === d || h.endsWith(`.${d}`));
    })
    .map((c) => c.name);
  return { mentioned, cited, competitorsMentioned };
}

// Directories, review sites, media and platforms: sources AI uses, but not competitors.
const NOT_A_BUSINESS =
  /(goodfirms|clutch|techbehemoths|designrush|sortlist|upwork|fiverr|justdial|indiamart|sulekha|tradeindia|glassdoor|ambitionbox|linkedin|facebook|instagram|youtube|twitter|x\.com|reddit|quora|medium|dev\.to|wikipedia|google|bing|forbes|economictimes|indiatimes|business-standard|livemint|yourstory|inc42|g2\.com|capterra|trustpilot|crunchbase|statista|gartner|shopify\.com|wordpress\.org|github)/i;

export function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Business websites AI used as sources (directories, media and your own site excluded). */
export function businessSources(citations: string[], ownDomain: string) {
  const own = ownDomain.replace(/^www\./, "").toLowerCase();
  return [...new Set(citations.map(hostOf))].filter((h) => h && h !== own && !h.endsWith(`.${own}`) && !NOT_A_BUSINESS.test(h));
}

const GENERIC = /^(short answer|summary|note|tip|tips|important|bottom line|my recommendation|recommendation|example|cost|timeline|pros|cons|why|how|what|step \d+|option \d+|budget|verdict|key takeaways?)$/i;

/**
 * Businesses the answer names, from bold list items like "**Narola Infotech**" (how assistants
 * usually present recommendations). Heuristic: short, Title Case, not a generic label.
 */
export function namedBusinesses(text: string, ownName: string | null): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)) {
    const name = m[1].trim().replace(/[:.,–-]+$/, "").trim();
    const words = name.split(/\s+/);
    if (words.length > 5 || GENERIC.test(name) || /^\d|[?:()₹$%]/.test(name)) continue;
    if (!words.every((w) => /^[A-Z0-9&@]/.test(w) || /^[a-z][A-Z]/.test(w) || /^(and|of|the|&|by|for|in)$/i.test(w))) continue;
    if (ownName && name.toLowerCase().includes(ownName.toLowerCase())) continue;
    out.add(name);
  }
  return [...out];
}

/** Best-effort website for a named business, from the hosts the answer cited ("Narola Infotech" → narolainfotech.com). */
export function guessDomain(name: string, hosts: string[]) {
  const squash = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  return (
    hosts.find((h) => h.split(".")[0].replace(/-/g, "") === squash) ??
    hosts.find((h) => first.length >= 4 && h.split(".")[0].startsWith(first)) ??
    null
  );
}
