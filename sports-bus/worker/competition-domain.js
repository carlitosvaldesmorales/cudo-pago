export const PUBLIC_COMPETITION_ID='ANFA-CHEPICA-2026';

export const CHAMPIONSHIP=Object.freeze({
  PRINCIPAL:Object.freeze({
    code:'PRINCIPAL',
    label:'Campeonato Principal',
    independent:true,
    series:Object.freeze(['TERCERA','SEGUNDA','PRIMERA']),
    max_points_per_matchday:9
  }),
  SENIOR:Object.freeze({
    code:'SENIOR',
    label:'Campeonato Senior',
    independent:true,
    series:Object.freeze(['SENIOR']),
    max_points_per_matchday:3
  })
});

export const SERIES_POINTS=Object.freeze({
  TERCERA:Object.freeze({win:2,draw:1,loss:0,championship_code:'PRINCIPAL'}),
  SEGUNDA:Object.freeze({win:3,draw:1,loss:0,championship_code:'PRINCIPAL'}),
  PRIMERA:Object.freeze({win:4,draw:2,loss:0,championship_code:'PRINCIPAL'}),
  SENIOR:Object.freeze({win:3,draw:1,loss:0,championship_code:'SENIOR'})
});

export function championshipForSeries(seriesCode){
  return SERIES_POINTS[seriesCode]?.championship_code||null;
}

export function pointsForSeries(seriesCode,homeScore,awayScore,side){
  const rule=SERIES_POINTS[seriesCode];
  if(!rule) return 0;
  const own=side==='HOME'?Number(homeScore):Number(awayScore);
  const other=side==='HOME'?Number(awayScore):Number(homeScore);
  if(own>other) return rule.win;
  if(own===other) return rule.draw;
  return rule.loss;
}

export function assertCompetitionDomain(){
  const principalMax=CHAMPIONSHIP.PRINCIPAL.series.reduce((sum,series)=>sum+SERIES_POINTS[series].win,0);
  if(principalMax!==9) throw new Error('principal_matchday_must_equal_9_points');
  if(CHAMPIONSHIP.PRINCIPAL.series.includes('SENIOR')) throw new Error('senior_must_not_belong_to_principal_championship');
  if(CHAMPIONSHIP.SENIOR.series.length!==1||CHAMPIONSHIP.SENIOR.series[0]!=='SENIOR') throw new Error('senior_championship_boundary_invalid');
  return true;
}
