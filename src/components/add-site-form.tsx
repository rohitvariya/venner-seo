"use client";

import { useActionState, useState } from "react";
import { addSite } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function AddSiteForm() {
  const [state, action] = useActionState(addSite, undefined);
  // Controlled so values survive React's automatic form reset after a failed submit.
  const [domain, setDomain] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="domain">Website</label>
        <input className="input" id="domain" name="domain" placeholder="yourbusiness.com" required
          value={domain} onChange={(e) => setDomain(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">We read the site to learn the business and its services.</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">Business phone</label>
        <input className="input" id="phone" name="phone" type="tel" placeholder="+91 98765 43210" required
          value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">Used in calls to action. Include the country code.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending="Starting scan…">Scan my site</SubmitButton>
    </form>
  );
}
