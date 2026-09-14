(()=>{
  const state={supported:'serviceWorker' in navigator,scope:'/preview-v8/',registration:null,error:null};
  window.CUDO_PWA=state;
  if(!state.supported) return;

  state.ready=navigator.serviceWorker
    .register('/preview-v8/sw.js',{scope:state.scope})
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
