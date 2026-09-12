import fs from 'node:fs';

const path='docs/architecture/system-authority-registry-v1.json';
const doc=JSON.parse(fs.readFileSync(path,'utf8'));
const errors=[];
const scopes=new Map();
const artifactPaths=new Set();

for(const scope of doc.semantic_scopes||[]){
  if(!scope.id) { errors.push('semantic scope without id'); continue; }
  if(scopes.has(scope.id)) errors.push(`duplicate semantic scope: ${scope.id}`);
  scopes.set(scope.id,scope);
  if(!scope.bounded_context) errors.push(`${scope.id}: bounded_context required`);
  if(!scope.authority || !scope.authority.system || !scope.authority.store || !scope.authority.model){
    errors.push(`${scope.id}: exactly one explicit authority {system,store,model} is required`);
  }
  if(Array.isArray(scope.authorities)) errors.push(`${scope.id}: authorities[] forbidden; one semantic scope must have one canonical authority`);
}

for(const scope of scopes.values()){
  for(const dependency of scope.dependencies||[]){
    if(!scopes.has(dependency)) errors.push(`${scope.id}: unknown dependency ${dependency}`);
  }
}

for(const artifact of doc.artifact_classification||[]){
  if(!artifact.path){ errors.push('artifact classification without path'); continue; }
  if(artifactPaths.has(artifact.path)) errors.push(`duplicate artifact classification: ${artifact.path}`);
  artifactPaths.add(artifact.path);
  if(artifact.authoritative===true && artifact.classification!=='CANONICAL_AUTHORITY'){
    errors.push(`${artifact.path}: authoritative=true requires CANONICAL_AUTHORITY classification`);
  }
  if(String(artifact.classification||'').includes('NON_AUTHORITY') && artifact.authoritative!==false){
    errors.push(`${artifact.path}: NON_AUTHORITY artifact must set authoritative=false`);
  }
  if(artifact.semantic_scope && !scopes.has(artifact.semantic_scope)){
    errors.push(`${artifact.path}: unknown semantic_scope ${artifact.semantic_scope}`);
  }
}

const requiredInvariants=[
  'ONE_SEMANTIC_SCOPE_ONE_CANONICAL_AUTHORITY',
  'REFERENCE_OVER_COPY',
  'PROJECTION_NEQ_AUTHORITY',
  'PERSON_NEQ_CAPABILITY_VALIDATION',
  'POLICY_NEQ_FLOW'
];
for(const invariant of requiredInvariants){
  if(!(doc.invariants||[]).includes(invariant)) errors.push(`missing invariant: ${invariant}`);
}

if(errors.length){
  console.error('System Authority Gate: FAIL');
  for(const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('System Authority Gate: PASS');
for(const scope of scopes.values()){
  console.log(`${scope.id} -> ${scope.authority.system}/${scope.authority.store}/${scope.authority.model}`);
}
console.log(`Classified artifacts: ${artifactPaths.size}`);
