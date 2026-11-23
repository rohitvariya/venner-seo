// Embeddable testimonials widget: <div id="venner-testimonials"></div><script src=".../widget/w_xxx" async></script>
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const origin = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const api = `${origin}/api/public/v1/testimonials/${encodeURIComponent(key.replace(/\.js$/, ""))}`;
  const js = `(function(){
  var el=document.getElementById("venner-testimonials");
  if(!el){el=document.createElement("div");el.id="venner-testimonials";var s=document.currentScript;s&&s.parentNode.insertBefore(el,s);}
  function esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML;}
  function stars(n){return "★★★★★".slice(0,n)+"☆☆☆☆☆".slice(0,5-n);}
  fetch(${JSON.stringify(api)}).then(function(r){return r.json();}).then(function(d){
    if(!d||!d.testimonials||!d.testimonials.length)return;
    var css="#venner-testimonials{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"+
      "#venner-testimonials .vt-head{display:flex;align-items:center;gap:8px;margin:0 0 16px;font-size:15px;color:#334155}"+
      "#venner-testimonials .vt-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}"+
      "#venner-testimonials .vt-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}"+
      "#venner-testimonials .vt-stars{color:#f59e0b;letter-spacing:2px}"+
      "#venner-testimonials .vt-text{margin:10px 0;color:#1e293b;font-size:14px;line-height:1.6}"+
      "#venner-testimonials .vt-name{font-weight:600;font-size:13px;color:#0f172a}"+
      "#venner-testimonials .vt-src{font-size:12px;color:#64748b}";
    var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
    var head=d.average?'<div class="vt-head"><span class="vt-stars">'+stars(Math.round(d.average))+'</span><b>'+d.average+'</b> from '+d.total+' Google reviews</div>':"";
    el.innerHTML=head+'<div class="vt-grid">'+d.testimonials.map(function(t){
      return '<div class="vt-card"><div class="vt-stars">'+stars(t.rating)+'</div><p class="vt-text">'+esc(t.text)+'</p><div class="vt-name">'+esc(t.name)+'</div><div class="vt-src">Google review'+(t.date?" · "+t.date:"")+'</div></div>';
    }).join("")+'</div>';
  }).catch(function(){});
})();`;
  return new Response(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
