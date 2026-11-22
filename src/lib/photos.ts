import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { model } from "./ai";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function photoUrl(id: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/photos/${id}`;
}

/** Describes a photo with Claude vision so it can be matched to articles and posts. */
export async function describePhoto(data: Buffer, mime: string): Promise<{ description: string; tags: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) return { description: "", tags: [] };
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: model(),
    max_tokens: 400,
    tools: [{
      name: "photo",
      description: "Describe the photo.",
      input_schema: {
        type: "object",
        properties: {
          description: { type: "string", description: "One factual sentence: what the photo shows (people, place, work, product)." },
          tags: { type: "array", items: { type: "string" }, description: "5-10 lowercase topic tags" },
        },
        required: ["description", "tags"],
      },
    }],
    tool_choice: { type: "auto" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: data.toString("base64") } },
        { type: "text", text: "Describe this business photo by calling the photo tool." },
      ],
    }],
  });
  const block = res.content.find((c) => c.type === "tool_use");
  if (block && block.type === "tool_use") return block.input as { description: string; tags: string[] };
  return { description: "", tags: [] };
}

export async function savePhoto(siteId: string, file: File) {
  if (!ALLOWED.includes(file.type)) throw new Error(`${file.name}: only JPEG, PNG or WebP`);
  if (file.size > MAX_PHOTO_BYTES) throw new Error(`${file.name}: larger than 10 MB`);
  const data = Buffer.from(await file.arrayBuffer());
  let meta = { description: "", tags: [] as string[] };
  try {
    meta = await describePhoto(data, file.type);
  } catch (err) {
    console.error("Photo description failed:", err);
  }
  await db.insert(schema.photos).values({
    siteId, mime: file.type, data, bytes: file.size, filename: file.name, description: meta.description || null, tags: meta.tags,
  });
}

/**
 * Picks the library photo that best matches a topic (tag/description word overlap), preferring
 * less-used photos. With usage "always" any photo is used; "relevant" needs some overlap.
 */
export async function pickPhoto(siteId: string, topic: string, usage: "always" | "relevant" | "never") {
  if (usage === "never") return null;
  const list = await db.query.photos.findMany({
    where: eq(schema.photos.siteId, siteId),
    columns: { id: true, description: true, tags: true, usedCount: true },
    orderBy: desc(schema.photos.createdAt),
    limit: 200,
  });
  if (list.length === 0) return null;
  const words = new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const scored = list
    .map((p) => {
      const hay = `${p.description ?? ""} ${p.tags.join(" ")}`.toLowerCase();
      const overlap = [...words].filter((w) => hay.includes(w)).length;
      return { p, score: overlap * 10 - p.usedCount };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (usage === "relevant" && best.score < 10) return null;
  await db.update(schema.photos).set({ usedCount: sql`${schema.photos.usedCount} + 1` }).where(and(eq(schema.photos.id, best.p.id)));
  return { url: photoUrl(best.p.id), alt: best.p.description ?? topic };
}
