document.addEventListener('DOMContentLoaded',()=>{
  const path=window.location.pathname;
  const atRoot=/\/preview-v7\/?$/.test(path);
  const atPartidos=/\/preview-v7\/partidos\/?$/.test(path);
  const partidosHref=atRoot?'partidos/':(atPartidos?'./':'../partidos/');

  document.querySelectorAll('.navlinks,.mobilepanel').forEach(container=>{
    if(container.querySelector('[data-nav-partidos]'))return;
    const equipo=[...container.querySelectorAll('a')].find(a=>a.textContent.trim()==='EQUIPOS');
    const link=document.createElement('a');
    link.href=partidosHref;
    link.textContent='PARTIDOS';
    link.dataset.navPartidos='true';
    if(atPartidos)link.classList.add('active');
    if(equipo)container.insertBefore(link,equipo);
    else container.append(link);
  });

  const b=document.getElementById('menuBtn');
  const p=document.getElementById('mobilePanel');
  if(!b||!p)return;
  b.setAttribute('aria-controls','mobilePanel');
  const set=open=>{
    p.classList.toggle('open',open);
    b.setAttribute('aria-expanded',String(open));
    b.textContent=open?'×':'☰';
  };
  b.addEventListener('click',()=>set(!p.classList.contains('open')));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false)});
  window.addEventListener('resize',()=>{if(window.innerWidth>900)set(false)});
  p.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>set(false)));
});

window.cudoRenderCollection=async function({url,target,status,type}){
  const root=document.getElementById(target);
  const st=document.getElementById(status);
  if(!root)return;

  const text=(tag,value,className)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    el.textContent=String(value??'');
    return el;
  };

  const safeImage=(ref,alt)=>{
    if(!ref)return null;
    try{
      const resolved=new URL(String(ref),window.location.href);
      if(!['http:','https:'].includes(resolved.protocol))return null;
      const img=document.createElement('img');
      img.src=resolved.href;
      img.alt=String(alt||'C.U.D.O.');
      img.loading='lazy';
      img.decoding='async';
      return img;
    }catch{return null;}
  };

  const empty=(title,msg)=>{
    root.replaceChildren();
    const box=document.createElement('div');
    box.className='empty';
    box.style.gridColumn='1/-1';
    box.append(text('strong',title),text('span',msg));
    root.append(box);
  };

  const labels={
    noticias:['Aún no hay noticias publicadas','El módulo está listo y esperando contenido validado.'],
    equipos:['Planteles aún no publicados','La estructura está lista; no se muestran jugadores ni datos hasta contar con información validada para publicación.'],
    galeria:['Galería aún sin publicaciones','La estructura está lista y mostrará únicamente fotografías autorizadas para uso público.'],
    partidos:['Partidos aún no publicados','El núcleo deportivo está listo para mostrar próximos encuentros, resultados y calendario una vez validados.']
  };

  if(!labels[type]){
    if(st)st.textContent='Tipo de contenido no reconocido';
    empty('Contenido no disponible','El módulo no tiene un contrato público válido.');
    return;
  }

  try{
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!data||typeof data!=='object'||!Array.isArray(data.items))throw new Error('Contrato JSON inválido');

    if(st)st.textContent='Fuente pública: '+String(data.source||'C.U.D.O.');
    if(!data.items.length){empty(...labels[type]);return;}

    root.replaceChildren();
    data.items.forEach(item=>{
      if(!item||typeof item!=='object')return;
      let article;

      if(type==='noticias'){
        article=document.createElement('article');
        article.className='news';
        const img=safeImage(item.imagen_ref,item.titulo||'Noticia C.U.D.O.');
        if(img)article.append(img);
        const body=document.createElement('div');
        body.className='newsbody';
        body.append(text('div',item.fecha,'date'),text('h2',item.titulo),text('p',item.resumen));
        article.append(body);
      }

      if(type==='equipos'){
        article=document.createElement('article');
        article.className='team';
        const badge=text('div','CUDO','team-badge');
        const body=document.createElement('div');
        body.className='teambody';
        body.append(text('div',item.categoria,'meta'),text('h2',item.nombre),text('p',item.descripcion));
        article.append(badge,body);
      }

      if(type==='galeria'){
        article=document.createElement('article');
        article.className='photo';
        const img=safeImage(item.imagen_ref,item.titulo||'Galería C.U.D.O.');
        if(img)article.append(img);
        const body=document.createElement('div');
        body.className='photobody';
        body.append(text('div',item.fecha,'meta'),text('h2',item.titulo),text('p',item.descripcion));
        article.append(body);
      }

      if(type==='partidos'){
        article=document.createElement('article');
        article.className='match';
        const top=document.createElement('div');
        top.className='matchtop';
        const when=[item.fecha,item.hora].filter(Boolean).join(' · ');
        top.append(text('div',when,'date'),text('span',item.estado_partido||'PROGRAMADO','pill'));
        const teams=document.createElement('div');
        teams.className='matchteams';
        const home=text('strong',item.local,'side');
        const away=text('strong',item.visita,'side');
        const middle=document.createElement('div');
        const finalizado=String(item.estado_partido||'').toUpperCase()==='FINALIZADO';
        middle.className=finalizado?'score':'versus';
        middle.textContent=finalizado?`${item.goles_local} - ${item.goles_visita}`:'VS';
        teams.append(home,middle,away);
        const meta=[item.competencia,item.categoria,item.recinto].filter(Boolean).join(' · ');
        article.append(top,teams,text('div',meta,'matchmeta'));
      }

      if(article)root.append(article);
    });

    if(!root.children.length)empty('Contenido no disponible','La fuente pública no contiene elementos válidos para mostrar.');
  }catch(error){
    if(st)st.textContent='Fuente temporalmente no disponible';
    empty('Contenido no disponible','No se mostrará información hasta recuperar una fuente pública válida.');
  }
};
