import { structured, text } from "../ai";

export type Brief = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  searchIntent: string;
  audience: string;
  outline: { heading: string; points: string[] }[];
  internalLinks: { anchor: string; url: string }[];
  faq: { question: string; answer: string }[];
  cta: string;
};

export async function createBrief(context: string, keyword: string, existingTitles: string[]): Promise<Brief> {
  return structured<Brief>({
    system:
      "You plan SEO blog articles for small businesses. Articles must be genuinely helpful to a buyer, grounded " +
      "in the business's real services, and structured so search engines and AI assistants can quote them " +
      "(clear headings, direct answers, short definitions, FAQs). Never promise results or invent facts, prices, " +
      "awards, client names or statistics.",
    prompt: `${context}\n\nTarget keyword: "${keyword}"\n` +
      (existingTitles.length ? `Already published or planned titles (do not duplicate):\n- ${existingTitles.slice(0, 40).join("\n- ")}\n` : "") +
      "\nCreate the article brief. Include 5-8 H2 sections, 2-4 internal links chosen ONLY from the listed site " +
      "pages, 3-5 FAQs with concise answers, and a closing call to action using the business's real contact details.",
    schemaName: "article_brief",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Compelling H1, contains the keyword naturally, under 70 chars" },
        slug: { type: "string", description: "kebab-case URL slug, 3-7 words" },
        metaTitle: { type: "string", description: "Under 60 characters" },
        metaDescription: { type: "string", description: "140-160 characters, includes keyword" },
        searchIntent: { type: "string" },
        audience: { type: "string" },
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
        cta: { type: "string" },
      },
      required: ["title", "slug", "metaTitle", "metaDescription", "searchIntent", "audience", "outline", "internalLinks", "faq", "cta"],
    },
  });
}

export async function writeArticle(context: string, keyword: string, brief: Brief, language = "en"): Promise<string> {
  return text({
    system:
      "You are an expert content writer for small businesses. Write in a clear, practical, human voice: short " +
      "paragraphs, concrete examples, no fluff, no hype words (e.g. 'unlock', 'elevate', 'in today's fast-paced world'). " +
      "Never invent statistics, prices, client names, reviews or guarantees. Mention the business naturally, at most " +
      "3-4 times. Output GitHub-flavoured Markdown only: no H1 (the title is separate), use ## and ### headings, " +
      "bullet lists where useful, and markdown links for internal links.",
    prompt: `${context}\n\nWrite the full article in language "${language}" (1200-1800 words).\n\n` +
      `Target keyword: "${keyword}" — use it in the first 100 words and in at least one H2, naturally.\n\n` +
      `Brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
      "Requirements:\n- Open with a 2-3 sentence direct answer to the search intent.\n" +
      "- Follow the outline headings.\n- Include every internal link from the brief exactly once with its anchor.\n" +
      "- End with a '## Frequently asked questions' section using the brief's FAQs (### per question), " +
      "then a short closing paragraph with the call to action.",
    maxTokens: 8000,
  });
}
