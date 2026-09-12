const CHAMPIONSHIP_META=Object.freeze({
  PRINCIPAL:Object.freeze({
    code:'PRINCIPAL',
    icon:'⚽',
    title:'CAMPEONATO PRINCIPAL',
    short_label:'Principal',
    subtitle:'3ª + 2ª + 1ª · Máx. 9 pts por jornada'
  }),
  SENIOR:Object.freeze({
    code:'SENIOR',
    icon:'👴',
    title:'CAMPEONATO SENIOR',
    short_label:'Senior',
    subtitle:'Campeonato independiente · 3 pts máx. por jornada'
  })
});

function availableGroupIds(standings){
  return (standings?.groups||[])
    .map(group=>String(group.group_id||''))
    .filter(Boolean);
}

function resolveGroup(standings,requestedGroupId){
  const groups=standings?.groups||[];
  if(!groups.length) return null;
  const requested=String(requestedGroupId||'');
  return groups.find(group=>String(group.group_id)===requested)||groups[0];
}

function resolveChampionship(group,requestedCode){
  const requested=CHAMPIONSHIP_META[requestedCode]?requestedCode:'PRINCIPAL';
  return group?.championships?.find(item=>item.championship_code===requested)
    ||group?.championships?.[0]
    ||null;
}

export function buildPublicHubPresentation(){
  return {
    screen_id:'PUBLIC_HUB',
    title:'FÚTBOL CHÉPICA · PÚBLICO',
    lead:'Información oficial de los campeonatos.',
    actions:[
      {id:'RESULTS',label:'⚽ Resultados',callback_data:'tp:public-results'},
      {id:'STANDINGS',label:'🏆 Tablas de posiciones',callback_data:'tp:public-standings'},
      {id:'REPORT',label:'📝 Informar resultado',callback_data:'tp:public-report'},
      {id:'MY_REPORTS',label:'🔎 Mis aportes',callback_data:'pr:my'},
      {id:'HOME',label:'🏠 Volver',callback_data:'tp:home'}
    ]
  };
}

export function buildStandingsPresentation(standings,{championshipCode='PRINCIPAL',groupId=null}={}){
  const group=resolveGroup(standings,groupId);
  if(!group) return null;

  const championship=resolveChampionship(group,championshipCode);
  if(!championship) return null;

  const meta=CHAMPIONSHIP_META[championship.championship_code]||CHAMPIONSHIP_META.PRINCIPAL;
  const rows=(championship.rows||[]).map(row=>({
    position:Number(row.position),
    team_id:String(row.team_id||''),
    team_name:String(row.team_name||''),
    points:Number(row.points||0),
    adjustment_points:Number(row.adjustment_points||0),
    tied:row.tiebreak_status==='PLAYOFF_REQUIRED',
    tiebreak_status:String(row.tiebreak_status||'NONE')
  }));

  const unresolvedTie=rows.some(row=>row.tied);
  const adjustments=rows.filter(row=>row.adjustment_points!==0);
  const groups=availableGroupIds(standings);

  return {
    screen_id:'STANDINGS_GROUP',
    competition_id:String(standings.competition_id||''),
    championship_code:championship.championship_code,
    championship_title:meta.title,
    championship_icon:meta.icon,
    championship_short_label:meta.short_label,
    group_id:String(group.group_id),
    subtitle:meta.subtitle,
    rows,
    status_text:'Sólo resultados verificados modifican esta clasificación.',
    tie_notice:unresolvedTie
      ? 'Hay posiciones empatadas pendientes de definición según el reglamento.'
      : null,
    adjustment_notice:adjustments.length
      ? 'La tabla incluye ajustes administrativos explícitos.'
      : null,
    navigation:{
      championships:Object.values(CHAMPIONSHIP_META).map(item=>({
        code:item.code,
        label:item.short_label,
        active:item.code===championship.championship_code,
        callback_data:`tp:standings:${item.code}:${String(group.group_id)}`
      })),
      groups:groups.map(id=>({
        id,
        label:`Grupo ${id}`,
        active:id===String(group.group_id),
        callback_data:`tp:standings:${championship.championship_code}:${id}`
      })),
      results:{label:'⚽ Resultados',callback_data:'tp:public-results'},
      public:{label:'🌐 Público',callback_data:'tp:public'}
    }
  };
}

export const PRESENTATION_MODEL_CONTRACT=Object.freeze({
  human_output_pipeline:['CAPABILITY','PROJECTION','PRESENTATION_MODEL','CHANNEL_RENDERER'],
  telegram:{
    one_screen_one_primary_context:true,
    standings_one_championship_per_screen:true,
    standings_one_group_per_screen:true,
    persistent_context_navigation:true
  }
});
