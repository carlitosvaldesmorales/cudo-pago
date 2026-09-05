(()=>{
  const current=document.currentScript;
  const base=current?new URL('.',current.src).href:'./';
  document.write('<script src="'+base+'presentation-guard.js"><\/script>');
  document.write('<script src="'+base+'data-mode-guard.js"><\/script>');
  document.write('<script src="'+base+'site-runtime-v8.js"><\/script>');
})();
