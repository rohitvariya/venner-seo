import { CORS, json } from "../../_shared";
import { testimonialsForKey } from "@/lib/testimonials";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const data = await testimonialsForKey(key);
  if (!data) return json({ error: "Unknown widget" }, 404);
  return json(data, 200, { "Cache-Control": "public, max-age=300" });
}
