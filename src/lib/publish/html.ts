import { marked } from "marked";

type Faq = { question: string; answer: string }[];

/** Converts article markdown to HTML and appends FAQPage JSON-LD for rich results / AI answers. */
export function articleHtml(contentMd: string, faq: Faq | null | undefined): string {
  const html = marked.parse(contentMd, { async: false }) as string;
  if (!faq || faq.length === 0) return html;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  const json = JSON.stringify(schema).replace(/</g, "\\u003c");
  return `${html}\n<script type="application/ld+json">${json}</script>`;
}
