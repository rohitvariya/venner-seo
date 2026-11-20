"use client";

import { useActionState } from "react";
import { connectShopify, connectWordPress } from "@/app/actions";
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
