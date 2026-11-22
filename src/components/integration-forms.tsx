"use client";

import { useActionState } from "react";
import { connectShopify, connectWordPress, saveCustomSite } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function WordPressForm({ siteId, defaultUrl }: { siteId: string; defaultUrl: string }) {
  const [state, action] = useActionState(connectWordPress.bind(null, siteId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Site URL</label>
        <input name="siteUrl" className="input" defaultValue={defaultUrl} placeholder="https://yourbusiness.com" />
      </div>
      <div>
        <label className="label">Username</label>
        <input name="username" className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label">Application password</label>
        <input name="appPassword" type="password" className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">In wp-admin go to Users → Profile → Application Passwords, add a new one and paste it here.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending="Checking…">Connect WordPress</SubmitButton>
    </form>
  );
}

export function ShopifyForm({ siteId }: { siteId: string }) {
  const [state, action] = useActionState(connectShopify.bind(null, siteId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Store domain</label>
        <input name="shopDomain" className="input" placeholder="your-store.myshopify.com" />
      </div>
      <div>
        <label className="label">Admin API access token</label>
        <input name="accessToken" type="password" className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">
          In Shopify admin: Settings → Apps → Develop apps → create an app with the read_content and write_content scopes, install it, and copy the Admin API token.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending="Checking…">Connect Shopify</SubmitButton>
    </form>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-secondary" onClick={() => navigator.clipboard?.writeText(value)}>Copy</button>
      </div>
    </div>
  );
}

export function CustomSiteForm({ siteId, connected, defaults }: {
  siteId: string;
  connected: boolean;
  defaults: { urlPattern: string; webhookUrl: string };
}) {
  const [state, action] = useActionState(saveCustomSite.bind(null, siteId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label">Article URL pattern</label>
        <input name="urlPattern" className="input" defaultValue={defaults.urlPattern} placeholder="https://example.com/blog/{slug}" />
        <p className="mt-1 text-xs text-slate-500">Where articles live on the site. Used for links, schema and the &quot;View live post&quot; button.</p>
      </div>
      <div>
        <label className="label">Webhook URL <span className="font-normal text-slate-400">(optional)</span></label>
        <input name="webhookUrl" className="input" defaultValue={defaults.webhookUrl} placeholder="https://example.com/api/venner-webhook" />
        <p className="mt-1 text-xs text-slate-500">We POST each article here the moment it&apos;s published or sent as a draft, so the site can rebuild or store it.</p>
      </div>
      {connected && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="regenerate" /> Generate a new API key and webhook secret (the old ones stop working)
        </label>
      )}
      <FormMessage state={state} />
      {state?.apiKey && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <CopyField label="Content API key" value={state.apiKey} />
          {state.webhookSecret && <CopyField label="Webhook signing secret" value={state.webhookSecret} />}
          <p className="text-xs text-amber-800">Store these in the site&apos;s environment variables. They are shown only once.</p>
        </div>
      )}
      <SubmitButton pending="Saving…">{connected ? "Save" : "Connect custom site"}</SubmitButton>
    </form>
  );
}
