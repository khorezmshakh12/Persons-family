// Script injected into the unmodified Task Tracker page (src/tracker/tracker.html).
// The page keeps its whole workspace in localStorage['quietProgressDB']; this
// seeds that key with the signed-in employee's own server copy (or clears it,
// so a previous user's sheet on a shared browser never shows) and mirrors
// every save back to /staff/api/task-tracker/state.

export type TrackerBoot = { data: unknown; lang: 'uz' | 'en' | 'ru'; api: string };

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export const trackerBridge = (boot: TrackerBoot) => `<script>
(function(){
  var B=${json(boot)}, KEY='quietProgressDB';
  var set=Storage.prototype.setItem, t=null, pending=null;
  var last=B.data?JSON.stringify(B.data):null;
  try{
    if(last) set.call(localStorage,KEY,last); else localStorage.removeItem(KEY);
    set.call(localStorage,'qp_lang',B.lang);
  }catch(e){}
  Storage.prototype.setItem=function(k,v){
    set.apply(this,arguments);
    if(this===localStorage&&k===KEY&&v!==last){ pending=v; clearTimeout(t); t=setTimeout(sync,700); }
  };
  function badge(ok){ try{ setSaveBadge(ok?'✓ Saqlandi':'⚠ Saqlanmadi', ok?'var(--neon-mint)':'var(--neon-red)'); }catch(e){} }
  function sync(keepalive){
    if(pending===null) return;
    var raw=pending; pending=null;
    fetch(B.api,{method:'PUT',keepalive:!!keepalive,headers:{'content-type':'application/json'},body:'{"data":'+raw+'}'})
      .then(function(r){ if(!r.ok) throw r; last=raw; badge(true); })
      .catch(function(){ if(pending===null) pending=raw; badge(false); clearTimeout(t); t=setTimeout(sync,5000); });
  }
  addEventListener('pagehide',function(){ if(pending!==null){ clearTimeout(t); sync(true); } });
})();
</script><style>.global-portal-bar,#shareBtn{display:none!important}</style>`;
