import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from '../telegram/d1-sqlite-adapter.mjs';
import { handlePlatformTenancyRequest } from '../../sports-bus/worker/platform-tenancy-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();
const env={DB:db};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}

async function get(url,origin=null){
  const headers={};
  if(origin) headers.Origin=origin;
  const response=await handlePlatformTenancyRequest(new Request(url,{headers}),env);
  assert.ok(response,`route must be handled: ${url}`);
  return {response,body:await response.json()};
}

try{
  applyMigrations();

  const platformRow=await db.prepare("SELECT platform_id,canonical_name,slug FROM platforms WHERE platform_id='FUTBOL-CHEPICA'").first();
  assert.equal(platformRow?.canonical_name,'Fútbol Chépica');
  assert.equal(platformRow?.slug,'futbol-chepica');

  const competition=await db.prepare("SELECT platform_id FROM competitions WHERE competition_id='ANFA-CHEPICA-2026'").first();
  assert.equal(competition?.platform_id,'FUTBOL-CHEPICA','ANFA Chépica 2026 must belong to the platform root');

  const tenantRows=(await db.prepare("SELECT tenant_id,club_id,slug FROM tenants WHERE platform_id='FUTBOL-CHEPICA' ORDER BY tenant_id").all()).results;
  assert.equal(tenantRows.length,11,'all 11 current championship clubs must have one logical tenant');
  assert.equal(new Set(tenantRows.map(x=>x.club_id)).size,11,'one sporting club cannot be duplicated across tenants');
  const cudoRow=tenantRows.find(x=>x.tenant_id==='CUDO');
  assert.ok(cudoRow,'CUDO must exist as tenant identity');
  assert.equal(cudoRow.club_id,'UNION-ORILLA','CUDO tenant must map to canonical sporting club UNION-ORILLA');
  assert.equal(cudoRow.slug,'cudo');
  assert.ok(!tenantRows.some(x=>x.tenant_id==='UNION-ORILLA'),'UNION-ORILLA must not become a second tenant beside CUDO');

  const cudoBinding=await db.prepare("SELECT verification_status,active FROM web_host_bindings WHERE hostname='cudo.cl'").first();
  assert.equal(cudoBinding?.verification_status,'DECLARED');
  assert.equal(Number(cudoBinding?.active),0,'declared domain must not be treated as DNS-verified');

  const platformBinding=await db.prepare("SELECT scope,tenant_id,verification_status,active FROM web_host_bindings WHERE hostname='futbolchepica.cl'").first();
  assert.equal(platformBinding?.scope,'PLATFORM');
  assert.equal(platformBinding?.tenant_id,null);
  assert.equal(platformBinding?.verification_status,'DECLARED');
  assert.equal(Number(platformBinding?.active),0,'registered platform domain must remain inactive before DNS verification');

  const platform=await get('https://qa.invalid/api/v1/platform','https://cudo.cl');
  assert.equal(platform.response.status,200);
  assert.equal(platform.response.headers.get('access-control-allow-origin'),'https://cudo.cl');
  assert.equal(platform.body.contract,'platform-tenancy-v1');
  assert.equal(platform.body.platform.platform_id,'FUTBOL-CHEPICA');
  assert.equal(platform.body.platform.name,'Fútbol Chépica');
  assert.equal(platform.body.summary.clubs,11);
  assert.equal(platform.body.summary.competitions,1);
  assert.equal(platform.body.competitions[0].competition_id,'ANFA-CHEPICA-2026');
  assert.ok(platform.body.clubs.some(x=>x.tenant_id==='CUDO'&&x.club_id==='UNION-ORILLA'));
  assert.deepEqual(platform.body.platform.domain_bindings,[
    {hostname:'futbolchepica.cl',verification_status:'DECLARED',active:false},
    {hostname:'www.futbolchepica.cl',verification_status:'DECLARED',active:false}
  ]);

  const clubs=await get('https://qa.invalid/api/v1/clubs');
  assert.equal(clubs.body.contract,'platform-clubs-v1');
  assert.equal(clubs.body.clubs.length,11);

  const cudo=await get('https://qa.invalid/api/v1/tenant/CUDO');
  assert.equal(cudo.body.contract,'tenant-profile-v1');
  assert.equal(cudo.body.tenant.tenant_id,'CUDO');
  assert.equal(cudo.body.tenant.club_id,'UNION-ORILLA');
  assert.equal(cudo.body.tenant.display_name,'C.U.D.O.');
  assert.equal(cudo.body.tenant.sporting_name,'Unión Orilla');
  assert.equal(cudo.body.tenant.route_path,'/clubes/cudo');
  assert.deepEqual(cudo.body.tenant.hostnames,[],'unverified custom domain must not be exposed as active hostname');
  assert.deepEqual(cudo.body.domain_bindings,[
    {hostname:'cudo.cl',verification_status:'DECLARED',active:false},
    {hostname:'www.cudo.cl',verification_status:'DECLARED',active:false}
  ]);

  const cudoBySlug=await get('https://qa.invalid/api/v1/tenant/cudo');
  assert.equal(cudoBySlug.body.tenant.tenant_id,'CUDO','tenant lookup must support stable public slug');

  const duplicateSportingTenant=await get('https://qa.invalid/api/v1/tenant/UNION-ORILLA');
  assert.equal(duplicateSportingTenant.response.status,404,'sporting club id must not create an implicit second tenant identity');

  const cudoMatches=await get('https://qa.invalid/api/v1/tenant/CUDO/matches');
  assert.equal(cudoMatches.body.contract,'tenant-matches-v1');
  assert.equal(cudoMatches.body.tenant.club_id,'UNION-ORILLA');
  assert.equal(cudoMatches.body.matches.length,5,'CUDO tenant must receive only the five Unión Orilla group-stage matches');
  assert.equal(cudoMatches.body.byes.length,0);
  assert.ok(cudoMatches.body.matches.every(m=>m.home_id==='UNION-ORILLA'||m.away_id==='UNION-ORILLA'),'tenant projection must never include an unrelated match');
  assert.ok(cudoMatches.body.matches.every(m=>Array.isArray(m.series)&&m.series.length===4),'tenant match projection must preserve four governed series');
  for(const match of cudoMatches.body.matches){
    for(const serie of match.series){
      if(serie.public_status!=='OFFICIAL'){
        assert.equal(serie.home_score,null,'non-official tenant series must not expose a score');
        assert.equal(serie.away_score,null,'non-official tenant series must not expose a score');
      }
    }
  }

  const santa=await get('https://qa.invalid/api/v1/tenant/SANTA-ELENA/matches');
  assert.equal(santa.body.matches.length,5);
  assert.ok(santa.body.matches.every(m=>m.home_id==='SANTA-ELENA'||m.away_id==='SANTA-ELENA'));
  assert.notDeepEqual(
    cudoMatches.body.matches.map(m=>m.match_id).sort(),
    santa.body.matches.map(m=>m.match_id).sort(),
    'different tenants must resolve different club-scoped projections'
  );

  const serviceContext=await get('https://qa.invalid/api/v1/site-context');
  assert.equal(serviceContext.body.context,'PLATFORM');
  assert.equal(serviceContext.body.resolution,'SERVICE_DEFAULT');
  assert.equal(serviceContext.body.tenant,null);

  const unknownHost=await get('https://club-desconocido.example/api/v1/site-context');
  assert.equal(unknownHost.response.status,404);
  assert.equal(unknownHost.body.error,'host_not_bound');

  await db.prepare("UPDATE web_host_bindings SET verification_status='VERIFIED',active=1 WHERE hostname='cudo.cl'").run();
  const verifiedCudoContext=await get('https://cudo.cl/api/v1/site-context');
  assert.equal(verifiedCudoContext.body.context,'TENANT');
  assert.equal(verifiedCudoContext.body.resolution,'VERIFIED_HOST');
  assert.equal(verifiedCudoContext.body.tenant.tenant_id,'CUDO');
  assert.equal(verifiedCudoContext.body.tenant.club_id,'UNION-ORILLA');

  await db.prepare("UPDATE web_host_bindings SET verification_status='VERIFIED',active=1 WHERE hostname='futbolchepica.cl'").run();
  const platformHost=await get('https://futbolchepica.cl/api/v1/site-context','https://futbolchepica.cl');
  assert.equal(platformHost.body.context,'PLATFORM');
  assert.equal(platformHost.body.resolution,'VERIFIED_HOST');
  assert.equal(platformHost.body.platform.platform_id,'FUTBOL-CHEPICA');
  assert.equal(platformHost.response.headers.get('access-control-allow-origin'),'https://futbolchepica.cl','verified host must become an allowed public web origin without code change');

  const badOrigin=await get('https://qa.invalid/api/v1/platform','https://unbound.example');
  assert.equal(badOrigin.response.headers.get('access-control-allow-origin'),null,'unbound origin must not receive CORS permission');

  console.log('PASS Fútbol Chépica exists as platform root and owns ANFA Chépica 2026');
  console.log('PASS 11 championship clubs materialize as unique logical tenants');
  console.log('PASS CUDO tenant maps to UNION-ORILLA without duplicating sporting identity');
  console.log('PASS tenant match projections are club-scoped and preserve governed series privacy');
  console.log('PASS futbolchepica.cl is declared as PLATFORM but inactive until DNS verification');
  console.log('PASS declared domains remain inactive until external verification');
  console.log('PASS verified host binding resolves PLATFORM or TENANT context without code forks');
  console.log('PASS unbound hosts/origins are not trusted');
  console.log('RESULT: PASS');
}finally{
  db.close();
}
