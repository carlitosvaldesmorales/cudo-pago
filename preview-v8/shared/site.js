(()=>{
  const current=document.currentScript;
  const base=current?new URL('.',current.src).href:'./';
  const root=current?new URL('../',current.src).href:new URL('./',location.href).href;
  window.CUDO_V8_ROOT=root;

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    const url=typeof input==='string'?input:String(input&&input.url||'');
    if(!/\/data\/[a-z0-9_-]+\.json(?:\?|$)/i.test(url)||!response.ok)return response;
    try{
      const data=await response.clone().json();
      if(data&&Array.isArray(data.items)){
        data.items=data.items.map(item=>{
          if(!item||typeof item!=='object')return item;
          const next={...item};
          for(const key of ['imagen_ref','foto_ref','escudo_url']){
            const value=String(next[key]||'');
            if(value.startsWith('media/'))next[key]=new URL(value,root).href;
          }
          return next;
        });
        const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');
        return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
      }
    }catch{}
    return response;
  };

  document.write('<script src="'+base+'presentation-guard.js"><\/script>');
  document.write('<script src="'+base+'site-runtime-v8.js"><\/script>');
})();
