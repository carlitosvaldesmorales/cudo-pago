(()=>{
  const root=document.documentElement;
  const parts=['0.txt','1.txt','2a.txt','2b.txt'];
  Promise.all(parts.map(p=>fetch(`../media/crest-base64/${p}?v=20260908-2240`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`crest_chunk_${p}_${r.status}`);return r.text()})))
    .then(chunks=>{
      const b64=chunks.join('').replace(/\s+/g,'');
      if(!b64.startsWith('UklGR'))throw new Error('crest_invalid_webp_base64');
      root.style.setProperty('--champ-crest-image',`url("data:image/webp;base64,${b64}")`);
      root.classList.add('crests-ready');
    })
    .catch(e=>{console.error('crest_loader',e.message);root.classList.add('crests-failed')});
})();