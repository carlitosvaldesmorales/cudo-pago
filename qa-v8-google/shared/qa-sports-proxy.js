(()=>{
  const WORKER='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
  const local=/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const proxyBase=local?'http://127.0.0.1:19095':`${location.origin}/qa-api`;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    const raw=typeof input==='string'?input:String(input&&input.url||'');
    if(!raw.startsWith(WORKER)) return nativeFetch(input,init);
    const target=proxyBase+raw.slice(WORKER.length);
    return nativeFetch(target,init);
  };
})();
