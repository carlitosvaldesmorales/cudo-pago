(()=>{
  const CATS=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
  const TIMES={TERCERA:'12:00',SEGUNDA:'13:15',SENIOR:'14:30',PRIMERA:'15:45'};
  const GROUPS={
    A:['CUDO','Rival A1 (Mock)','Rival A2 (Mock)','Rival A3 (Mock)','Rival A4 (Mock)','Rival A5 (Mock)'],
    B:['Rival B1 (Mock)','Rival B2 (Mock)','Rival B3 (Mock)','Rival B4 (Mock)','Rival B5 (Mock)']
  };
  const DATES=['2026-08-09','2026-08-16','2026-08-23','2026-08-30','2026-09-06'];

  const roundRobin=input=>{
    const teams=[...input];
    if(teams.length%2)teams.push(null);
    const rounds=[];
    let a=[...teams];
    for(let r=0;r<a.length-1;r++){
      const pairs=[];
      for(let i=0;i<a.length/2;i++){
        let h=a[i],v=a[a.length-1-i];
        if(h&&v){if(r%2){const x=h;h=v;v=x;}pairs.push([h,v]);}
      }
      rounds.push(pairs);
      a=[a[0],a[a.length-1],...a.slice(1,-1)];
    }
    return rounds;
  };

  const score=(g,r,p,c,side)=>(g.charCodeAt(0)+r*7+p*5+c*3+side*2)%5;
  const matches=[];
  const stats=new Map();
  const key=(comp,cat,team)=>`${comp}|${cat}|${team}`;
  const init=(comp,cat,team)=>{if(!stats.has(key(comp,cat,team)))stats.set(key(comp,cat,team),{pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0});};
  const apply=(comp,cat,h,v,gh,gv)=>{
    const hs=stats.get(key(comp,cat,h)),vs=stats.get(key(comp,cat,v));
    hs.pj++;vs.pj++;hs.gf+=gh;hs.gc+=gv;vs.gf+=gv;vs.gc+=gh;
    if(gh>gv){hs.pg++;hs.pts+=3;vs.pp++;}
    else if(gv>gh){vs.pg++;vs.pts+=3;hs.pp++;}
    else{hs.pe++;vs.pe++;hs.pts++;vs.pts++;}
  };

  Object.entries(GROUPS).forEach(([group,teams])=>{
    const comp=`Campeonato Seed 2026 · Grupo ${group}`;
    CATS.forEach(cat=>teams.forEach(team=>init(comp,cat,team)));
    roundRobin(teams).forEach((pairs,ri)=>pairs.forEach(([local,visita],pi)=>CATS.forEach((cat,ci)=>{
      const finalizado=ri<4;
      const item={
        id:`seed-${group.toLowerCase()}-f${String(ri+1).padStart(2,'0')}-p${String(pi+1).padStart(2,'0')}-${cat.toLowerCase()}`,
        fecha:DATES[ri],hora:TIMES[cat],local,visita,
        recinto:local==='CUDO'?'Cancha de la Orilla':`Recinto Grupo ${group} (Mock)`,
        categoria:cat,competencia:comp,estado_partido:finalizado?'FINALIZADO':'PROGRAMADO'
      };
      if(finalizado){item.goles_local=score(group,ri,pi,ci,0);item.goles_visita=score(group,ri,pi,ci,1);apply(comp,cat,local,visita,item.goles_local,item.goles_visita);}
      matches.push(item);
    })));
  });

  [
    ['2026-07-19','Deportivo Amistoso Norte (Mock)',true],
    ['2026-07-26','Unión Amistosa Sur (Mock)',false]
  ].forEach(([fecha,rival,cudoLocal],ri)=>CATS.forEach((cat,ci)=>{
    const local=cudoLocal?'CUDO':rival,visita=cudoLocal?rival:'CUDO';
    matches.push({
      id:`seed-amistoso-${ri+1}-${cat.toLowerCase()}`,fecha,hora:TIMES[cat],local,visita,
      recinto:cudoLocal?'Cancha de la Orilla':'Cancha amistosa (Mock)',categoria:cat,
      competencia:'Amistoso Seed 2026',estado_partido:'FINALIZADO',
      goles_local:(ri+ci+1)%5,goles_visita:(ri+ci+3)%5
    });
  }));

  const table=[];
  Object.entries(GROUPS).forEach(([group,teams])=>{
    const comp=`Campeonato Seed 2026 · Grupo ${group}`;
    CATS.forEach(cat=>{
      const rows=teams.map(team=>{
        const s=stats.get(key(comp,cat,team));
        return {team,...s,dg:s.gf-s.gc};
      }).sort((a,b)=>b.pts-a.pts||b.dg-a.dg||b.gf-a.gf||a.team.localeCompare(b.team,'es'));
      rows.forEach((r,i)=>table.push({
        id:`seed-tabla-${group.toLowerCase()}-${cat.toLowerCase()}-${String(i+1).padStart(2,'0')}`,
        competencia:comp,categoria:cat,posicion:i+1,equipo:r.team,pj:r.pj,pg:r.pg,pe:r.pe,pp:r.pp,gf:r.gf,gc:r.gc,dg:r.dg,pts:r.pts
      }));
    });
  });

  const docs={
    partidos:{schema_version:'1.0',generated_at:'2026-09-04T20:10:00-04:00',source:'CUDO_WEB_PARTIDOS',items:matches},
    tabla:{schema_version:'1.0',generated_at:'2026-09-04T20:10:00-04:00',source:'CUDO_WEB_TABLA',items:table}
  };
  const urls={};
  const blobUrl=type=>urls[type]||(urls[type]=URL.createObjectURL(new Blob([JSON.stringify(docs[type])],{type:'application/json'})));

  window.CUDO_SEED_DATA=docs;
  window.cudoResolveDataUrl=async(realUrl,type)=>{
    try{
      const response=await fetch(realUrl,{cache:'no-store'});
      if(response.ok){const data=await response.json();if(data&&Array.isArray(data.items)&&data.items.length)return realUrl;}
    }catch{}
    const notice=document.getElementById('seedNotice');
    if(notice)notice.hidden=false;
    return docs[type]?blobUrl(type):realUrl;
  };
  window.CUDO_SEED_SUMMARY={clubes:11,grupos:{A:6,B:5},categorias:CATS,partidos:matches.length,filas_tabla:table.length};
})();