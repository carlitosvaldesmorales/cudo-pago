export const ACCESS_REQUEST_SUBJECT_PRESENTATION_CONTRACT=Object.freeze({
  id:'ACCESS_REQUEST_SUBJECT_PRESENTATION_V1',
  declared_name_precedes_telegram_profile:true,
  represented_entity_is_declarative_context:true,
  technical_identity_remains_separate:true
});

export function accessRequestSubjectName(row){
  return row?.declared_name
    || row?.display_name
    || row?.telegram_user_id
    || 'Solicitante';
}

export function accessRequestRepresentedEntity(row){
  return row?.represented_entity || 'No informado';
}

export function accessRequestTechnicalIdentity(row){
  if(row?.username) return `@${row.username}`;
  return row?.telegram_user_id || 'No disponible';
}
