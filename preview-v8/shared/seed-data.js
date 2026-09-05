(()=>{
  const current=document.currentScript;
  const base=current?new URL('.',current.src).href:'./';
  document.write('<script src="'+base+'data-source.js"><\/script>');
})();
