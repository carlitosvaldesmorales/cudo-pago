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
    subtitle:'Campeonato independiente · no suma a los 9 pts del Principal'
  })
});

function resolveChampionshipCode(requestedCode){
  return CHAMPIONSHIP_META[requestedCode]?requestedCode:'PRINCIPAL';
}

function rowsForChampionship(group,championshipCode){
  const championship=group?.championships?.find(item=>item.championship_code===championshipCode);
  if(!championship) return [];
  return (championship.rows||[]).map(row=>({
    position:Number(row.position),
    team_id:String(row.team_id||''),
    team_name:String(row.team_name||''),
    points:Number(row.points||0),
    adjustment_points:Number(row.adjustment_points||0),
    tied:row.tiebreak_status==='PLAYOFF_REQUIRED',
    tiebreak_status:String(row.tiebreak_status||'NONE')
  }));
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

export function buildStandingsPresentation(standings,{championshipCode='PRINCIPAL'}={}){
  const resolvedCode=resolveChampionshipCode(championshipCode);
  const meta=CHAMPIONSHIP_META[resolvedCode];
  const groups=(standings?.groups||[])
    .map(group=>{
      const rows=rowsForChampionship(group,resolvedCode);
      if(!rows.length) return null;
      return {
        group_id:String(group.group_id||''),
        rows,
        has_unresolved_tie:rows.some(row=>row.tied),
        has_adjustments:rows.some(row=>row.adjustment_points!==0)
      };
    })
    .filter(Boolean);

  if(!groups.length) return null;

  return {
    screen_id:'STANDINGS_CHAMPIONSHIP',
    competition_id:String(standings.competition_id||''),
    championship_code:resolvedCode,
    championship_title:meta.title,
    championship_icon:meta.icon,
    championship_short_label:meta.short_label,
    subtitle:meta.subtitle,
    groups,
    status_text:'Sólo resultados verificados modifican esta clasificación.',
    tie_notice:groups.some(group=>group.has_unresolved_tie)
      ? 'Hay posiciones empatadas pendientes de definición según el reglamento.'
      : null,
    adjustment_notice:groups.some(group=>group.has_adjustments)
      ? 'La clasificación incluye ajustes administrativos explícitos.'
      : null,
    navigation:{
      championships:Object.values(CHAMPIONSHIP_META).map(item=>({
        code:item.code,
        label:item.short_label,
        active:item.code===resolvedCode,
        callback_data:`tp:standings:${item.code}`
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
    standings_all_groups_in_championship_screen:true,
    standings_group_navigation:false,
    persistent_context_navigation:true
  }
});
