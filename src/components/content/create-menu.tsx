"use client";

import { useActionState, useState } from "react";
import { ChevronDown, FileText, MapPin, PenLine, Plus, Share2, Sparkles, X } from "lucide-react";
import { createArticleFromTopic, createBlankArticle, createPost } from "@/app/actions";
import { FormMessage, SubmitButton } from "../ui";

export function CreateMenu({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [state, action] = useActionState(createArticleFromTopic.bind(null, siteId), undefined);

  const Item = ({ icon: Icon, label, onClick, ai }: { icon: React.ElementType; label: string; onClick: () => void; ai?: boolean }) => (
    <button onClick={() => { setOpen(false); onClick(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
      <Icon size={15} className="text-slate-500" /> <span className="flex-1">{label}</span> {ai && <Sparkles size={13} className="text-fuchsia-500" />}
    </button>
  );
  const post = (channel: "google" | "facebook", ai: boolean) => () => { void createPost(siteId, channel, ai); };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-primary"><Plus size={15} /> Create <ChevronDown size={14} /></button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          <div className="px-3 pb-1 pt-2 text-xs font-medium text-slate-400">Write with AI</div>
          <Item icon={FileText} label="Blog article" ai onClick={() => setTopicOpen(true)} />
          <Item icon={Share2} label="Social post" ai onClick={post("facebook", true)} />
          <Item icon={MapPin} label="Google post" ai onClick={post("google", true)} />
          <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-xs font-medium text-slate-400">Write it myself</div>
          <Item icon={PenLine} label="Blog article" onClick={() => { void createBlankArticle(siteId); }} />
          <Item icon={PenLine} label="Social post" onClick={post("facebook", false)} />
          <Item icon={PenLine} label="Google post" onClick={post("google", false)} />
        </div>
      )}
      {topicOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={() => setTopicOpen(false)}>
          <form action={action} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">New article with AI</h3>
              <button type="button" onClick={() => setTopicOpen(false)} className="text-slate-400"><X size={16} /></button>
            </div>
            <div>
              <label className="label" htmlFor="topic">Topic or main search</label>
              <input id="topic" name="topic" className="input" placeholder="e.g. shopify store maintenance checklist" autoFocus />
              <p className="mt-1 text-xs text-slate-500">We research it, plan it around your business and write a full draft for your OK (about 2 minutes).</p>
            </div>
            <FormMessage state={state} />
            <SubmitButton pending="Starting…">Write article</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
