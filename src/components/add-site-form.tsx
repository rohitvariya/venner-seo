"use client";

import { useActionState } from "react";
import { addSite } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function AddSiteForm() {
  const [state, action] = useActionState(addSite, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="domain">Website</label>
        <input className="input" id="domain" name="domain" placeholder="yourbusiness.com" required />
        <p className="mt-1 text-xs text-slate-500">We read the site to learn the business and its services.</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">Business phone</label>
        <input className="input" id="phone" name="phone" type="tel" placeholder="+91 98765 43210" required />
        <p className="mt-1 text-xs text-slate-500">Used in calls to action. Include the country code.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending="Starting scan…">Scan my site</SubmitButton>
    </form>
  );
}
