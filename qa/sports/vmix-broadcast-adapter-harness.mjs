import assert from 'node:assert/strict';
import { buildVmixRows } from '../../sports-bus/worker/vmix-feed-entry.js';

const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const blankSeries=()=>SERIES.map(series_code=>({series_code,series_label:series_code,home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null}));

const snapshot={
  ok:true,
  competition_id:'ANFA-CHEPICA-2026',
  round_no:3,
  mode:'reported',
  generated_at:'2026-09-13T00:00:00.000Z',
  matches:[{
    match_id:'A-F3-M3',group_id:'A',round_no:3,round_label:'Fecha III',
    home_id:'PENAROL-LA-MINA',home_name:'Peñarol La Mina',
    away_id:'UNION-ORILLA',away_name:'Unión Orilla',
    series:[
      {series_code:'TERCERA',series_label:'3ª',home_score:2,away_score:1,status:'PENDIENTE',canonical:false,source_label:'Chépica Play',updated_at:'2026-09-13T14:01:00.000Z'},
      {series_code:'SEGUNDA',series_label:'2ª',home_score:1,away_score:1,status:'VERIFIED',canonical:true,source_label:'Resultado oficial',updated_at:'2026-09-13T14:02:00.000Z'},
      {series_code:'SENIOR',series_label:'Senior',home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null},
      {series_code:'PRIMERA',series_label:'1ª',home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null}
    ]
  },{
    match_id:'A-F3-M1',group_id:'A',round_no:3,round_label:'Fecha III',
    home_id:'SANTA-ELENA',home_name:'Santa Elena La Ruda',away_id:'JUV-CHEPICA',away_name:'Juventud de Chépica',series:blankSeries()
  },{
    match_id:'A-F3-M2',group_id:'A',round_no:3,round_label:'Fecha III',
    home_id:'INDEPENDIENTE',home_name:'Independiente',away_id:'SAN-JUAN',away_name:'San Juan',series:blankSeries()
  },{
    match_id:'B-F3-M1',group_id:'B',round_no:3,round_label:'Fecha III',
    home_id:'SAN-AGUSTIN',home_name:'San Agustín',away_id:'HURACAN',away_name:'Huracán',series:blankSeries()
  },{
    match_id:'B-F3-M2',group_id:'B',round_no:3,round_label:'Fecha III',
    home_id:'SAN-RAMON',home_name:'San Ramón',away_id:'LAS-PALMERAS',away_name:'Las Palmeras',series:blankSeries()
  }]
};

const rows=buildVmixRows(snapshot);
assert.equal(rows.length,20,'Fecha III must expose five matches x four canonical series');
assert.equal(new Set(rows.map(r=>r.match_id)).size,5,'Fecha III must expose five matches');

const tercera=rows.find(r=>r.row_key==='A-F3-M3:TERCERA');
assert.ok(tercera);
assert.equal(tercera.round_no,'3');
assert.equal(tercera.round_label,'Fecha III');
assert.equal(tercera.home_crest_url,'https://cudo.cl/preview-v8/media/clubes/penarol-la-mina.png');
assert.equal(tercera.away_crest_url,'https://cudo.cl/preview-v8/media/clubes/union-orilla.png');
assert.equal(tercera.home_score,'2');
assert.equal(tercera.away_score,'1');
assert.equal(tercera.status_label,'INFORMADO');
assert.equal(tercera.canonical,'0');

const segunda=rows.find(r=>r.row_key==='A-F3-M3:SEGUNDA');
assert.equal(segunda.status_label,'OFICIAL');
assert.equal(segunda.canonical,'1');

const expectedCrests=new Map([
  ['SANTA-ELENA','santa-elena-la-ruda.png'],['JUV-CHEPICA','juventud-chepica.png'],
  ['INDEPENDIENTE','independiente.png'],['SAN-JUAN','san-juan.png'],
  ['PENAROL-LA-MINA','penarol-la-mina.png'],['UNION-ORILLA','union-orilla.png'],
  ['SAN-AGUSTIN','san-agustin.png'],['HURACAN','huracan.png'],
  ['SAN-RAMON','san-ramon.png'],['LAS-PALMERAS','las-palmeras.png']
]);
for(const row of rows){
  assert.equal(row.home_crest_url,`https://cudo.cl/preview-v8/media/clubes/${expectedCrests.get(row.home_id)}`);
  assert.equal(row.away_crest_url,`https://cudo.cl/preview-v8/media/clubes/${expectedCrests.get(row.away_id)}`);
  for(const key of ['row_key','round_no','round_label','match_id','series_code','series_label','home_name','home_crest_url','home_score','away_score','away_name','away_crest_url','status_label']){
    assert.ok(Object.hasOwn(row,key),`missing vMix field ${key}`);
  }
}

const legacy=buildVmixRows({competition_id:'ANFA-CHEPICA-2026',round_no:3,generated_at:'',matches:[{
  match_id:'LEGACY',group_id:'A',round_label:'Fecha III',home_id:'CUDO',home_name:'Unión Orilla',away_id:'SAN_JUAN',away_name:'San Juan',series:blankSeries()
}]});
assert.equal(legacy[0].home_crest_url,'https://cudo.cl/preview-v8/media/clubes/union-orilla.png');
assert.equal(legacy[0].away_crest_url,'https://cudo.cl/preview-v8/media/clubes/san-juan.png');

console.log('VMIX_BROADCAST_ADAPTER_CONTRACT_OK');
