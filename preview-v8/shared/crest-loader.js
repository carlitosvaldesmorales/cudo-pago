(()=>{
  const SRC='../media/crests-hd.webp?v=20260908-2200';
  const img=new Image();
  img.onload=()=>{
    if(img.naturalWidth!==1024||img.naturalHeight!==768){
      console.error('crest_loader',`crest_dimensions_${img.naturalWidth}x${img.naturalHeight}`);
      document.documentElement.classList.add('crests-failed');
      return;
    }
    document.documentElement.style.setProperty('--champ-crest-image',`url("${SRC}")`);
    document.documentElement.classList.add('crests-ready');
  };
  img.onerror=()=>{
    console.error('crest_loader','crest_asset_unavailable');
    document.documentElement.classList.add('crests-failed');
  };
  img.src=SRC;
})();