(()=>{
  /* Seed visual limpio: no watermarks y estética deportiva neutral. Solo afecta fallback demo. */
  const seed=window.CUDO_SEED_DATA;
  if(seed){
    const photos=[
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=82',
      'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1400&q=82'
    ];
    (seed.noticias?.items||[]).forEach((item,i)=>{item.imagen_ref=photos[i%photos.length]});
    (seed.galeria?.items||[]).forEach((item,i)=>{item.imagen_ref=photos[(i+2)%photos.length]});
  }

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
      if(!groups.has(key))groups.set(key,{fecha:m.fecha||'',rival:opponent(m)||'Rival',estado:m.estado_partido||'',cancha:m.cancha||m.lugar||'',items:[]});
      groups.get(key).items.push(m);
    });
    const order={TERCERA:1,SEGUNDA:2,SENIOR:3,PRIMERA:4};
    groups.forEach(g=>g.items.sort((a,b)=>(order[String(a.categoria).toUpperCase()]||9)-(order[String(b.categoria).toUpperCase()]||9)));
    return [...groups.values()];
  };

  const jornadaCard=(group,label)=>{
    const card=el('article','jornada-card');
    card.dataset.qaSection='jornada';
    card.append(el('div','jornada-eyebrow',label));
    const title=el('div','jornada-title');
    title.append(el('strong','',`CUDO vs ${group.rival}`),el('span','',[group.fecha,group.cancha].filter(Boolean).join(' · ')));
    card.append(title);
    const list=el('div','jornada-list');
    group.items.forEach(m=>{
      const row=el('div','jornada-row');
      row.append(el('span','cat',m.categoria||'CATEGORÍA'));
      const center=el('span','',m.estado_partido==='FINALIZADO'?'Finalizado':(m.hora||'Horario por confirmar'));
      const value=m.estado_partido==='FINALIZADO'?el('span','result',`${m.goles_local ?? '-'} - ${m.goles_visita ?? '-'}`):el('span','time',m.hora||'POR CONFIRMAR');
      row.append(center,value);list.append(row);
    });
    card.append(list);return card;
  };

  window.cudoRenderHomeJornadas=function(targetId,data){
    const root=document.getElementById(targetId);if(!root)return;
    const groups=groupCudoMatches(data?.items||[]);
    const next=groups.filter(g=>g.estado==='PROGRAMADO').sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))[0];
    const last=groups.filter(g=>g.estado==='FINALIZADO').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))[0];
    root.replaceChildren();
    if(last)root.append(jornadaCard(last,'ÚLTIMA JORNADA'));
    if(next)root.append(jornadaCard(next,'PRÓXIMA JORNADA'));
    if(!root.children.length)root.append(el('div','empty','Sin jornadas publicadas'));
  };

  window.cudoRenderFeaturedJornada=function(targetId,data){
    const root=document.getElementById(targetId);if(!root)return;
    const groups=groupCudoMatches(data?.items||[]);
    const next=groups.filter(g=>g.estado==='PROGRAMADO').sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))[0];
    const last=groups.filter(g=>g.estado==='FINALIZADO').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)))[0];
    root.replaceChildren();
    if(next)root.append(jornadaCard(next,'PRÓXIMA FECHA'));
    else if(last)root.append(jornadaCard(last,'ÚLTIMA FECHA'));
    else root.append(el('div','empty','Sin jornada disponible'));
  };

  window.cudoBindStandingsCategory=function(filtersId,standingsId){
    const filters=document.getElementById(filtersId),root=document.getElementById(standingsId);if(!filters||!root)return;
    const blocks=[...root.querySelectorAll('.standingsblock')];if(!blocks.length)return;
    const categories=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
    filters.replaceChildren();
    const apply=cat=>{
      blocks.forEach(block=>{block.hidden=cat!=='TODAS'&&!block.textContent.toUpperCase().includes(cat)});
      [...filters.querySelectorAll('button')].forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
    };
    categories.forEach((cat,i)=>{const b=el('button','',cat);b.type='button';b.dataset.cat=cat;b.addEventListener('click',()=>apply(cat));filters.append(b);if(i===0)b.classList.add('active')});
    apply('TERCERA');
  };

  window.cudoDecorateTeamCards=function(teamGridId,playerGridId){
    const teams=document.getElementById(teamGridId),players=document.getElementById(playerGridId);if(!teams||!players)return;
    const playerCards=[...players.querySelectorAll('.player')];
    [...teams.querySelectorAll('.team')].forEach(team=>{
      const cat=team.querySelector('.meta')?.textContent.trim().toUpperCase();
      const player=playerCards.find(p=>p.dataset.category===cat);
      const img=player?.querySelector('.playermedia img');
      const badge=team.querySelector('.team-badge');
      if(badge&&img)badge.style.backgroundImage=`linear-gradient(0deg,rgba(3,22,61,.25),rgba(3,22,61,.04)),url('${img.src}')`;
    });
  };

  window.cudoEnhanceAlbums=function(albumsId,gridId){
    const albums=document.getElementById(albumsId),grid=document.getElementById(gridId);if(!albums||!grid)return;
    [...albums.querySelectorAll('.albumcard')].forEach(button=>{
      const id=button.dataset.album;
      const photo=[...grid.querySelectorAll('.photo')].find(card=>card.dataset.albumId===id);
      const img=photo?.querySelector('img');if(img)button.style.backgroundImage=`url('${img.src}')`;
    });
  };

  window.cudoHidePublicLabText=function(){
    if(document.documentElement.classList.contains('qa-mode'))return;
    document.querySelectorAll('.seed-note,.qa').forEach(n=>n.hidden=true);
  };
})();
