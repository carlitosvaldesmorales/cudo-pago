import assert from 'node:assert/strict';
import { buildVmixRows } from '../../sports-bus/worker/vmix-feed-entry.js';

const snapshot={
  ok:true,
  competition_id:'ANFA-CHEPICA-2026',
  round_no:3,
  mode:'reported',
  generated_at:'2026-09-13T00:00:00.000Z',
  matches:[{
    match_id:'A-F3-M3',group_id:'A',round_no:3,round_label:'Fecha III',
    home_id:'PENAROL_LA_MINA',home_name:'Peñarol La Mina',
    away_id:'CUDO',away_name:'Unión Orilla',
    series:[
      {series_code:'TERCERA',series_label:'3ª',home_score:2,away_score:1,status:'PENDIENTE',canonical:false,source_label:'Chépica Play',updated_at:'2026-09-13T14:01:00.000Z'},
      {series_code:'SEGUNDA',series_label:'2ª',home_score:1,away_score:1,status:'VERIFIED',canonical:true,source_label:'Resultado oficial',updated_at:'2026-09-13T14:02:00.000Z'},
      {series_code:'SENIOR',series_label:'Senior',home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null},
      {series_code:'PRIMERA',series_label:'1ª',home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null}
    ]
  }]
};

const rows=buildVmixRows(snapshot);
assert.equal(rows.length,4,'one vMix row per canonical series');
assert.deepEqual(rows.map(r=>r.row_key),[
  'A-F3-M3:TERCERA','A-F3-M3:SEGUNDA','A-F3-M3:SENIOR','A-F3-M3:PRIMERA'
]);

const tercera=rows[0];
assert.equal(tercera.round_no,'3');
assert.equal(tercera.round_label,'Fecha III');
assert.equal(tercera.home_crest_url,'https://cudo.cl/preview-v8/media/clubes/penarol-la-mina.png');
assert.equal(tercera.away_crest_url,'https://cudo.cl/preview-v8/media/clubes/union-orilla.png');
assert.equal(tercera.home_score,'2');
assert.equal(tercera.away_score,'1');
assert.equal(tercera.status_label,'INFORMADO');
assert.equal(tercera.canonical,'0');

const segunda=rows[1];
assert.equal(segunda.status_label,'OFICIAL');
assert.equal(segunda.canonical,'1');

const senior=rows[2];
assert.equal(senior.home_score,'');
assert.equal(senior.away_score,'');
assert.equal(senior.has_result,'0');
assert.equal(senior.status_label,'SIN RESULTADO');

for(const row of rows){
  for(const key of ['row_key','round_no','round_label','match_id','series_code','series_label','home_name','home_crest_url','home_score','away_score','away_name','away_crest_url','status_label']){
    assert.ok(Object.hasOwn(row,key),`missing vMix field ${key}`);
  }
}

console.log('VMIX_BROADCAST_ADAPTER_CONTRACT_OK');
