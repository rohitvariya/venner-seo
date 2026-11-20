import { marked } from "marked";
import type { Blueprint } from "../schema";

type Faq = { question: string; answer: string }[];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jsonLd = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

/**
 * Converts article markdown to publishable HTML: optional hero image, author byline and bio box
 * (E-E-A-T), plus BlogPosting and FAQPage structured data for rich results and AI answers.
 */
export function articleHtml(
  contentMd: string,
  faq: Faq | null | undefined,
  opts: {
    title?: string;
    description?: string | null;
    url?: string | null;
    heroImageUrl?: string | null;
    author?: Blueprint["author"];
    publisher?: string;
    datePublished?: Date;
  } = {},
): string {
  const parts: string[] = [];
  const author = opts.author?.name ? opts.author : null;

  if (opts.heroImageUrl) {
    parts.push(`<figure class="vs-hero"><img src="${esc(opts.heroImageUrl)}" alt="${esc(opts.title ?? "")}" loading="eager" /></figure>`);
  }
  if (author) {
    parts.push(`<p class="vs-byline">By <strong>${esc(author.name)}</strong>${author.jobTitle ? `, ${esc(author.jobTitle)}` : ""}</p>`);
  }
  parts.push(marked.parse(contentMd, { async: false }) as string);

  if (author && author.bio) {
    const links = [
      author.aboutUrl && `<a href="${esc(author.aboutUrl)}">About</a>`,
      author.linkedin && `<a href="${esc(author.linkedin)}" rel="me">LinkedIn</a>`,
    ].filter(Boolean);
    parts.push(
      `<aside class="vs-author"><p><strong>About the author: ${esc(author.name)}</strong>${author.jobTitle ? ` — ${esc(author.jobTitle)}` : ""}</p>` +
        `<p>${esc(author.bio)}</p>${links.length ? `<p>${links.join(" · ")}</p>` : ""}</aside>`,
    );
  }

  if (opts.title) {
    parts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: opts.title,
        description: opts.description ?? undefined,
        image: opts.heroImageUrl ?? undefined,
        mainEntityOfPage: opts.url ?? undefined,
        datePublished: (opts.datePublished ?? new Date()).toISOString(),
        author: author
          ? {
              "@type": "Person",
              name: author.name,
              jobTitle: author.jobTitle || undefined,
              url: author.aboutUrl || undefined,
              sameAs: author.linkedin ? [author.linkedin] : undefined,
              knowsAbout: author.expertise.length ? author.expertise : undefined,
            }
          : { "@type": "Organization", name: opts.publisher },
        publisher: opts.publisher ? { "@type": "Organization", name: opts.publisher } : undefined,
      }),
    );
  }
  if (faq && faq.length > 0) {
    parts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      }),
    );
  }
  return parts.join("\n");
}
