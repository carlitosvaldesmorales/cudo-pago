const clone=v=>JSON.parse(JSON.stringify(v));

const EVENT_TO_PUBLIC_STATE={
  SCHEDULED:'PROGRAMADO',
  LIVE:'PROGRAMADO',
  COMPLETED:'FINALIZADO',
  CANCELLED:'CANCELADO'
};

function validScore(v){
  return Number.isInteger(v)&&v>=0;
}
function asDateTimeParts(value){
  const raw=String(value||'');
  if(!raw) return {fecha:'',hora:''};
  return {fecha:raw.slice(0,10),hora:raw.length>=16?raw.slice(11,16):''};
}
function projectEvent(event){
  if(event?.kind!=='MATCH'||!event?.sports) return null;
  const sports=event.sports;
  const {fecha,hora}=asDateTimeParts(event.starts_at);
  if(!fecha||!sports.local||!sports.visita) return null;
  const estado=EVENT_TO_PUBLIC_STATE[event.state];
  if(!estado) return null;
  const item={
    id:String(sports.public_match_id||event.event_id).toLowerCase(),
    fecha,
    hora:sports.hora||hora||'',
    local:String(sports.local),
    visita:String(sports.visita),
    recinto:String(sports.recinto||'Cancha de la Orilla (Mock)'),
    categoria:String(sports.categoria||'PRIMERA').toUpperCase(),
    competencia:String(sports.competencia||'Campeonato Club OS (Mock)'),
    estado_partido:estado
  };
  if(estado==='FINALIZADO'){
    if(!validScore(sports.goles_local)||!validScore(sports.goles_visita)){
      throw new Error(`completed MATCH requires valid score: ${event.event_id}`);
    }
    item.goles_local=sports.goles_local;
    item.goles_visita=sports.goles_visita;
  }
  return item;
}

function standingsKey(comp,cat,team){return `${comp}|${cat}|${team}`;}
function deriveStandings(matches,seedTable,runtime){
  const eligibleOrder=[];
  const eligiblePairs=new Set();
  const rememberPair=pair=>{if(!eligiblePairs.has(pair)){eligiblePairs.add(pair);eligibleOrder.push(pair);}};
  for(const x of seedTable||[]) rememberPair(`${x.competencia}|${x.categoria}`);
  for(const event of runtime?.state?.events||[]){
    if(event.kind!=='MATCH'||!event.sports?.counts_for_standings) continue;
    rememberPair(`${event.sports.competencia||'Campeonato Club OS (Mock)'}|${String(event.sports.categoria||'PRIMERA').toUpperCase()}`);
  }

  const stats=new Map();
  const init=(comp,cat,team)=>{
    const key=standingsKey(comp,cat,team);
    if(!stats.has(key)) stats.set(key,{pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0});
  };

  for(const m of matches){
    const comp=String(m.competencia||'');
    const cat=String(m.categoria||'').toUpperCase();
    if(!eligiblePairs.has(`${comp}|${cat}`)) continue;
    init(comp,cat,m.local);init(comp,cat,m.visita);
    if(m.estado_partido!=='FINALIZADO') continue;
    if(!validScore(m.goles_local)||!validScore(m.goles_visita)) continue;
    const hs=stats.get(standingsKey(comp,cat,m.local));
    const vs=stats.get(standingsKey(comp,cat,m.visita));
    hs.pj++;vs.pj++;hs.gf+=m.goles_local;hs.gc+=m.goles_visita;vs.gf+=m.goles_visita;vs.gc+=m.goles_local;
    if(m.goles_local>m.goles_visita){hs.pg++;hs.pts+=3;vs.pp++;}
    else if(m.goles_visita>m.goles_local){vs.pg++;vs.pts+=3;hs.pp++;}
    else{hs.pe++;vs.pe++;hs.pts++;vs.pts++;}
  }

  const groups=new Map();
  for(const [key,s] of stats){
    const [competencia,categoria,equipo]=key.split('|');
    const pair=`${competencia}|${categoria}`;
    if(!groups.has(pair)) groups.set(pair,[]);
    groups.get(pair).push({equipo,...s,dg:s.gf-s.gc});
  }

  const table=[];
  for(const pair of eligibleOrder){
    const rows=groups.get(pair)||[];
    if(!rows.length) continue;
    const split=pair.lastIndexOf('|');
    const competencia=pair.slice(0,split),categoria=pair.slice(split+1);
    rows.sort((a,b)=>b.pts-a.pts||b.dg-a.dg||b.gf-a.gf||a.equipo.localeCompare(b.equipo,'es'));
    rows.forEach((r,i)=>table.push({
      id:`mock-runtime-tabla-${slug(competencia)}-${slug(categoria)}-${String(i+1).padStart(2,'0')}`,
      competencia,categoria,posicion:i+1,equipo:r.equipo,
      pj:r.pj,pg:r.pg,pe:r.pe,pp:r.pp,gf:r.gf,gc:r.gc,dg:r.dg,pts:r.pts
    }));
  }
  return table;
}
function slug(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

export function deriveMockSportsProjection(runtime,{seedMatches=[],seedTable=[]}={}){
  if(!runtime||runtime.schema_version!=='CUDO_MOCK_ADMIN_RUNTIME_V1') throw new Error('valid mock runtime required');
  const runtimeMatches=(runtime.state?.events||[]).map(projectEvent).filter(Boolean);
  const merged=new Map((seedMatches||[]).map(x=>[String(x.id),clone(x)]));
  for(const item of runtimeMatches) merged.set(String(item.id),item);
  const matches=[...merged.values()].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))||String(a.hora||'').localeCompare(String(b.hora||''))||String(a.id).localeCompare(String(b.id)));
  const table=deriveStandings(matches,seedTable,runtime);
  return {
    partidos:{schema_version:'1.0',generated_at:runtime.updated_at,source:'CUDO_WEB_PARTIDOS',items:matches},
    tabla:{schema_version:'1.0',generated_at:runtime.updated_at,source:'CUDO_WEB_TABLA',items:table},
    runtime_match_ids:runtimeMatches.map(x=>x.id),
    production_write:false
  };
}

export function installMockSportsProjection({storage=globalThis.localStorage,seedData=globalThis.window?.CUDO_SEED_DATA}={}){
  if(!seedData) return {installed:false,reason:'seed_data_unavailable'};
  let runtime=null;
  try{runtime=JSON.parse(storage?.getItem('CUDO_FULL_MOCK_ADMIN_RUNTIME_V1')||'null')}catch{}
  if(!runtime||runtime.schema_version!=='CUDO_MOCK_ADMIN_RUNTIME_V1') return {installed:false,reason:'runtime_unavailable'};
  const out=deriveMockSportsProjection(runtime,{
    seedMatches:seedData.partidos?.items||[],
    seedTable:seedData.tabla?.items||[]
  });
  seedData.partidos=out.partidos;
  seedData.tabla=out.tabla;
  if(globalThis.document){
    document.body.dataset.clubSportsRuntime='1';
  }
  return {installed:true,runtime_match_ids:out.runtime_match_ids,partidos:out.partidos.items.length,tabla:out.tabla.items.length};
}
