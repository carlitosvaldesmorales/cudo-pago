const PUBLIC_COMPETITION='ANFA-CHEPICA-2026';

export const STANDINGS_RULES=Object.freeze({
  GENERAL:Object.freeze({
    label:'General',
    series:Object.freeze(['TERCERA','SEGUNDA','PRIMERA'])
  }),
  SENIOR:Object.freeze({
    label:'Senior',
    series:Object.freeze(['SENIOR'])
  })
});

export const SERIES_POINTS=Object.freeze({
  TERCERA:Object.freeze({win:2,draw:1,loss:0}),
  SEGUNDA:Object.freeze({win:3,draw:1,loss:0}),
  SENIOR:Object.freeze({win:3,draw:1,loss:0}),
  PRIMERA:Object.freeze({win:4,draw:2,loss:0})
});

const ALLOWED_ORIGINS=new Set([
  'https://cudo.cl',
  'https://www.cudo.cl',
  'https://carlitosvaldesmorales.github.io'
]);

function json(body,status=200,extraHeaders={}){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'public, max-age=30, stale-while-revalidate=60',
      ...extraHeaders
    }
  });
}

function corsFor(request){
  const origin=request.headers.get('Origin');
  if(!origin) return {};
  if(!ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}

function tableForSeries(seriesCode){
  if(seriesCode==='SENIOR') return 'SENIOR';
  if(STANDINGS_RULES.GENERAL.series.includes(seriesCode)) return 'GENERAL';
  return null;
}

function pointsFor(seriesCode,homeScore,awayScore,side){
  const rule=SERIES_POINTS[seriesCode];
  if(!rule) return 0;
  const own=side==='HOME'?Number(homeScore):Number(awayScore);
  const other=side==='HOME'?Number(awayScore):Number(homeScore);
  if(own>other) return rule.win;
  if(own===other) return rule.draw;
  return rule.loss;
}

function makeRow(team,tableCode){
  return {
    team_id:team.team_id,
    team_name:team.canonical_name,
    group_id:team.group_id,
    table_code:tableCode,
    base_points:0,
    adjustment_points:0,
    points:0,
    goals_for:0,
    goals_against:0,
    verified_series:0,
    played_fixtures:0,
    head_to_head_points:null,
    position:null,
    tied:false,
    tiebreak_status:'NONE',
    _fixture_ids:new Set()
  };
}

function addVerifiedResult(row,result,side){
  const home=Number(result.home_score);
  const away=Number(result.away_score);
  row.base_points+=pointsFor(result.series_code,home,away,side);
  row.goals_for+=side==='HOME'?home:away;
  row.goals_against+=side==='HOME'?away:home;
  row.verified_series+=1;
  row._fixture_ids.add(result.match_id);
}

function h2hPoints(teamId,tiedIds,tableCode,results){
  let points=0;
  for(const result of results){
    if(tableForSeries(result.series_code)!==tableCode) continue;
    if(result.home_id===teamId&&tiedIds.has(result.away_id)){
      points+=pointsFor(result.series_code,result.home_score,result.away_score,'HOME');
    }else if(result.away_id===teamId&&tiedIds.has(result.home_id)){
      points+=pointsFor(result.series_code,result.home_score,result.away_score,'AWAY');
    }
  }
  return points;
}

function rankRows(rows,tableCode,results){
  const totals=new Map();
  for(const row of rows){
    if(!totals.has(row.points)) totals.set(row.points,[]);
    totals.get(row.points).push(row);
  }

  const orderedTotals=[...totals.keys()].sort((a,b)=>b-a);
  const ranked=[];
  let nextPosition=1;

  for(const total of orderedTotals){
    const sameTotal=totals.get(total);
    if(sameTotal.length===1){
      const row=sameTotal[0];
      row.position=nextPosition;
      row.tied=false;
      row.tiebreak_status='NONE';
      ranked.push(row);
      nextPosition+=1;
      continue;
    }

    const tiedIds=new Set(sameTotal.map(row=>row.team_id));
    for(const row of sameTotal){
      row.head_to_head_points=h2hPoints(row.team_id,tiedIds,tableCode,results);
    }

    sameTotal.sort((a,b)=>{
      const h=(b.head_to_head_points||0)-(a.head_to_head_points||0);
      if(h!==0) return h;
      return String(a.team_name).localeCompare(String(b.team_name),'es');
    });

    const byH2H=new Map();
    for(const row of sameTotal){
      const key=Number(row.head_to_head_points||0);
      if(!byH2H.has(key)) byH2H.set(key,[]);
      byH2H.get(key).push(row);
    }

    const h2hTotals=[...byH2H.keys()].sort((a,b)=>b-a);
    let offset=0;
    for(const h2h of h2hTotals){
      const subgroup=byH2H.get(h2h);
      const unresolved=subgroup.length>1;
      const position=nextPosition+offset;
      for(const row of subgroup){
        row.position=position;
        row.tied=unresolved;
        row.tiebreak_status=unresolved?'PLAYOFF_REQUIRED':'HEAD_TO_HEAD';
        ranked.push(row);
      }
      offset+=subgroup.length;
    }
    nextPosition+=sameTotal.length;
  }

  return ranked.map(row=>({
    position:row.position,
    team_id:row.team_id,
    team_name:row.team_name,
    group_id:row.group_id,
    table_code:row.table_code,
    points:row.points,
    base_points:row.base_points,
    adjustment_points:row.adjustment_points,
    played_fixtures:row._fixture_ids.size,
    verified_series:row.verified_series,
    goals_for:row.goals_for,
    goals_against:row.goals_against,
    goal_difference:row.goals_for-row.goals_against,
    head_to_head_points:row.head_to_head_points,
    tied:row.tied,
    tiebreak_status:row.tiebreak_status
  }));
}

export function calculatePublicStandings({teams=[],results=[],adjustments=[]}={}){
  const groups=new Map();
  const teamIndex=new Map();

  for(const team of teams){
    if(!team?.team_id||!team?.group_id) continue;
    teamIndex.set(team.team_id,team);
    if(!groups.has(team.group_id)){
      groups.set(team.group_id,{
        GENERAL:new Map(),
        SENIOR:new Map()
      });
    }
    groups.get(team.group_id).GENERAL.set(team.team_id,makeRow(team,'GENERAL'));
    groups.get(team.group_id).SENIOR.set(team.team_id,makeRow(team,'SENIOR'));
  }

  const verified=results.filter(result=>result?.validation_status==='VERIFIED');
  for(const result of verified){
    const tableCode=tableForSeries(result.series_code);
    if(!tableCode||!groups.has(result.group_id)) continue;
    const table=groups.get(result.group_id)[tableCode];
    const home=table.get(result.home_id);
    const away=table.get(result.away_id);
    if(home) addVerifiedResult(home,result,'HOME');
    if(away) addVerifiedResult(away,result,'AWAY');
  }

  for(const adjustment of adjustments){
    if(!adjustment||Number(adjustment.active)===0) continue;
    if(!['GENERAL','SENIOR'].includes(adjustment.table_code)) continue;
    const team=teamIndex.get(adjustment.team_id);
    if(!team) continue;
    const groupId=adjustment.group_id||team.group_id;
    const row=groups.get(groupId)?.[adjustment.table_code]?.get(adjustment.team_id);
    if(!row) continue;
    row.adjustment_points+=Number(adjustment.points_delta||0);
  }

  const output=[];
  for(const groupId of [...groups.keys()].sort((a,b)=>String(a).localeCompare(String(b),'es'))){
    const container=groups.get(groupId);
    for(const tableCode of ['GENERAL','SENIOR']){
      for(const row of container[tableCode].values()){
        row.points=row.base_points+row.adjustment_points;
        row.played_fixtures=row._fixture_ids.size;
      }
    }
    output.push({
      group_id:groupId,
      tables:[
        {
          table_code:'GENERAL',
          label:STANDINGS_RULES.GENERAL.label,
          included_series:[...STANDINGS_RULES.GENERAL.series],
          rows:rankRows([...container.GENERAL.values()],'GENERAL',verified)
        },
        {
          table_code:'SENIOR',
          label:STANDINGS_RULES.SENIOR.label,
          included_series:[...STANDINGS_RULES.SENIOR.series],
          rows:rankRows([...container.SENIOR.values()],'SENIOR',verified)
        }
      ]
    });
  }

  return {
    ok:true,
    contract:'public-standings-v1',
    competition_id:PUBLIC_COMPETITION,
    rules:{
      table_general:['TERCERA','SEGUNDA','PRIMERA'],
      table_senior:['SENIOR'],
      points_by_series:SERIES_POINTS,
      tiebreak_order:['TOTAL_POINTS','HEAD_TO_HEAD_POINTS','PLAYOFF_MATCH'],
      goal_difference_is_tiebreaker:false,
      only_verified_results:true
    },
    groups:output
  };
}

export async function buildPublicStandings(env){
  if(!env?.DB) throw new Error('persistence_not_configured');

  const [teamsResult,resultsResult,adjustmentsResult]=await Promise.all([
    env.DB.prepare(`
      SELECT team_id,canonical_name,group_id
      FROM teams
      WHERE active=1 AND group_id IS NOT NULL
      ORDER BY group_id,canonical_name
    `).all(),
    env.DB.prepare(`
      SELECT r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status,
             m.group_id,m.home_id,m.home_name,m.away_id,m.away_name
      FROM match_series_results r
      JOIN matches m ON m.match_id=r.match_id
      WHERE m.competition_id=? AND r.validation_status='VERIFIED'
      ORDER BY m.group_id,m.round_no,r.match_id,r.series_code
    `).bind(PUBLIC_COMPETITION).all(),
    env.DB.prepare(`
      SELECT adjustment_id,competition_id,group_id,table_code,team_id,points_delta,
             reason,source_label,effective_on,active
      FROM standings_adjustments
      WHERE competition_id=? AND active=1
      ORDER BY effective_on,created_at,adjustment_id
    `).bind(PUBLIC_COMPETITION).all()
  ]);

  return calculatePublicStandings({
    teams:teamsResult.results||[],
    results:resultsResult.results||[],
    adjustments:adjustmentsResult.results||[]
  });
}

export async function handlePublicStandingsRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/v1/public-standings') return null;

  const cors=corsFor(request);
  if(request.method==='OPTIONS'){
    return cors
      ? new Response(null,{status:204,headers:cors})
      : new Response(null,{status:403});
  }
  if(request.method!=='GET'){
    return json({ok:false,error:'method_not_allowed'},405,cors||{});
  }
  if(!env?.DB){
    return json({ok:false,error:'persistence_not_configured'},503,cors||{});
  }

  try{
    const standings=await buildPublicStandings(env);
    return json(standings,200,cors||{});
  }catch(error){
    return json({ok:false,error:'standings_build_failed'},500,cors||{});
  }
}
