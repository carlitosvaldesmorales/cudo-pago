import fs from 'node:fs';

const path='docs/product/module-registry.json';
const registry=JSON.parse(fs.readFileSync(path,'utf8'));
const order=['DEFINED','VISUAL_PENDING','PRODUCT_VALIDATED','IMPLEMENTED','QA_CERTIFIED','CONSUMABLE'];
const modules=new Map((registry.modules||[]).map(m=>[m.id,m]));
const errors=[];

for(const m of modules.values()){
  if(!order.includes(m.stage)) errors.push(`${m.id}: invalid stage ${m.stage}`);
  const rank=order.indexOf(m.stage);

  if(m.human_facing && rank>=order.indexOf('PRODUCT_VALIDATED')){
    if(m.visual_contract!=='APPROVED') errors.push(`${m.id}: human-facing module cannot pass PRODUCT_VALIDATED without visual_contract=APPROVED`);
    if(m.product_validation!=='APPROVED') errors.push(`${m.id}: human-facing module cannot pass PRODUCT_VALIDATED without product_validation=APPROVED`);
  }

  if(rank>=order.indexOf('IMPLEMENTED') && !['DONE','EXISTS'].includes(m.technical_implementation)){
    errors.push(`${m.id}: stage ${m.stage} requires technical_implementation DONE/EXISTS`);
  }

  if(rank>=order.indexOf('QA_CERTIFIED') && m.qa!=='PASS'){
    errors.push(`${m.id}: stage ${m.stage} requires qa=PASS`);
  }

  if(m.stage==='CONSUMABLE'){
    if(m.consumable!==true) errors.push(`${m.id}: CONSUMABLE stage requires consumable=true`);
    if(m.runtime_evidence!=='VERIFIED') errors.push(`${m.id}: CONSUMABLE stage requires runtime_evidence=VERIFIED`);
  }else if(m.consumable===true){
    errors.push(`${m.id}: consumable=true is only allowed at CONSUMABLE stage`);
  }

  for(const dependency of m.dependencies||[]){
    const provider=modules.get(dependency);
    if(!provider) errors.push(`${m.id}: unknown dependency ${dependency}`);
    else if(provider.consumable!==true) errors.push(`${m.id}: dependency ${dependency} is not CONSUMABLE`);
  }
}

if(!registry.current_frontier?.module_id || !modules.has(registry.current_frontier.module_id)){
  errors.push('current_frontier.module_id must reference a registered module');
}

if(errors.length){
  console.error('Consumable Module Gate: FAIL');
  for(const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('Consumable Module Gate: PASS');
for(const m of modules.values()) console.log(`${m.id}: ${m.stage} · consumable=${m.consumable}`);
console.log(`Frontier: ${registry.current_frontier.module_id} → ${registry.current_frontier.allowed_next_step}`);
