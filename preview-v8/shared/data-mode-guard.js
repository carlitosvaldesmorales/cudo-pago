(()=>{
  const current=document.currentScript;
  const base=current?new URL('.',current.src):new URL('./',location.href);
  const modeUrl=new URL('../data/mode.json',base).href;
  const priorFetch=window.fetch.bind(window);
  let modePromise;
  const getMode=()=>modePromise||(modePromise=priorFetch(modeUrl,{cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(v=>String(v?.mode||'seed').toLowerCase())
    .catch(()=> 'seed'));

  window.fetch=async(input,init)=>{
    const response=await priorFetch(input,init);
    const isSeed=response?.headers?.get('X-CUDO-Seed')==='true';
    if(!isSeed)return response;
    const mode=await getMode();
    if(mode!=='production')return response;
    let type='unknown';
    try{
      const raw=typeof input==='string'?input:(input&&input.url)||'';
      const m=new URL(raw,location.href).pathname.match(/\/data\/(equipos|plantel|noticias|galeria|partidos|tabla)\.json$/);
      if(m)type=m[1];
    }catch{}
    return new Response(JSON.stringify({
      schema_version:'1.0',
      generated_at:new Date().toISOString(),
      source:`CUDO_WEB_${type.toUpperCase()}`,
      items:[]
    }),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','X-CUDO-Data-Mode':'production-empty'}});
  };
})();
