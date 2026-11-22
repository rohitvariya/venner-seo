// Featured images from Unsplash (free API: https://unsplash.com/developers).
// Optional: set UNSPLASH_ACCESS_KEY. Unsplash requires crediting the photographer,
// which we put in the image caption, and pinging download_location when a photo is used.

export type StockPhoto = { url: string; alt: string; caption: string };

export function stockPhotosEnabled() {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

export async function findStockPhoto(query: string): Promise<StockPhoto | null> {
  if (!stockPhotosEnabled()) return null;
  const headers = { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" };
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=5&content_filter=high`,
    { headers, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Unsplash search failed (${res.status})`);
  type Photo = {
    alt_description: string | null;
    urls: { regular: string };
    links: { download_location: string };
    user: { name: string; links: { html: string } };
  };
  const json = (await res.json()) as { results: Photo[] };
  const photo = json.results[0];
  if (!photo) return null;
  // Required by Unsplash API guidelines when a photo is used.
  fetch(photo.links.download_location, { headers }).catch(() => undefined);
  const ref = "?utm_source=venner_seo&utm_medium=referral";
  return {
    url: photo.urls.regular,
    alt: photo.alt_description ?? query,
    caption: `Photo by <a href="${photo.user.links.html}${ref}">${photo.user.name}</a> on <a href="https://unsplash.com/${ref}">Unsplash</a>`,
  };
}
