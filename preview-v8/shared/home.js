(()=>{
  const fallback=new URL('../assets/estadio-cudo-hero.avif?v=faithful-hero-59506',location.href).href;

  const repairMedia=()=>{
    document.querySelectorAll('#homeNews img,#homeGallery img').forEach(img=>{
      if(img.dataset.homeGuard==='1')return;
      img.dataset.homeGuard='1';
      const replace=()=>{
        if(img.src===fallback)return;
        img.src=fallback;
        img.classList.add('home-image-fallback');
      };
      img.addEventListener('error',replace,{once:true});
      if(img.complete&&img.naturalWidth===0)replace();
    });
  };

  const prioritizeNextJornada=()=>{
    const root=document.getElementById('homeMatchCenter');
    if(!root)return;
    const next=root.querySelector('.jornada-card[data-state="PROGRAMADO"]');
    if(next&&root.firstElementChild!==next)root.prepend(next);
  };

  const normalizeHome=()=>{
    prioritizeNextJornada();
    repairMedia();
  };

  document.addEventListener('DOMContentLoaded',normalizeHome);
  const observer=new MutationObserver(normalizeHome);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(normalizeHome,500);
  setTimeout(normalizeHome,1600);
})();
