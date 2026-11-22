"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Upload } from "lucide-react";
import { uploadPhotos } from "@/app/actions";
import { FormMessage } from "../ui";

function Pending() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-sm text-brand-600">Uploading and describing…</span> : null;
}

export function PhotoUpload({ siteId }: { siteId: string }) {
  const [state, action] = useActionState(uploadPhotos.bind(null, siteId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <label className="btn-secondary cursor-pointer">
        <Upload size={15} /> Choose photos
        <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
          onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      <Pending />
      <span className="text-xs text-slate-500">Up to 10 at a time, 10 MB each. JPEG, PNG or WebP. Each photo is described automatically.</span>
      <FormMessage state={state} />
    </form>
  );
}
