/** GitHub-style heading slug, matching the "#..." jump-links the writer produces. */
export function slugify(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;|&#\d+;/gi, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

/** Adds id attributes to h2/h3 tags so in-article jump-links (#section) work. */
export function addHeadingIds(html: string) {
  const used = new Set<string>();
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    let id = slugify(inner) || "section";
    while (used.has(id)) id += "-1";
    used.add(id);
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

/** Turns markdown links into plain text, for showing quoted claims. */
export function stripMarkdownLinks(s: string) {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
