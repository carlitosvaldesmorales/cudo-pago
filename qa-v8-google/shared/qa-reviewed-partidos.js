(()=>{
  if(!document.body?.classList.contains('view-partidos')) return;
  if(!location.pathname.includes('/qa/partidos/')) return;

  const DATA='../data/partidos.json';
  const esc=value=>String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
  const score=item=>item.estado_partido==='FINALIZADO'&&Number.isFinite(Number(item.goles_local))&&Number.isFinite(Number(item.goles_visita))
    ? `${Number(item.goles_local)}<em>–</em>${Number(item.goles_visita)}`
    : '—';

  function card(item){
    const marker=String(item.recinto||'');
    return `<article class="champ-match-card has-results qa-reviewed-match" data-reviewed-partido-id="${esc(item.id)}" data-reviewed-recinto="${esc(marker)}">
      <div class="champ-match-head">
        <div class="champ-team"><span class="champ-crest champ-crest-fallback" aria-hidden="true">⚽</span><span class="champ-team-name">${esc(item.local)}</span></div>
        <div class="champ-vs">${score(item)}</div>
        <div class="champ-team away"><span class="champ-team-name">${esc(item.visita)}</span><span class="champ-crest champ-crest-fallback" aria-hidden="true">⚽</span></div>
      </div>
      <div class="champ-series"><div class="champ-series-row"><span>${esc(item.categoria||'Partido')}</span><strong>${esc(item.fecha||'')} · ${esc(item.hora||'')}</strong></div></div>
      <div class="champ-verified">✓ Resultado revisado en QA · ${esc(item.competencia||'')}</div>
    </article>`;
  }

  async function render(){
    const standings=document.getElementById('champStandings');
    if(!standings||document.getElementById('qaReviewedPartidos')) return;
    const section=document.createElement('section');
    section.className='champ-section';
    section.id='qaReviewedPartidos';
    section.setAttribute('data-qa-reviewed-partidos','true');
    section.innerHTML='<div class="champ-toolbar"><div class="champ-toolbar-left"><span class="champ-calendar">🧪</span><div><h2>RESULTADOS REVISADOS EN QA</h2><p>Flujo humano → revisión → publicación aislada · datos sintéticos · no producción</p></div></div></div><div class="champ-list" id="qaReviewedPartidosList"><div class="champ-status">Cargando resultados revisados…</div></div>';
    standings.parentNode.insertBefore(section,standings);
    const root=section.querySelector('#qaReviewedPartidosList');
    try{
      const response=await fetch(DATA,{cache:'no-store'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      const items=Array.isArray(payload?.items)?payload.items:[];
      root.innerHTML=items.length?items.map(card).join(''):'<div class="champ-status">Aún no hay resultados revisados en QA.</div>';
    }catch(error){
      console.error('qa_reviewed_partidos',error);
      root.innerHTML='<div class="champ-status">No se pudieron cargar los resultados revisados en QA.</div>';
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',render);
  else render();
})();
