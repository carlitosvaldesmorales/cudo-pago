import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const db=new D1SqliteAdapter();
try{
  const migrations=path.join(root,'sports-bus','migrations');
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));

  const qa=await db.prepare(`SELECT m.competition_id,m.home_name,m.away_name,r.home_score,r.away_score,r.validation_status
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.match_id='QA-RG-MUTATION-01' AND r.series_code='TERCERA'`).first();
  assert.ok(qa,'QA fixture missing');
  assert.equal(qa.competition_id,'CUDO-QA-RESULT-GOVERNANCE');
  assert.equal(qa.home_name,'QA Local');
  assert.equal(qa.away_name,'QA Visita');
  assert.equal(qa.validation_status,'VERIFIED');

  const publicCount=await db.prepare(`SELECT COUNT(*) AS n FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.validation_status='VERIFIED' AND m.match_id='QA-RG-MUTATION-01'`).first();
  assert.equal(Number(publicCount.n),0,'QA fixture leaked into ANFA public scope');

  console.log('PASS live QA fixture exists outside ANFA competition');
  console.log('PASS QA fixture cannot satisfy ANFA public results scope');
  console.log('RESULT: PASS');
}finally{
  db.close();
}
