import { structured } from "../ai";
import { dataForSeoEnabled, keywordMetrics } from "../dataforseo";

export type KeywordIdea = { phrase: string; intent: string; cluster: string };

export async function keywordIdeas(context: string, count = 40, seeds: string[] = []): Promise<KeywordIdea[]> {
  const out = await structured<{ keywords: KeywordIdea[] }>({
    system:
      "You are a senior SEO strategist for local and small businesses. You choose keywords a business can " +
      "realistically rank for with helpful blog content: long-tail questions, comparisons, costs, how-to, " +
      "and local-intent phrases. Avoid brand names of other companies and avoid keywords unrelated to the services.",
    prompt: `${context}\n\n` +
      (seeds.length ? `The owner wants to win these searches (use them as seeds for long-tail topics):\n- ${seeds.join("\n- ")}\n\n` : "") +
      `Suggest ${count} blog keywords for this business. Mix informational (guides, how-to, ` +
      "questions), commercial investigation (cost, best, vs, choosing) and local-intent phrases using the city/" +
      "service areas. Group them into topic clusters named after the related service.",
    schemaName: "keyword_ideas",
    schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phrase: { type: "string", description: "lowercase search phrase" },
              intent: { type: "string", enum: ["informational", "commercial", "local", "transactional"] },
              cluster: { type: "string" },
            },
            required: ["phrase", "intent", "cluster"],
          },
        },
      },
      required: ["keywords"],
    },
    maxTokens: 4000,
  });
  const seen = new Set<string>();
  return out.keywords
    .map((k) => ({ ...k, phrase: k.phrase.trim().toLowerCase() }))
    .filter((k) => k.phrase && !seen.has(k.phrase) && seen.add(k.phrase));
}

export type ScoredKeyword = KeywordIdea & {
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
};

/** Adds volume/competition from DataForSEO when configured. */
export async function enrichKeywords(ideas: KeywordIdea[], country: string | null): Promise<ScoredKeyword[]> {
  if (!dataForSeoEnabled() || ideas.length === 0) {
    return ideas.map((k) => ({ ...k, searchVolume: null, difficulty: null, cpc: null }));
  }
  try {
    const metrics = await keywordMetrics(ideas.map((k) => k.phrase), country ?? "United States");
    const byPhrase = new Map(metrics.map((m) => [m.keyword.toLowerCase(), m]));
    return ideas.map((k) => {
      const m = byPhrase.get(k.phrase);
      return { ...k, searchVolume: m?.searchVolume ?? null, difficulty: m?.difficulty ?? null, cpc: m?.cpc ?? null };
    });
  } catch (err) {
    console.error("Keyword enrichment failed, continuing without volumes:", err);
    return ideas.map((k) => ({ ...k, searchVolume: null, difficulty: null, cpc: null }));
  }
}

/**
 * Picks keywords for the content calendar: prefers some volume with low competition,
 * and spreads picks across clusters so one service doesn't dominate.
 */
export function pickForCalendar<T extends { phrase: string; cluster: string | null; searchVolume: number | null; difficulty: number | null }>(
  keywords: T[],
  n: number,
): T[] {
  const score = (k: T) => {
    const vol = k.searchVolume ?? 50;
    const diff = k.difficulty ?? 40;
    return Math.log10(vol + 10) * (100 - diff);
  };
  const byCluster = new Map<string, T[]>();
  for (const k of [...keywords].sort((a, b) => score(b) - score(a))) {
    const c = k.cluster ?? "general";
    byCluster.set(c, [...(byCluster.get(c) ?? []), k]);
  }
  const picked: T[] = [];
  while (picked.length < n && [...byCluster.values()].some((l) => l.length)) {
    for (const list of byCluster.values()) {
      const next = list.shift();
      if (next) picked.push(next);
      if (picked.length >= n) break;
    }
  }
  return picked;
}
