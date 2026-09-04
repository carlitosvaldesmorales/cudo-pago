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

window.cudoBindMatchFilters=function(filterId,gridId){
  const filters=document.getElementById(filterId);
  const grid=document.getElementById(gridId);
  if(!filters||!grid)return;
  const buttons=[...filters.querySelectorAll('[data-filter]')];
  if(!buttons.length)return;

  const apply=value=>{
    let visible=0;
    grid.querySelectorAll('.match').forEach(card=>{
      const show=value==='TODOS'||card.dataset.state===value;
      card.hidden=!show;
      if(show)visible++;
    });
    grid.querySelectorAll('.filter-empty').forEach(node=>node.remove());
    if(!visible&&grid.querySelector('.match')){
      const box=document.createElement('div');
      box.className='empty filter-empty';
      box.style.gridColumn='1/-1';
      const strong=document.createElement('strong');
      const span=document.createElement('span');
      strong.textContent='No hay partidos en esta vista';
      span.textContent='Cuando existan datos deportivos validados aparecerán aquí.';
      box.append(strong,span);
      grid.append(box);
    }
  };

  buttons.forEach(button=>button.addEventListener('click',()=>{
    buttons.forEach(b=>b.classList.toggle('active',b===button));
    apply(button.dataset.filter||'TODOS');
  }));
};

window.cudoBindPlayerFilters=function(filterId,gridId){
  const filters=document.getElementById(filterId);
  const grid=document.getElementById(gridId);
  if(!filters||!grid)return;
  const category=filters.querySelector('#playerCategory');
  const position=filters.querySelector('#playerPosition');
  if(!category||!position)return;

  const cards=[...grid.querySelectorAll('.player')];
  const categories=[...new Set(cards.map(card=>card.dataset.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  categories.forEach(value=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=value;
    category.append(option);
  });

  const apply=()=>{
    let visible=0;
    cards.forEach(card=>{
      const catOK=category.value==='TODAS'||card.dataset.category===category.value;
      const posOK=position.value==='TODAS'||card.dataset.position===position.value;
      const show=catOK&&posOK;
      card.hidden=!show;
      if(show)visible++;
    });
    grid.querySelectorAll('.filter-empty').forEach(node=>node.remove());
    if(cards.length&&!visible){
      const box=document.createElement('div');
      box.className='empty filter-empty';
      box.style.gridColumn='1/-1';
      const strong=document.createElement('strong');
      const span=document.createElement('span');
      strong.textContent='No hay jugadores en este filtro';
      span.textContent='Cambia la categoría o posición para ver otros integrantes del plantel.';
      box.append(strong,span);
      grid.append(box);
    }
  };

  category.addEventListener('change',apply);
  position.addEventListener('change',apply);
};

window.cudoBindGallery=function(filterId,albumsId,gridId,countId){
  const filters=document.getElementById(filterId);
  const albumsRoot=document.getElementById(albumsId);
  const grid=document.getElementById(gridId);
  const count=document.getElementById(countId);
  if(!filters||!albumsRoot||!grid)return;

  const cards=[...grid.querySelectorAll('.photo')];
  if(!cards.length){
    filters.hidden=true;
    albumsRoot.hidden=true;
    return;
  }

  const albumSelect=filters.querySelector('#galleryAlbum');
  const categorySelect=filters.querySelector('#galleryCategory');
  const yearSelect=filters.querySelector('#galleryYear');
  if(!albumSelect||!categorySelect||!yearSelect)return;

  const addOptions=(select,values)=>values.forEach(value=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=value;
    select.append(option);
  });

  const albums=[...new Map(cards.map(card=>[card.dataset.albumId,card.dataset.album])).entries()]
    .filter(([id,name])=>id&&name)
    .sort((a,b)=>a[1].localeCompare(b[1],'es'));
  const categories=[...new Set(cards.map(card=>card.dataset.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const years=[...new Set(cards.map(card=>card.dataset.year).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  albums.forEach(([id,name])=>{
    const option=document.createElement('option');
    option.value=id;
    option.textContent=name;
    albumSelect.append(option);
  });
  addOptions(categorySelect,categories);
  addOptions(yearSelect,years);

  const albumGroups=new Map();
  cards.forEach(card=>{
    const id=card.dataset.albumId;
    if(!id)return;
    if(!albumGroups.has(id))albumGroups.set(id,{name:card.dataset.album,category:card.dataset.category,count:0});
    albumGroups.get(id).count++;
  });
  albumsRoot.replaceChildren();
  [...albumGroups.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'es')).forEach(([id,info])=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='albumcard';
    button.dataset.album=id;
    const strong=document.createElement('strong');
    strong.textContent=info.name;
    const span=document.createElement('span');
    span.textContent=`${info.count} ${info.count===1?'foto':'fotos'}${info.category?' · '+info.category:''}`;
    button.append(strong,span);
    button.addEventListener('click',()=>{
      albumSelect.value=id;
      apply();
      grid.scrollIntoView({behavior:'smooth',block:'start'});
    });
    albumsRoot.append(button);
  });

  const apply=()=>{
    let visible=0;
    cards.forEach(card=>{
      const albumOK=albumSelect.value==='TODOS'||card.dataset.albumId===albumSelect.value;
      const categoryOK=categorySelect.value==='TODAS'||card.dataset.category===categorySelect.value;
      const yearOK=yearSelect.value==='TODOS'||card.dataset.year===yearSelect.value;
      const show=albumOK&&categoryOK&&yearOK;
      card.hidden=!show;
      if(show)visible++;
    });
    albumsRoot.querySelectorAll('.albumcard').forEach(button=>button.classList.toggle('active',albumSelect.value!=='TODOS'&&button.dataset.album===albumSelect.value));
    if(count)count.textContent=`${visible} ${visible===1?'fotografía':'fotografías'}`;
    grid.querySelectorAll('.filter-empty').forEach(node=>node.remove());
    if(!visible){
      const box=document.createElement('div');
      box.className='empty filter-empty';
      box.style.gridColumn='1/-1';
      const strong=document.createElement('strong');
      const span=document.createElement('span');
      strong.textContent='No hay fotografías en este filtro';
      span.textContent='Cambia el álbum, categoría o año para explorar otras publicaciones.';
      box.append(strong,span);
      grid.append(box);
    }
  };

  [albumSelect,categorySelect,yearSelect].forEach(select=>select.addEventListener('change',apply));
  filters.hidden=false;
  albumsRoot.hidden=!albumsRoot.children.length;
  apply();

  const overlay=document.createElement('div');
  overlay.className='lightbox';
  overlay.hidden=true;
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Visor de fotografías C.U.D.O.');
  const shell=document.createElement('div');
  shell.className='lightboxshell';
  const close=document.createElement('button');
  close.type='button';
  close.className='lightboxclose';
  close.setAttribute('aria-label','Cerrar fotografía');
  close.textContent='×';
  const prev=document.createElement('button');
  prev.type='button';
  prev.className='lightboxnav prev';
  prev.setAttribute('aria-label','Fotografía anterior');
  prev.textContent='‹';
  const next=document.createElement('button');
  next.type='button';
  next.className='lightboxnav next';
  next.setAttribute('aria-label','Fotografía siguiente');
  next.textContent='›';
  const image=document.createElement('img');
  image.className='lightboximage';
  const caption=document.createElement('div');
  caption.className='lightboxcaption';
  const captionMeta=document.createElement('div');
  captionMeta.className='meta';
  const captionTitle=document.createElement('strong');
  const captionDescription=document.createElement('p');
  caption.append(captionMeta,captionTitle,captionDescription);
  shell.append(close,prev,image,next,caption);
  overlay.append(shell);
  document.body.append(overlay);

  let activeButton=null;
  const visibleButtons=()=>cards.filter(card=>!card.hidden).map(card=>card.querySelector('.photoopen')).filter(Boolean);
  const showButton=button=>{
    if(!button)return;
    activeButton=button;
    image.src=button.dataset.image;
    image.alt=button.dataset.alt||'Fotografía C.U.D.O.';
    captionMeta.textContent=button.dataset.meta||'';
    captionTitle.textContent=button.dataset.title||'';
    captionDescription.textContent=button.dataset.description||'';
    overlay.hidden=false;
    document.body.classList.add('lightbox-open');
    close.focus();
  };
  const closeOverlay=()=>{
    overlay.hidden=true;
    document.body.classList.remove('lightbox-open');
    const restore=activeButton;
    activeButton=null;
    image.removeAttribute('src');
    if(restore)restore.focus();
  };
  const move=delta=>{
    const buttons=visibleButtons();
    if(!buttons.length)return;
    let index=buttons.indexOf(activeButton);
    if(index<0)index=0;
    index=(index+delta+buttons.length)%buttons.length;
    showButton(buttons[index]);
  };

  cards.forEach(card=>{
    const button=card.querySelector('.photoopen');
    if(button)button.addEventListener('click',()=>showButton(button));
  });
  close.addEventListener('click',closeOverlay);
  prev.addEventListener('click',()=>move(-1));
  next.addEventListener('click',()=>move(1));
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeOverlay()});
  document.addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape')closeOverlay();
    if(event.key==='ArrowLeft')move(-1);
    if(event.key==='ArrowRight')move(1);
  });
};

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
      if(resolved.protocol!=='https:')return null;
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
    equipos:['Categorías aún no publicadas','La estructura está lista y mostrará únicamente categorías validadas.'],
    plantel:['Plantel aún no publicado','No se muestran jugadores, fotografías ni datos hasta contar con información validada y autorizada para publicación.'],
    galeria:['Galería aún sin publicaciones','La estructura está lista y mostrará únicamente fotografías autorizadas para uso público.'],
    partidos:['Partidos aún no publicados','El núcleo deportivo está listo para mostrar próximos encuentros y resultados una vez validados.'],
    tabla:['Tabla aún no publicada','La estructura está lista y mostrará posiciones únicamente cuando existan datos oficiales validados.']
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

    let items=[...data.items].filter(item=>item&&typeof item==='object');
    if(type==='tabla'){
      items.sort((a,b)=>Number(a.posicion)-Number(b.posicion));
      root.replaceChildren();
      const groups=new Map();
      items.forEach(item=>{
        const key=[item.competencia||'',item.categoria||''].join('||');
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(item);
      });
      groups.forEach(rows=>{
        const block=document.createElement('section');
        block.className='standingsblock';
        const first=rows[0]||{};
        const label=[first.competencia,first.categoria].filter(Boolean).join(' · ');
        if(label)block.append(text('div',label,'standingslabel'));
        const scroll=document.createElement('div');
        scroll.className='standingsscroll';
        const table=document.createElement('table');
        table.className='standingstable';
        const thead=document.createElement('thead');
        const hr=document.createElement('tr');
        ['POS','EQUIPO','PJ','PG','PE','PP','GF','GC','DG','PTS'].forEach(label=>hr.append(text('th',label)));
        thead.append(hr);
        const tbody=document.createElement('tbody');
        rows.forEach(item=>{
          const tr=document.createElement('tr');
          [item.posicion,item.equipo,item.pj,item.pg,item.pe,item.pp,item.gf,item.gc,item.dg,item.pts].forEach((value,index)=>{
            const td=text('td',value);
            if(index===1)td.className='teamname';
            if(index===9)td.className='points';
            tr.append(td);
          });
          tbody.append(tr);
        });
        table.append(thead,tbody);
        scroll.append(table);
        block.append(scroll);
        root.append(block);
      });
      if(!root.children.length)empty('Contenido no disponible','La tabla no contiene filas públicas válidas.');
      return;
    }

    if(type==='partidos'){
      const stateRank={PROGRAMADO:0,SUSPENDIDO:1,FINALIZADO:2,CANCELADO:3};
      items.sort((a,b)=>{
        const sa=String(a.estado_partido||'').toUpperCase();
        const sb=String(b.estado_partido||'').toUpperCase();
        const rank=(stateRank[sa]??9)-(stateRank[sb]??9);
        if(rank)return rank;
        const da=String(a.fecha||'');
        const db=String(b.fecha||'');
        return sa==='FINALIZADO'?db.localeCompare(da):da.localeCompare(db);
      });
    }

    if(type==='plantel'){
      const positionRank={ARQUERO:0,DEFENSA:1,VOLANTE:2,DELANTERO:3};
      items.sort((a,b)=>{
        const cat=String(a.categoria||'').localeCompare(String(b.categoria||''),'es');
        if(cat)return cat;
        const pos=(positionRank[String(a.posicion||'').toUpperCase()]??9)-(positionRank[String(b.posicion||'').toUpperCase()]??9);
        return pos||Number(a.numero)-Number(b.numero);
      });
    }

    if(type==='galeria')items.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||String(a.album||'').localeCompare(String(b.album||''),'es'));

    root.replaceChildren();
    items.forEach(item=>{
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

      if(type==='plantel'){
        article=document.createElement('article');
        article.className='player';
        article.dataset.category=String(item.categoria||'');
        article.dataset.position=String(item.posicion||'').toUpperCase();
        const media=document.createElement('div');
        media.className='playermedia';
        const img=safeImage(item.foto_ref,item.nombre_deportivo||'Jugador C.U.D.O.');
        if(img)media.append(img);else media.append(text('div','CUDO','playerplaceholder'));
        media.append(text('span','#'+item.numero,'playernumber'));
        const body=document.createElement('div');
        body.className='playerbody';
        const role=[item.posicion,item.categoria].filter(Boolean).join(' · ');
        body.append(text('div',role,'meta'),text('h2',item.nombre_deportivo));
        if(item.capitan===true)body.append(text('span','CAPITÁN','captainbadge'));
        article.append(media,body);
      }

      if(type==='galeria'){
        const img=safeImage(item.imagen_ref,item.alt);
        if(!img)return;
        article=document.createElement('article');
        article.className='photo';
        article.dataset.albumId=String(item.album_id||'');
        article.dataset.album=String(item.album||'');
        article.dataset.category=String(item.categoria||'');
        article.dataset.year=String(item.fecha||'').slice(0,4);
        const open=document.createElement('button');
        open.type='button';
        open.className='photoopen';
        open.setAttribute('aria-label','Abrir foto: '+String(item.titulo||'C.U.D.O.'));
        open.dataset.image=img.src;
        open.dataset.alt=String(item.alt||'');
        open.dataset.title=String(item.titulo||'');
        open.dataset.meta=[item.fecha,item.album,item.categoria].filter(Boolean).join(' · ');
        open.dataset.description=String(item.descripcion||'');
        open.append(img);
        const body=document.createElement('div');
        body.className='photobody';
        body.append(text('div',[item.fecha,item.album].filter(Boolean).join(' · '),'meta'),text('h2',item.titulo));
        if(item.descripcion)body.append(text('p',item.descripcion));
        article.append(open,body);
      }

      if(type==='partidos'){
        article=document.createElement('article');
        article.className='match';
        article.dataset.state=String(item.estado_partido||'').toUpperCase();
        const top=document.createElement('div');
        top.className='matchtop';
        const when=[item.fecha,item.hora].filter(Boolean).join(' · ');
        top.append(text('div',when,'date'),text('span',item.estado_partido||'PROGRAMADO','pill'));
        const teams=document.createElement('div');
        teams.className='matchteams';
        const home=text('strong',item.local,'side');
        const away=text('strong',item.visita,'side');
        const middle=document.createElement('div');
        const finalizado=article.dataset.state==='FINALIZADO';
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
