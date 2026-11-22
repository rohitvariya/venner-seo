import { redirect } from "next/navigation";

export default async function PostsRedirect({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  redirect(`/sites/${siteId}/content?tab=social`);
}
