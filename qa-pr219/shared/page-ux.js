(()=>{
  const qaMode=new URLSearchParams(location.search).get('qa')==='1';
  const seed=window.CUDO_SEED_DATA;

  /* El seed debe parecer producción en composición y copy. Su naturaleza técnica queda solo en ?qa=1. */
  if(seed){
    const sportsPhotos=[
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1400&q=82'
    ];
    const clean=s=>String(s??'').replace(/\s*\(Mock\)/gi,'').replace(/\bmock\b/gi,'').replace(/\bpreview\b/gi,'').replace(/\s{2,}/g,' ').trim();
    (seed.equipos?.items||[]).forEach(item=>{
      const counts={TERCERA:18,SEGUNDA:18,SENIOR:30,PRIMERA:18};
      item.descripcion=`${counts[item.categoria]||''} jugadores conforman esta categoría en la temporada 2026.`.trim();
    });
    const newsCopy=[
      'Las cuatro categorías trabajan para una nueva fecha, con programación desde el mediodía y cierre con Primera.',
      'La semana avanza con trabajo en cancha, coordinación entre categorías y preparación para el próximo desafío.',
      'Familias, jugadores y comunidad vuelven a reunirse alrededor de la cancha para acompañar al club.',
      'La última jornada dejó resultados que mueven las posiciones y mantienen abierta la pelea en cada categoría.',
      'Senior afronta la temporada con un plantel amplio y alternativas para una competencia exigente.',
      'El amistoso permitió ajustar funcionamiento, probar variantes y sumar minutos antes del siguiente compromiso.'
    ];
    (seed.noticias?.items||[]).forEach((item,i)=>{
      item.imagen_ref=sportsPhotos[i%sportsPhotos.length];
      item.resumen=newsCopy[i%newsCopy.length];
      item.cuerpo=item.resumen;
    });
    const galleryCopy={
      PARTIDOS:'Una jornada de fútbol y encuentro alrededor de la cancha.',
      ENTRENAMIENTO:'Trabajo en cancha como parte de la preparación semanal.',
      COMUNIDAD:'La comunidad acompaña y da vida al club dentro y fuera de la cancha.'
    };
    (seed.galeria?.items||[]).forEach((item,i)=>{
      item.imagen_ref=sportsPhotos[(i+2)%sportsPhotos.length];
      item.descripcion=galleryCopy[item.categoria]||'Un momento de la vida deportiva del club.';
      item.alt=clean(item.titulo)||'Actividad deportiva C.U.D.O.';
    });
    (seed.partidos?.items||[]).forEach(item=>{
      item.local=clean(item.local);item.visita=clean(item.visita);item.recinto=clean(item.recinto);item.competencia=clean(item.competencia);
    });
    (seed.tabla?.items||[]).forEach(item=>{item.equipo=clean(item.equipo);item.competencia=clean(item.competencia)});
  }

  const scrubLab=()=>{
    if(qaMode)return;
    document.getElementById('seedGlobalNotice')?.remove();
    document.getElementById('seedPhotoStyle')?.remove();
    document.querySelectorAll('.seed-note,.qa').forEach(n=>{n.hidden=true;n.style.display='none'});
  };
  scrubLab();
  new MutationObserver(scrubLab).observe(document.documentElement,{childList:true,subtree:true});

  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};

  window.cudoLoadPublicData=async function(path,type){
    const url=await window.cudoResolveDataUrl(path,type);
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response.json();
  };

  const opponent=m=>m.local==='CUDO'?m.visita:m.local;
  const groupCudoMatches=items=>{
    const rows=(items||[]).filter(m=>m.local==='CUDO'||m.visita==='CUDO');
    const groups=new Map();
    rows.forEach(m=>{
      const key=[m.fecha||'',opponent(m)||'',m.estado_partido||''].join('|');
      if(!groups.has(key))groups.set(key,{fecha:m.fecha||'',rival:opponent(m)||'Rival',estado:m.estado_partido||'',cancha:m.recinto||m.cancha||m.lugar||'',items:[]});
      groups.get(key).items.push(m);
    });
    const order={TERCERA:1,SEGUNDA:2,SENIOR:3,PRIMERA:4};
    groups.forEach(g=>g.items.sort((a,b)=>(order[String(a.categoria).toUpperCase()]||9)-(order[String(b.categoria).toUpperCase()]||9)));
    return [...groups.values()].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  };

  const jornadaCard=(group,label)=>{
    const card=el('article','jornada-card');
    card.dataset.qaSection='jornada';card.dataset.state=String(group.estado||'').toUpperCase();
    card.append(el('div','jornada-eyebrow',label));
    const title=el('div','jornada-title');
    title.append(el('strong','',`CUDO vs ${group.rival}`),el('span','',[group.fecha,group.cancha].filter(Boolean).join(' · ')));
    card.append(title);
    const list=el('div','jornada-list');
    group.items.forEach(m=>{
      const row=el('div','jornada-row');
      row.append(el('span','cat',m.categoria||'CATEGORÍA'));
      const finalizado=String(m.estado_partido).toUpperCase()==='FINALIZADO';
      row.append(el('span','',finalizado?'Finalizado':(m.hora||'Horario por confirmar')),
        finalizado?el('span','result',`${m.goles_local ?? '-'} - ${m.goles_visita ?? '-'}`):el('span','time',m.hora||'POR CONFIRMAR'));
      list.append(row);
    });
    card.append(list);return card;
  };

  window.cudoRenderHomeJornadas=function(targetId,data){
    const root=document.getElementById(targetId);if(!root)return;
    const groups=groupCudoMatches(data?.items||[]);
    const next=groups.filter(g=>g.estado==='PROGRAMADO').sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))[0];
    const last=groups.filter(g=>g.estado==='FINALIZADO').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))[0];
    root.replaceChildren();if(last)root.append(jornadaCard(last,'ÚLTIMA JORNADA'));if(next)root.append(jornadaCard(next,'PRÓXIMA JORNADA'));if(!root.children.length)root.append(el('div','empty','Sin jornadas publicadas'));
  };

  window.cudoRenderFeaturedJornada=function(targetId,data){
    const root=document.getElementById(targetId);if(!root)return;
    const groups=groupCudoMatches(data?.items||[]);
    const next=groups.filter(g=>g.estado==='PROGRAMADO')[0];const last=groups.filter(g=>g.estado==='FINALIZADO').at(-1);
    root.replaceChildren();if(next)root.append(jornadaCard(next,'PRÓXIMA FECHA'));else if(last)root.append(jornadaCard(last,'ÚLTIMA FECHA'));else root.append(el('div','empty','Sin jornada disponible'));
  };

  window.cudoRenderFixtureJornadas=function(targetId,data){
    const root=document.getElementById(targetId);if(!root)return;
    const groups=groupCudoMatches(data?.items||[]).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
    root.replaceChildren();groups.forEach(g=>root.append(jornadaCard(g,g.estado==='PROGRAMADO'?'PRÓXIMA FECHA':'FECHA JUGADA')));
    if(!groups.length)root.append(el('div','empty','No hay fechas publicadas'));
  };

  window.cudoBindJornadaFilters=function(filterId,gridId){
    const filters=document.getElementById(filterId),grid=document.getElementById(gridId);if(!filters||!grid)return;
    [...filters.querySelectorAll('[data-filter]')].forEach(button=>button.addEventListener('click',()=>{
      const value=button.dataset.filter||'TODOS';
      [...filters.querySelectorAll('[data-filter]')].forEach(b=>b.classList.toggle('active',b===button));
      grid.querySelectorAll('.jornada-card').forEach(card=>{card.hidden=value!=='TODOS'&&card.dataset.state!==value});
    }));
  };

  window.cudoBindStandingsCategory=function(filtersId,standingsId){
    const filters=document.getElementById(filtersId),root=document.getElementById(standingsId);if(!filters||!root)return;
    const blocks=[...root.querySelectorAll('.standingsblock')];if(!blocks.length)return;
    const categories=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];filters.replaceChildren();
    const apply=cat=>{blocks.forEach(block=>{block.hidden=!block.textContent.toUpperCase().includes(cat)});[...filters.querySelectorAll('button')].forEach(b=>b.classList.toggle('active',b.dataset.cat===cat))};
    categories.forEach(cat=>{const b=el('button','',cat);b.type='button';b.dataset.cat=cat;b.addEventListener('click',()=>apply(cat));filters.append(b)});apply('TERCERA');
  };

  window.cudoDecorateTeamCards=function(teamGridId,playerGridId){
    const teams=document.getElementById(teamGridId),players=document.getElementById(playerGridId);if(!teams||!players)return;
    const playerCards=[...players.querySelectorAll('.player')];
    [...teams.querySelectorAll('.team')].forEach(team=>{const cat=team.querySelector('.meta')?.textContent.trim().toUpperCase();const player=playerCards.find(p=>p.dataset.category===cat);const img=player?.querySelector('.playermedia img');const badge=team.querySelector('.team-badge');if(badge&&img)badge.style.backgroundImage=`linear-gradient(0deg,rgba(3,22,61,.25),rgba(3,22,61,.04)),url('${img.src}')`});
  };

  window.cudoEnhanceAlbums=function(albumsId,gridId){
    const albums=document.getElementById(albumsId),grid=document.getElementById(gridId);if(!albums||!grid)return;
    [...albums.querySelectorAll('.albumcard')].forEach(button=>{const photo=[...grid.querySelectorAll('.photo')].find(card=>card.dataset.albumId===button.dataset.album);const img=photo?.querySelector('img');if(img)button.style.backgroundImage=`url('${img.src}')`});
  };

  window.cudoHidePublicLabText=scrubLab;
})();
