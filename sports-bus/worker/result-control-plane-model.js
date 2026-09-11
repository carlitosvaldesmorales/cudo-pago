export const GROUP_PHASE_COMPETITION = 'ANFA-CHEPICA-2026';
export const EXPECTED_SERIES = Object.freeze(['TERCERA','SEGUNDA','SENIOR','PRIMERA']);
export const SERIES_LABEL = Object.freeze({TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'});

export const SLOT_STATE = Object.freeze({
  MISSING:'MISSING',
  OFFICIAL:'OFFICIAL',
  DISPUTED:'DISPUTED',
  ANNULLED:'ANNULLED'
});

function stateFromResult(row){
  if(!row) return SLOT_STATE.MISSING;
  if(row.validation_status==='VERIFIED') return SLOT_STATE.OFFICIAL;
  if(row.validation_status==='DISPUTED') return SLOT_STATE.DISPUTED;
  if(row.validation_status==='ANNULLED') return SLOT_STATE.ANNULLED;
  return SLOT_STATE.MISSING;
}

function inScope(reporter,match){
  if(reporter?.role==='SUPER_ADMIN') return true;
  return !!reporter?.club_id&&(reporter.club_id===match.home_id||reporter.club_id===match.away_id);
}

export async function loadResultControlPlane(db,{competitionId=GROUP_PHASE_COMPETITION,reporter=null}={}){
  const [matchesResult,resultsResult,byesResult]=await Promise.all([
    db.prepare(`
      SELECT match_id,competition_id,season_id,group_id,round_no,round_label,kickoff_at,
             home_id,home_name,away_id,away_name
      FROM matches
      WHERE competition_id=?
      ORDER BY round_no,group_id,match_id
    `).bind(competitionId).all(),
    db.prepare(`
      SELECT r.result_id,r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status,
             r.governance_version,r.source_type,r.updated_at
      FROM match_series_results r
      JOIN matches m ON m.match_id=r.match_id
      WHERE m.competition_id=?
    `).bind(competitionId).all(),
    db.prepare(`
      SELECT bye_id,competition_id,season_id,group_id,round_no,team_id
      FROM byes WHERE competition_id=?
      ORDER BY round_no,group_id,team_id
    `).bind(competitionId).all()
  ]);

  const byResultKey=new Map();
  for(const row of resultsResult.results||[]){
    if(EXPECTED_SERIES.includes(row.series_code)) byResultKey.set(`${row.match_id}:${row.series_code}`,row);
  }

  const matches=[];
  for(const row of matchesResult.results||[]){
    if(reporter&&!inScope(reporter,row)) continue;
    const slots=EXPECTED_SERIES.map(seriesCode=>{
      const observed=byResultKey.get(`${row.match_id}:${seriesCode}`)||null;
      const state=stateFromResult(observed);
      return {
        match_id:row.match_id,
        series_code:seriesCode,
        series_label:SERIES_LABEL[seriesCode],
        state,
        expected:true,
        observed:!!observed,
        result_id:observed?.result_id||null,
        home_score:observed?Number(observed.home_score):null,
        away_score:observed?Number(observed.away_score):null,
        validation_status:observed?.validation_status||null,
        governance_version:observed?Number(observed.governance_version||1):null,
        source_type:observed?.source_type||null,
        updated_at:observed?.updated_at||null
      };
    });
    const counts={MISSING:0,OFFICIAL:0,DISPUTED:0,ANNULLED:0};
    for(const slot of slots) counts[slot.state]+=1;
    const state=counts.DISPUTED?'DISPUTED':counts.ANNULLED?'HAS_ANNULLED':counts.MISSING?'INCOMPLETE':'COMPLETE';
    matches.push({
      match_id:row.match_id,
      competition_id:row.competition_id,
      season_id:row.season_id,
      group_id:row.group_id,
      round_no:Number(row.round_no),
      round_label:row.round_label,
      kickoff_at:row.kickoff_at||null,
      home_id:row.home_id,
      home_name:row.home_name,
      away_id:row.away_id,
      away_name:row.away_name,
      state,
      counts,
      expected_slots:EXPECTED_SERIES.length,
      slots
    });
  }

  const summary={matches:matches.length,expected_slots:matches.length*EXPECTED_SERIES.length,MISSING:0,OFFICIAL:0,DISPUTED:0,ANNULLED:0};
  for(const match of matches) for(const slot of match.slots) summary[slot.state]+=1;

  return {
    contract:'result-control-plane-v1',
    competition_id:competitionId,
    phase_contract:'GROUP_PHASE_ALL_FOUR_SERIES',
    expected_series:[...EXPECTED_SERIES],
    matches,
    byes:byesResult.results||[],
    summary
  };
}
