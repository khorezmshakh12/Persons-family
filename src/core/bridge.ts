// Scripts injected around the unmodified Core v2 page (src/core/core.html).
// BEFORE: seeds localStorage['persons-core-v2'] (Core's own load() reads it)
// with the server state and mirrors every Core save() to the server.
// AFTER: sends Strategiya / Operatsiya / Perforce to the site's own pages
// and pulls other people's changes once a minute.

export const bridgeBefore = (boot: unknown) => `<script>
window.__CORE_BOOT=${JSON.stringify(boot).replace(/</g, '\u003c')};
(function(){
  var B=window.__CORE_BOOT, KEY='persons-core-v2', UIK='persons-core-ui-'+B.me;
  var UI={me:1,view:1,month:1,hrTab:1,hrSel:1,sf:1,sc:1,sTab:1,tTab:1,iTab:1,stTab:1};
  var ui={}; try{ ui=JSON.parse(localStorage.getItem(UIK)||'{}'); }catch(e){}
  var st=Object.assign({},B.state,ui,{me:B.me});
  window.__coreLast=JSON.parse(JSON.stringify(B.state));
  var set=Storage.prototype.setItem, t=null, busy=false;
  try{ set.call(localStorage,KEY,JSON.stringify(st)); }catch(e){}
  Storage.prototype.setItem=function(k,v){ set.apply(this,arguments); if(this===localStorage&&k===KEY){ clearTimeout(t); t=setTimeout(function(){ sync(v); },600); } };
  function note(m){ try{ toast(m); }catch(e){ console.warn(m); } }
  function sync(raw){ var S2; try{ S2=JSON.parse(raw); }catch(e){ return; }
    var last=window.__coreLast, u={}, p={}, k;
    for(k in S2){ if(UI[k]) u[k]=S2[k]; else if(JSON.stringify(S2[k])!==JSON.stringify(last[k])) p[k]=S2[k]; }
    try{ set.call(localStorage,UIK,JSON.stringify(u)); }catch(e){}
    if(!Object.keys(p).length) return;
    busy=true;
    fetch(B.api,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({patch:p,prevTasks:p.tasks?last.tasks:undefined})})
      .then(function(r){ return r.json(); }).then(function(res){
        for(k in p) last[k]=JSON.parse(JSON.stringify(p[k]));
        if(res.errors&&res.errors.length) note(res.errors[0]);
        if(res.state) window.__coreApply(res.state);
      }).catch(function(){ note("Saqlab bo'lmadi — internetni tekshiring"); })
      .finally(function(){ busy=false; });
  }
})();
</script>`;

export const bridgeAfter = (locale: string) => `<script>
(function(){
  var B=window.__CORE_BOOT;
  window.__coreApply=function(ns){
    var last=window.__coreLast;
    ['tasks','staff'].forEach(function(k){ if(ns[k]){ S[k]=ns[k]; last[k]=JSON.parse(JSON.stringify(ns[k])); } });
    Object.keys(ns).forEach(function(k){ if(k!=='tasks'&&k!=='staff'&&k!=='me'&&k!=='v'){ S[k]=ns[k]; last[k]=JSON.parse(JSON.stringify(ns[k])); } });
    P=S.staff; try{ render(true); }catch(e){}
  };
  var site={strategy:'strategy',ops:'operations',perforce:'perforce'};
  Object.keys(site).forEach(function(v){ PAGES[v]=function(el){ el.innerHTML='<div class="empty" style="padding:40px;text-align:center">Ochilmoqda…</div>'; window.top.location.href='/staff/${locale}/'+site[v]; }; });
  setInterval(function(){
    if(document.hidden||DR||document.querySelector('.dm-bg')||(document.activeElement&&document.activeElement.closest('input,textarea,select'))) return;
    fetch(B.api,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(res){ if(res&&res.state) window.__coreApply(res.state); }).catch(function(){});
  },60000);
})();
</script>`;
