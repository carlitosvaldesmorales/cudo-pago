import { buildRoundSnapshots } from './results-stream-entry.js';

const CREST_BASE='https://cudo.cl/preview-v8/media/clubes/';

// Canonical ids come from the ANFA Chépica fixture seed. Legacy aliases remain
// accepted only at this presentation boundary so old callers do not lose crests.
const CREST_BY_CLUB=Object.freeze({
  'JUV-CHEPICA':'juventud-chepica.png',
  'SANTA-ELENA':'santa-elena-la-ruda.png',
  'INDEPENDIENTE':'independiente.png',
  'UNION-ORILLA':'union-orilla.png',
  'SAN-JUAN':'san-juan.png',
  'PENAROL-LA-MINA':'penarol-la-mina.png',
  'HURACAN':'huracan.png',
  'SAN-AGUSTIN':'san-agustin.png',
  'SAN-RAMON':'san-ramon.png',
  'LAS-PALMERAS':'las-palmeras.png',
  'LAS-CRUCES':'las-cruces.png',

  // Compatibility aliases used by older CUDO/web integrations.
  'CUDO':'union-orilla.png',
  'JUVENTUD_CHEPICA':'juventud-chepica.png',
  'SANTA_ELENA':'santa-elena-la-ruda.png',
  'SAN_JUAN':'san-juan.png',
  'PENAROL_LA_MINA':'penarol-la-mina.png',
  'SAN_AGUSTIN':'san-agustin.png',
  'SAN_RAMON':'san-ramon.png',
  'LAS_PALMERAS':'las-palmeras.png',
  'LAS_CRUCES':'las-cruces.png'
});

const SERIES_ORDER=Object.freeze({TERCERA:1,SEGUNDA:2,SENIOR:3,PRIMERA:4});

function crestUrl(clubId){
  const file=CREST_BY_CLUB[String(clubId||'').toUpperCase()];
  return file?`${CREST_BASE}${file}`:'';
}

function statusLabel(series){
  if(series?.status==='PENDIENTE') return 'INFORMADO';
  if(series?.status==='VERIFIED') return 'OFICIAL';
  if(series?.status==='DISPUTED') return 'EN DISPUTA';
  if(series?.status==='ANNULLED') return 'ANULADO';
  return 'SIN RESULTADO';
}

export function buildVmixRows(snapshot){
  const rows=[];
  for(const match of snapshot?.matches||[]){
    for(const series of match.series||[]){
      const hasResult=series.home_score!==null&&series.away_score!==null;
      rows.push({
        row_key:`${match.match_id}:${series.series_code}`,
        competition_id:String(snapshot.competition_id||''),
        round_no:String(snapshot.round_no||''),
        round_label:String(match.round_label||`Fecha ${snapshot.round_no||''}`),
        group_id:String(match.group_id||''),
        match_id:String(match.match_id||''),
        series_order:String(SERIES_ORDER[series.series_code]||99),
        series_code:String(series.series_code||''),
        series_label:String(series.series_label||series.series_code||''),
        home_id:String(match.home_id||''),
        home_name:String(match.home_name||''),
        home_crest_url:crestUrl(match.home_id),
        home_score:hasResult?String(Number(series.home_score)):'',
        away_score:hasResult?String(Number(series.away_score)):'',
        away_id:String(match.away_id||''),
        away_name:String(match.away_name||''),
        away_crest_url:crestUrl(match.away_id),
        has_result:hasResult?'1':'0',
        status_code:String(series.status||'SIN_RESULTADO'),
        status_label:statusLabel(series),
        canonical:series.canonical?'1':'0',
        source_label:String(series.source_label||''),
        updated_at:String(series.updated_at||''),
        generated_at:String(snapshot.generated_at||'')
      });
    }
  }
  return rows;
}

function response(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,OPTIONS',
      'access-control-allow-headers':'Content-Type'
    }
  });
}

export async function handleVmixFeedRequest(request,env){
  const url=new URL(request.url);
  const friendly=url.pathname.match(/^\/vmix\/fecha\/(\d+)\.json$/);
  const canonical=url.pathname.match(/^\/api\/v1\/broadcast\/vmix\/rounds\/(\d+)$/);
  const match=friendly||canonical;
  if(!match) return null;

  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'Content-Type',
    'access-control-max-age':'86400'
  }});
  if(request.method!=='GET') return response({ok:false,error:'method_not_allowed'},405);
  if(!env.DB) return response({ok:false,error:'persistence_not_configured'},503);

  const roundNo=Number(match[1]);
  if(!Number.isInteger(roundNo)||roundNo<1||roundNo>99) return response({ok:false,error:'invalid_round'},400);
  const mode=url.searchParams.get('mode')==='official'?'official':'reported';
  const snapshots=await buildRoundSnapshots(env,roundNo);
  return response(buildVmixRows(snapshots[mode]));
}
