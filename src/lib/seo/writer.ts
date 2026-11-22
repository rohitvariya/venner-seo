import { structured, text } from "../ai";
import type { FactIssue } from "../schema";

export type Brief = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  searchIntent: string;
  audience: string;
  secondaryKeywords: string[];
  category: string;
  tags: string[];
  outline: { heading: string; points: string[] }[];
  internalLinks: { anchor: string; url: string }[];
  faq: { question: string; answer: string }[];
  keyTakeaways: string[];
  cta: string;
};

const RULES =
  "Never invent facts, prices, statistics, awards, client names, case-study results, reviews or guarantees. " +
  "Only use numbers and proof points listed in the business context. If you need a general industry figure, " +
  "describe it qualitatively instead of quoting a number.";

export async function createBrief(context: string, keyword: string, existingTitles: string[]): Promise<Brief> {
  return structured<Brief>({
    system:
      "You are a senior SEO content strategist planning in-depth blog articles for businesses. Articles must be the " +
      "most useful page on the internet for the search: genuinely helpful to a buyer, grounded in the business's " +
      "real services and proof points, and structured so Google and AI assistants (ChatGPT, Perplexity, Google AI " +
      "Overviews) can quote them: a direct answer up top, clear question-style headings, short definitions, " +
      "comparison tables, checklists, FAQs and key takeaways. " + RULES,
    prompt:
      `${context}\n\nTarget keyword: "${keyword}"\n` +
      (existingTitles.length
        ? `Already published or planned titles (cover a different angle, do not duplicate):\n- ${existingTitles.slice(0, 60).join("\n- ")}\n`
        : "") +
      "\nCreate the article brief:\n" +
      "- 9-14 H2 sections (some with H3 sub-points). Include: 'At a glance' summary; a 'What is…' definition; " +
      "how it works / step-by-step; a comparison (e.g. options, platforms, approaches) suited to a table; costs or " +
      "factors to consider (no invented prices); mistakes to avoid; a copyable checklist; a local section for the " +
      "business's city/service areas when relevant; a section on how this business helps (using its real proof points).\n" +
      "- 3-6 internal links chosen ONLY from the listed site pages and published articles (prefer related articles " +
      "in the same topic and the most relevant service page).\n" +
      "- 5-6 FAQs with 2-3 sentence answers; 4-5 key takeaways.\n" +
      "- 3-6 secondary keywords this article can also rank for.\n" +
      "- A call to action using the business's real contact details.",
    schemaName: "article_brief",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Compelling H1 containing the keyword naturally, under 70 chars" },
        slug: { type: "string", description: "kebab-case URL slug, 3-7 words, contains the keyword" },
        metaTitle: { type: "string", description: "Under 60 characters, includes keyword" },
        metaDescription: { type: "string", description: "140-155 characters, includes keyword, has a reason to click" },
        searchIntent: { type: "string" },
        audience: { type: "string" },
        secondaryKeywords: { type: "array", items: { type: "string" } },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        outline: {
          type: "array",
          items: {
            type: "object",
            properties: { heading: { type: "string" }, points: { type: "array", items: { type: "string" } } },
            required: ["heading", "points"],
          },
        },
        internalLinks: {
          type: "array",
          items: {
            type: "object",
            properties: { anchor: { type: "string" }, url: { type: "string" } },
            required: ["anchor", "url"],
          },
        },
        faq: {
          type: "array",
          items: {
            type: "object",
            properties: { question: { type: "string" }, answer: { type: "string" } },
            required: ["question", "answer"],
          },
        },
        keyTakeaways: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
      },
      required: [
        "title", "slug", "metaTitle", "metaDescription", "searchIntent", "audience", "secondaryKeywords",
        "category", "tags", "outline", "internalLinks", "faq", "keyTakeaways", "cta",
      ],
    },
    maxTokens: 6000,
  });
}

export async function writeArticle(context: string, keyword: string, brief: Brief, language = "en"): Promise<string> {
  return text({
    system:
      "You are an expert writer producing in-depth, people-first articles for businesses. Write like a practitioner " +
      "explaining to a smart client: specific, practical, confident, concrete examples, short paragraphs (2-4 " +
      "sentences). No fluff or hype phrases ('unlock', 'elevate', 'in today's fast-paced world', 'game-changer', " +
      "'delve'). Mention the business naturally where it genuinely helps the reader (about 4-6 times), never as a " +
      "sales pitch in every section. " + RULES + " Output GitHub-flavoured Markdown only: no H1 (the title is " +
      "separate), ## and ### headings, bullet and numbered lists, at least one markdown table, bold for key terms, " +
      "and markdown links for internal links.",
    prompt:
      `${context}\n\nWrite the full article in language "${language}". Length: 2,500-3,500 words.\n\n` +
      `Target keyword: "${keyword}". Use it in the first 100 words, in at least two H2s, and naturally throughout. ` +
      `Also cover these related searches naturally: ${brief.secondaryKeywords.join(", ")}.\n\n` +
      `Brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
      "Structure requirements:\n" +
      "1. Opening: a 2-3 sentence direct answer to the search (quotable on its own), then one short paragraph on what the reader will learn.\n" +
      "2. '## At a glance' with 4-6 bullets.\n" +
      "3. Follow the outline headings in order. Start each H2 section with a one or two sentence direct answer, then detail.\n" +
      "4. At least one comparison table and one numbered step-by-step list; a '- [ ]' style checklist section.\n" +
      "5. Include every internal link from the brief exactly once, with its anchor text, where it fits naturally.\n" +
      "6. '## Frequently asked questions' with each FAQ as ### question + answer.\n" +
      "7. '## Key takeaways' bullet list.\n" +
      "8. Close with a short paragraph containing the call to action.\n" +
      "9. Where the article relies on a standard, regulation, platform or widely known guideline, link 1-3 " +
      "authoritative outside sources (official documentation, standards bodies, government sites). Use only stable, " +
      "well-known URLs you are certain exist (a site's homepage or main docs page), never guessed deep links.",
    maxTokens: 16000,
  });
}

/**
 * Second pass: checks the draft against the business context for invented or contradicting claims
 * (numbers, prices, awards, client names, guarantees). Returns issues for the editor to review.
 */
export async function factCheck(context: string, contentMd: string): Promise<FactIssue[]> {
  const out = await structured<{ issues: FactIssue[] }>({
    system:
      "You are a careful fact-checker for a business blog. Compare the article against the business context. Flag " +
      "only claims about THIS business or specific numbers that are not supported by the context or contradict it: " +
      "invented statistics, prices, client counts, ratings, awards, case-study results, guarantees, wrong contact " +
      "details, services the business does not offer. Do not flag general, widely accepted industry knowledge.",
    prompt: `Business context:\n${context}\n\nArticle:\n${contentMd.slice(0, 60_000)}\n\nList the problems (empty list if none).`,
    schemaName: "fact_check",
    schema: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claim: { type: "string", description: "The exact sentence or phrase from the article" },
              problem: { type: "string" },
              suggestion: { type: "string", description: "How to fix it" },
            },
            required: ["claim", "problem", "suggestion"],
          },
        },
      },
      required: ["issues"],
    },
    maxTokens: 3000,
  });
  return out.issues;
}
