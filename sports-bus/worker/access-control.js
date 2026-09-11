export const ROLE = Object.freeze({
  REPORTER:'REPORTER',
  CLUB_ADMIN:'CLUB_ADMIN',
  MEDIA_PARTNER:'MEDIA_PARTNER',
  PLATFORM_OPERATOR:'PLATFORM_OPERATOR',
  SUPER_ADMIN:'SUPER_ADMIN'
});

export const CAPABILITY = Object.freeze({
  OBSERVE_RESULT:'OBSERVE_RESULT',
  REVIEW_RESULT:'REVIEW_RESULT',
  GOVERN_RESULTS:'GOVERN_RESULTS',
  MANAGE_CLUB_RESULTS:'MANAGE_CLUB_RESULTS',
  MANAGE_CLUBS:'MANAGE_CLUBS',
  MANAGE_ACCESS:'MANAGE_ACCESS',
  MANAGE_CONTENT:'MANAGE_CONTENT',
  VIEW_AUDIT:'VIEW_AUDIT',
  PUBLISH_MATCH_EVENT:'PUBLISH_MATCH_EVENT',
  MANAGE_POLICY:'MANAGE_POLICY',
  GRANT_SUPER_ADMIN:'GRANT_SUPER_ADMIN'
});

const BASE = Object.freeze({
  [ROLE.REPORTER]: new Set([CAPABILITY.OBSERVE_RESULT]),
  [ROLE.CLUB_ADMIN]: new Set([
    CAPABILITY.OBSERVE_RESULT,
    CAPABILITY.REVIEW_RESULT,
    CAPABILITY.MANAGE_CLUB_RESULTS
  ]),
  [ROLE.MEDIA_PARTNER]: new Set([
    CAPABILITY.OBSERVE_RESULT,
    CAPABILITY.PUBLISH_MATCH_EVENT
  ]),
  [ROLE.PLATFORM_OPERATOR]: new Set([
    CAPABILITY.OBSERVE_RESULT,
    CAPABILITY.REVIEW_RESULT,
    CAPABILITY.GOVERN_RESULTS,
    CAPABILITY.MANAGE_CLUB_RESULTS,
    CAPABILITY.MANAGE_CLUBS,
    CAPABILITY.MANAGE_ACCESS,
    CAPABILITY.MANAGE_CONTENT,
    CAPABILITY.VIEW_AUDIT
  ]),
  [ROLE.SUPER_ADMIN]: new Set([
    CAPABILITY.OBSERVE_RESULT,
    CAPABILITY.REVIEW_RESULT,
    CAPABILITY.GOVERN_RESULTS,
    CAPABILITY.MANAGE_CLUB_RESULTS,
    CAPABILITY.MANAGE_CLUBS,
    CAPABILITY.MANAGE_ACCESS,
    CAPABILITY.MANAGE_CONTENT,
    CAPABILITY.VIEW_AUDIT,
    CAPABILITY.PUBLISH_MATCH_EVENT,
    CAPABILITY.MANAGE_POLICY,
    CAPABILITY.GRANT_SUPER_ADMIN
  ])
});

export function effectiveRole(reporter){
  if(!reporter?.active) return ROLE.REPORTER;
  return BASE[reporter.role] ? reporter.role : ROLE.REPORTER;
}

export function hasCapability(reporter, capability){
  return BASE[effectiveRole(reporter)]?.has(capability) || false;
}

export function canChangePolicy(reporter){
  return hasCapability(reporter,CAPABILITY.MANAGE_POLICY);
}

export function canGovernPlatform(reporter){
  return reporter?.trust_level==='VERIFIED' && hasCapability(reporter,CAPABILITY.GOVERN_RESULTS);
}

export function canReviewPlatform(reporter){
  return reporter?.trust_level==='VERIFIED' && hasCapability(reporter,CAPABILITY.REVIEW_RESULT);
}

function scopeMatches(grant, match){
  if(!grant || Number(grant.active)!==1) return false;
  if(grant.scope_type==='PLATFORM') return grant.scope_id==='FUTBOL-CHEPICA';
  if(grant.scope_type==='COMPETITION') return grant.scope_id===match.competition_id;
  if(grant.scope_type==='MATCH') return grant.scope_id===match.match_id;
  if(grant.scope_type==='CLUB') return grant.scope_id===match.home_id || grant.scope_id===match.away_id;
  return false;
}

async function grantsFor(db,telegramUserId,role){
  if(!db || !telegramUserId) return [];
  const q=await db.prepare(`SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND role=? AND active=1 ORDER BY scope_type,scope_id`).bind(String(telegramUserId),role).all();
  return q.results || [];
}

export async function resolveObservationProvenance(db,reporter,match){
  const role=effectiveRole(reporter);
  const base={
    source_type:'PUBLIC_USER',
    source_label:'Telegram · informador comunitario',
    trust_level:'PROVISIONAL',
    scoped:false
  };

  if(role===ROLE.CLUB_ADMIN && reporter?.trust_level==='VERIFIED'){
    const participates=reporter.club_id && (reporter.club_id===match.home_id || reporter.club_id===match.away_id);
    if(participates) return {
      source_type:'CLUB_ADMIN',
      source_label:`Telegram · dirigente ${reporter.club_id}`,
      trust_level:'VERIFIED',
      scoped:true
    };
    return base;
  }

  if(role===ROLE.PLATFORM_OPERATOR && reporter?.trust_level==='VERIFIED') return {
    source_type:'PLATFORM_OPERATOR',
    source_label:'Telegram · administrador del campeonato',
    trust_level:'VERIFIED',
    scoped:true
  };

  if(role===ROLE.SUPER_ADMIN && reporter?.trust_level==='VERIFIED') return {
    source_type:'SUPER_ADMIN',
    source_label:'Telegram · administrador global',
    trust_level:'VERIFIED',
    scoped:true
  };

  if(role===ROLE.MEDIA_PARTNER && reporter?.trust_level==='VERIFIED'){
    const grants=await grantsFor(db,reporter.telegram_user_id,ROLE.MEDIA_PARTNER);
    const grant=grants.find(g=>scopeMatches(g,match));
    if(grant) return {
      source_type:'MEDIA_PARTNER',
      source_label:grant.source_label || 'Telegram · medio colaborador',
      trust_level:grant.trust_level || 'VERIFIED',
      scoped:true,
      grant_id:grant.grant_id
    };
    // A media identity outside its assigned scope may still contribute as any public user,
    // but it does not inherit partner trust outside that scope.
    return base;
  }

  return base;
}

export async function hasScopedCapability(db,reporter,capability,match){
  if(!reporter?.active) return capability===CAPABILITY.OBSERVE_RESULT;
  const role=effectiveRole(reporter);
  if(role===ROLE.SUPER_ADMIN) return hasCapability(reporter,capability);
  if(role===ROLE.PLATFORM_OPERATOR) return reporter.trust_level==='VERIFIED' && hasCapability(reporter,capability);
  if(role===ROLE.CLUB_ADMIN){
    if(reporter.trust_level!=='VERIFIED' || !hasCapability(reporter,capability)) return false;
    return !!reporter.club_id && (reporter.club_id===match.home_id || reporter.club_id===match.away_id);
  }
  if(role===ROLE.MEDIA_PARTNER){
    if(reporter.trust_level!=='VERIFIED' || !hasCapability(reporter,capability)) return false;
    const grants=await grantsFor(db,reporter.telegram_user_id,ROLE.MEDIA_PARTNER);
    return grants.some(g=>scopeMatches(g,match));
  }
  return capability===CAPABILITY.OBSERVE_RESULT;
}
