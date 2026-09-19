import crypto from 'node:crypto';

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}

export function createAttentionSignal({
  subjectObjectId,
  signalCode,
  explanation,
  sourceRefs,
  observedAt='2026-09-19T23:00:00.000Z',
  status='ACTIVE'
}){
  if(!subjectObjectId) throw new Error('attention signal requires subjectObjectId');
  if(!signalCode||typeof signalCode!=='string') throw new Error('attention signal requires signalCode');
  if(!explanation||typeof explanation!=='string') throw new Error('attention signal requires explanation');
  if(!Array.isArray(sourceRefs)||sourceRefs.length===0) throw new Error('attention signal requires sourceRefs');
  if(!['ACTIVE','RESOLVED'].includes(status)) throw new Error('attention signal status invalid');
  const objectId=makeId('CUDO-ATTN',{subjectObjectId,signalCode,explanation,sourceRefs,observedAt});
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:objectId,
    object_type:'ATTENTION_SIGNAL',
    object_version:1,
    lifecycle_state:status,
    data:{
      signal_code:signalCode,
      explanation,
      observed_at:observedAt,
      status
    },
    field_semantics:{
      signal_code:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      explanation:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      observed_at:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      status:{state_kind:'SOURCE',source_refs:[...sourceRefs]}
    },
    relationships:[{
      relationship_id:makeId('REL-ATTN-SUBJECT',{objectId,subjectObjectId}),
      relationship_type:'ATTENTION_ON',
      target_object_id:subjectObjectId
    }],
    provenance:{
      created_at:observedAt,
      updated_at:null,
      source_system:'CUDO_ATTENTION_DERIVATION_OR_DECLARATION',
      source_refs:[...sourceRefs]
    },
    legacy_refs:[]
  };
}
