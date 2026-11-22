import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Serves a library photo. Ids are unguessable; photos are meant for public posts and articles. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await db.query.photos.findFirst({ where: eq(schema.photos.id, id), columns: { mime: true, data: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
