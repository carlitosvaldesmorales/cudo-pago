(()=>{
  if(window.CUDO_ADOPTION&&window.CUDO_ADOPTION.version==='1.0') return;

  const ROOT='/preview-v8/';
  const STORAGE_KEY='cudo-mobile-adoption-v1-sent';
  const ALLOWED_TRIGGER=new Set(['pointerdown','keydown']);
  const config=window.CUDO_ADOPTION_CONFIG||{};
  const state={
    version:'1.0',
    schema_version:'CUDO_MOBILE_ADOPTION_EVENT_V1',
    enabled:config.enabled===true,
    eligible:false,
    emitted:false,
    reason:null,
    endpoint:null
  };
  window.CUDO_ADOPTION=state;

  const isProductionSurface=()=>location.origin==='https://cudo.cl'&&location.pathname.startsWith(ROOT);
  const isStandalone=()=>(
    window.matchMedia?.('(display-mode: standalone)').matches===true ||
    navigator.standalone===true ||
    document.referrer.startsWith('android-app://')
  );
  const isAutomation=()=>navigator.webdriver===true;
  const endpoint=()=>{
    try{
      const url=new URL(String(config.endpoint||''));
      if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.startsWith('/macros/s/')) return null;
      return url.href;
    }catch{return null;}
  };
  const alreadySent=()=>{
    try{return localStorage.getItem(STORAGE_KEY)==='1';}catch{return false;}
  };
  const rememberSent=()=>{
    try{localStorage.setItem(STORAGE_KEY,'1');}catch{}
  };
  const route=()=>{
    const path=String(location.pathname||ROOT);
    return path.startsWith(ROOT)?path:ROOT;
  };
  const payload=trigger=>({
    schema_version:'CUDO_MOBILE_ADOPTION_EVENT_V1',
    event_type:'mobile.production.adoption.observed',
    app_version:String(window.CUDO_PWA?.version||'unknown').slice(0,32),
    route:route().slice(0,180),
    display_mode:'standalone',
    trigger
  });

  async function transmit(body){
    const url=endpoint();
    if(!url) return false;
    const serialized=JSON.stringify(body);
    if(navigator.sendBeacon){
      try{
        const ok=navigator.sendBeacon(url,new Blob([serialized],{type:'text/plain;charset=UTF-8'}));
        if(ok) return true;
      }catch{}
    }
    try{
      await fetch(url,{
        method:'POST',
        mode:'no-cors',
        cache:'no-store',
        keepalive:true,
        headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:serialized
      });
      return true;
    }catch{return false;}
  }

  async function observe(event){
    if(state.emitted||!state.eligible) return;
    if(!event||event.isTrusted!==true||!ALLOWED_TRIGGER.has(event.type)) return;
    state.emitted=true;
    const ok=await transmit(payload(event.type));
    if(ok){
      rememberSent();
      state.reason='EMITTED';
    }else{
      state.emitted=false;
      state.reason='DELIVERY_FAILED';
    }
  }

  function initialize(){
    if(!state.enabled){state.reason='DISABLED';return;}
    if(!isProductionSurface()){state.reason='NON_PRODUCTION_SURFACE';return;}
    if(isAutomation()){state.reason='AUTOMATION';return;}
    if(!isStandalone()){state.reason='NOT_STANDALONE';return;}
    if(!endpoint()){state.reason='INVALID_ENDPOINT';return;}
    if(alreadySent()){state.reason='ALREADY_RECORDED';return;}
    state.eligible=true;
    state.reason='WAITING_TRUSTED_INTERACTION';
    addEventListener('pointerdown',observe,{capture:true,once:false,passive:true});
    addEventListener('keydown',observe,{capture:true,once:false});
  }

  state.payload=payload;
  state.initialize=initialize;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
