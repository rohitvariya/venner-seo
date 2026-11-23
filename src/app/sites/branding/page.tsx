import Link from "next/link";
import { requireAgency } from "@/lib/auth";
import { saveBranding } from "@/app/actions";
import { BrandingForm } from "@/components/client/branding-form";

export default async function BrandingPage() {
  const { workspace } = await requireAgency();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <Link href="/sites" className="text-sm text-brand-600">← Clients</Link>
      <div>
        <h1 className="text-2xl font-semibold">Agency branding</h1>
        <p className="text-sm text-slate-500">Shown on client reports, client logins and invite pages.</p>
      </div>
      <BrandingForm
        action={saveBranding}
        defaults={{ brandName: workspace.brandName ?? workspace.name, logoUrl: workspace.logoUrl ?? "", brandColor: workspace.brandColor ?? "#4f46e5", reportFooter: workspace.reportFooter ?? "" }}
      />
    </div>
  );
}
