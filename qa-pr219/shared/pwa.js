(()=>{
  if(window.CUDO_PWA&&window.CUDO_PWA.version==='2.0-qa-pr219-v2') return;

  const current=document.currentScript;
  const rootUrl=current?new URL('../',current.src):new URL('/qa-pr219/',location.origin);
  const state={
    version:'2.0-qa-pr219-v2',
    supported:'serviceWorker' in navigator,
    scope:'/qa-pr219/',
    registration:null,
    error:null,
    installPrompt:null,
    installed:false,
    standalone:false,
    root:rootUrl.href
  };
  window.CUDO_PWA=state;

  const isStandalone=()=>
    window.matchMedia?.('(display-mode: standalone)').matches===true ||
    navigator.standalone===true ||
    document.referrer.startsWith('android-app://');

  const isMobile=()=>window.matchMedia?.('(max-width: 900px)').matches===true || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const href=relative=>new URL(relative,rootUrl).href;

  state.standalone=isStandalone();
  state.installed=state.standalone;

  const ensureHeadContract=()=>{
    if(!document.querySelector('link[rel="manifest"]')){
      const link=document.createElement('link');
      link.rel='manifest';
      link.href=href('manifest.webmanifest');
      document.head.appendChild(link);
    }
    if(!document.querySelector('link[rel="apple-touch-icon"]')){
      const link=document.createElement('link');
      link.rel='apple-touch-icon';
      link.href=href('icons/apple-touch-icon.png');
      document.head.appendChild(link);
    }
    if(!document.querySelector('meta[name="theme-color"]')){
      const meta=document.createElement('meta');
      meta.name='theme-color';
      meta.content='#03163d';
      document.head.appendChild(meta);
    }
  };

  const ensureStyle=()=>{
    if(document.getElementById('cudoPwaShellStyle')) return;
    const style=document.createElement('style');
    style.id='cudoPwaShellStyle';
    style.textContent=`
      .cudo-app-install{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;gap:12px;background:#03163d;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:12px 14px;box-shadow:0 16px 44px rgba(3,22,61,.34);font-family:Arial,sans-serif}
      .cudo-app-install[hidden]{display:none!important}.cudo-app-install-copy{min-width:0;flex:1}.cudo-app-install-copy strong{display:block;font-size:14px;line-height:1.15}.cudo-app-install-copy span{display:block;margin-top:3px;color:#d8deeb;font-size:11px;line-height:1.3}.cudo-app-install button{appearance:none;border:0;border-radius:12px;background:#e21b2d;color:#fff;font-weight:900;font-size:11px;padding:11px 13px;white-space:nowrap}
      .cudo-app-dock{position:fixed;left:10px;right:10px;bottom:max(8px,env(safe-area-inset-bottom));z-index:2147483000;display:grid;grid-template-columns:repeat(4,1fr);background:rgba(3,22,61,.97);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:7px;box-shadow:0 16px 44px rgba(3,22,61,.4);font-family:Arial,sans-serif}.cudo-app-dock a{display:flex;min-width:0;min-height:48px;align-items:center;justify-content:center;flex-direction:column;gap:3px;color:#fff;text-decoration:none;border-radius:14px;font-size:10px;font-weight:800;line-height:1.1}.cudo-app-dock a:active,.cudo-app-dock a[aria-current="page"]{background:rgba(255,255,255,.12)}.cudo-app-dock .ico{font-size:18px;line-height:1}.cudo-app-mode{padding-bottom:84px!important}
      @media(min-width:901px){.cudo-app-install,.cudo-app-dock{display:none!important}.cudo-app-mode{padding-bottom:0!important}}
    `;
    document.head.appendChild(style);
  };

  const currentKey=()=>{
    const path=location.pathname;
    if(path.includes('/admin/')) return 'admin';
    if(path.includes('/partidos/')) return 'partidos';
    if(path.includes('/noticias/')) return 'noticias';
    return 'inicio';
  };

  const renderShell=()=>{
    if(!document.body) return;
    ensureStyle();
    document.querySelectorAll('[data-cudo-pwa-shell]').forEach(node=>node.remove());
    document.body.classList.toggle('cudo-app-mode',state.standalone&&isMobile());

    if(state.standalone&&isMobile()){
      const dock=document.createElement('nav');
      dock.className='cudo-app-dock';
      dock.dataset.cudoPwaShell='dock';
      dock.setAttribute('aria-label','Navegación de la aplicación C.U.D.O.');
      const key=currentKey();
      const items=[
        ['inicio','⌂','Inicio',href('')],
        ['partidos','⚽','Partidos',href('partidos/')],
        ['noticias','📰','Noticias',href('noticias/')],
        ['admin','⚙','Administrar',href('admin/')]
      ];
      dock.innerHTML=items.map(([id,icon,label,url])=>`<a href="${url}"${key===id?' aria-current="page"':''}><span class="ico" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('');
      document.body.appendChild(dock);
      return;
    }

    if(!isMobile()) return;
    const card=document.createElement('div');
    card.className='cudo-app-install';
    card.dataset.cudoPwaShell='install';
    card.innerHTML='<div class="cudo-app-install-copy"><strong>App C.U.D.O.</strong><span>Instálala en tu celular para abrirla como aplicación.</span></div><button type="button">INSTALAR</button>';
    const button=card.querySelector('button');
    button.addEventListener('click',async()=>{
      if(state.installPrompt){
        const prompt=state.installPrompt;
        state.installPrompt=null;
        await prompt.prompt();
        const choice=await prompt.userChoice.catch(()=>null);
        state.installOutcome=choice?.outcome||'unknown';
        if(choice?.outcome==='accepted'){
          card.querySelector('span').textContent='Instalación aceptada. C.U.D.O. quedará en tu pantalla de inicio.';
          button.textContent='LISTO';
          button.disabled=true;
        }else{
          card.querySelector('span').textContent='Puedes instalarla cuando quieras desde el menú del navegador.';
        }
        return;
      }
      card.querySelector('span').textContent=isIos()
        ? 'En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.'
        : 'En Chrome: abre ⋮, elige “Agregar a pantalla principal” y luego “Instalar”.';
      button.textContent='ENTENDIDO';
    });
    document.body.appendChild(card);
  };

  state.renderShell=renderShell;
  state.install=async()=>{
    if(!state.installPrompt) return {available:false};
    const prompt=state.installPrompt;
    state.installPrompt=null;
    await prompt.prompt();
    const choice=await prompt.userChoice.catch(()=>null);
    state.installOutcome=choice?.outcome||'unknown';
    renderShell();
    return {available:true,outcome:state.installOutcome};
  };

  ensureHeadContract();

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    state.installPrompt=event;
    renderShell();
  });
  window.addEventListener('appinstalled',()=>{
    state.installed=true;
    state.installPrompt=null;
    renderShell();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',event=>{
    state.standalone=event.matches;
    state.installed=state.installed||event.matches;
    renderShell();
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',renderShell,{once:true});
  else renderShell();

  if(!state.supported){
    state.ready=Promise.resolve(null);
    return;
  }

  state.ready=navigator.serviceWorker
    .register('/qa-pr219/sw.js',{scope:state.scope})
    .then(registration=>{
      state.registration=registration;
      return navigator.serviceWorker.ready;
    })
    .catch(error=>{
      state.error=String(error&&error.message||error);
      console.warn('CUDO PWA: service worker no disponible',error);
      return null;
    });
})();
