(()=>{
  const qaMode=new URLSearchParams(window.location.search).get('qa')==='1';
  document.documentElement.classList.toggle('qa-mode',qaMode);

  const style=document.createElement('style');
  style.textContent=`
    .qa{display:none!important}
    .qa-mode .qa{display:block!important}
    .mobilepanel .mobilecta{background:#e21b2d!important;border-radius:10px!important;text-align:center!important;margin-top:10px!important;border-bottom:0!important;color:#fff!important}
    .status[hidden]{display:none!important}
    .gallerytoolbar>*{min-width:0!important}
    .gallerytoolbar select{width:100%!important;min-width:0!important;max-width:100%!important}
    .albumcard{min-width:0!important}
    .albumcard strong,.albumcard span{overflow-wrap:anywhere}
    @media(max-width:900px){.galleryalbums{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:620px){.galleryalbums{grid-template-columns:minmax(0,1fr)!important}}
  `;
  document.head.append(style);

  // V8 ya define Partidos en el HTML. Marcamos la navegación declarativa para impedir
  // que la compatibilidad heredada de V7 inserte un segundo enlace o una ruta incorrecta.
  document.querySelectorAll('.navlinks,.mobilepanel').forEach(container=>{
    const matches=[...container.querySelectorAll('a')].filter(a=>a.textContent.trim().toUpperCase()==='PARTIDOS');
    matches.forEach((a,index)=>{
      if(index===0)a.dataset.navPartidos='static';
      else a.remove();
    });
  });

  // La jerarquía de conversión del diseñador debe existir también en móvil.
  const socioUrl='https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=9871c8d3369f4f62a8c4e33a8cc3a643';
  document.querySelectorAll('.mobilepanel').forEach(panel=>{
    const exists=[...panel.querySelectorAll('a')].some(a=>a.textContent.trim().toUpperCase().includes('HAZTE SOCIO'));
    if(!exists){
      const a=document.createElement('a');
      a.href=socioUrl;
      a.target='_blank';
      a.rel='noopener';
      a.className='mobilecta';
      a.textContent='HAZTE SOCIO';
      panel.append(a);
    }
  });

  // El estado técnico sirve al QA, no a la audiencia. Se oculta cuando la carga fue exitosa.
  const normalizeStatus=node=>{
    if(!node||!node.classList?.contains('status'))return;
    const value=node.textContent.trim();
    node.hidden=/^Fuente pública:/i.test(value);
  };
  document.querySelectorAll('.status').forEach(normalizeStatus);
  const observer=new MutationObserver(records=>records.forEach(record=>normalizeStatus(record.target.nodeType===1?record.target:record.target.parentElement)));
  document.querySelectorAll('.status').forEach(node=>observer.observe(node,{childList:true,subtree:true,characterData:true}));

  // Un fallo de imagen nunca debe dejar el ícono roto del navegador en una vista de club.
  const fallbackSvg=label=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#03163d"/><stop offset="1" stop-color="#0751a5"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><path d="M610 -40 L760 -40 L520 560 L370 560 Z" fill="#f3c53b" opacity=".9"/><path d="M690 -40 L800 -40 L560 560 L450 560 Z" fill="#e21b2d" opacity=".92"/><text x="52" y="390" fill="white" font-family="Arial" font-size="78" font-weight="800">C.U.D.O.</text><text x="55" y="445" fill="#f3c53b" font-family="Arial" font-size="28" font-weight="700">${String(label||'IMAGEN MOCK').replace(/[<>&]/g,'')}</text></svg>`)}`;
  const bindImages=()=>document.querySelectorAll('img').forEach(img=>{
    if(img.dataset.cudoFallbackBound)return;
    img.dataset.cudoFallbackBound='1';
    img.addEventListener('error',()=>{
      if(img.dataset.cudoFallbackApplied)return;
      img.dataset.cudoFallbackApplied='1';
      img.src=fallbackSvg(img.alt||'IMAGEN MOCK');
    });
  });
  bindImages();
  new MutationObserver(bindImages).observe(document.body,{childList:true,subtree:true});
})();
