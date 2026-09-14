import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contractPath=path.join(root,'preview-v8/certification/mobile-capabilities.json');
const qaRoot=process.env.CUDO_QA_ROOT ? path.resolve(root,process.env.CUDO_QA_ROOT) : null;

const fail=message=>{throw new Error(`MOBILE CERTIFICATION: ${message}`)};
if(!fs.existsSync(contractPath)) fail('falta mobile-capabilities.json');
const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
if(contract.invariant!=='NO_CAPABILITY_WITHOUT_AUTOMATED_CERTIFICATION') fail('invariante inesperada');
if(contract.release_rule!=='AUTOMATED_EVIDENCE_REQUIRED_BEFORE_RELEASE') fail('release_rule inesperada');
if(contract.human_test_policy!=='NOT_A_NORMAL_RELEASE_GATE') fail('la prueba humana no puede ser gate normal');

const catalog=contract.automation_catalog||{};
const capabilities=contract.capabilities||[];
if(!capabilities.length) fail('no hay capacidades declaradas');

for(const [id,test] of Object.entries(catalog)){
  if(!test.runner||!test.workflow||!test.evidence) fail(`${id} incompleto`);
  const sourceRoot=test.source==='local'?root:(test.source==='qa-v8-google-data'?qaRoot:null);
  if(!sourceRoot) fail(`${id}: source ${test.source} no disponible`);
  const workflowPath=path.join(sourceRoot,test.workflow);
  if(!fs.existsSync(workflowPath)) fail(`${id}: falta workflow ${test.workflow} en ${test.source}`);
  const workflow=fs.readFileSync(workflowPath,'utf8');
  if(!workflow.includes(test.runner)) fail(`${id}: workflow no ejecuta ${test.runner}`);
}

for(const capability of capabilities){
  if(!capability.id) fail('capacidad sin id');
  if(capability.status!=='active') continue;
  if(capability.release_blocking!==true) fail(`${capability.id}: capacidad activa debe ser release_blocking`);
  if(capability.manual_gate!==false) fail(`${capability.id}: manual_gate debe ser false`);
  if(!Array.isArray(capability.tests)||!capability.tests.length) fail(`${capability.id}: no tiene pruebas`);
  for(const testId of capability.tests){
    if(!catalog[testId]) fail(`${capability.id}: referencia prueba inexistente ${testId}`);
  }
}

const expectedDomains=['noticias','equipos_series','plantel_jugadores','partidos_resultados','tabla_posiciones','galeria'];
for(const id of expectedDomains){
  const capability=capabilities.find(c=>c.id===id);
  if(!capability) fail(`falta capacidad obligatoria ${id}`);
  for(const required of ['PUBLIC_CONTRACTS','GOOGLE_TO_V8_E2E','MOBILE_WEBKIT_CHROMIUM_E2E']){
    if(!capability.tests.includes(required)) fail(`${id}: falta ${required}`);
  }
}

if(contract.escalation_rule?.forbidden_default!=='ASK_CARLOS_TO_BE_THE_TEST_RUNNER') fail('falta regla anti-prueba-humana');

console.log(JSON.stringify({
  ok:true,
  invariant:contract.invariant,
  active_capabilities:capabilities.filter(c=>c.status==='active').map(c=>c.id),
  automation_tests:Object.keys(catalog),
  human_test_policy:contract.human_test_policy
},null,2));
