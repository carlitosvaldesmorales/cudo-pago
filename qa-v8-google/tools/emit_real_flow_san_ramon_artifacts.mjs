import {buildRealFlowSanRamonArtifacts} from './real_flow_san_ramon_runtime.mjs';

const {artifacts}=buildRealFlowSanRamonArtifacts();
for(const [name,value] of Object.entries(artifacts)){
  const text=JSON.stringify(value,null,2)+'\n';
  const encoded=Buffer.from(text,'utf8').toString('base64');
  console.log(`CUDO_ARTIFACT_${name.toUpperCase()}_BASE64=${encoded}`);
}
