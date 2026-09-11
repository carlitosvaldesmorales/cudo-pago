export const ROLE = Object.freeze({
  REPORTER:'REPORTER',
  CLUB_ADMIN:'CLUB_ADMIN',
  MEDIA_PARTNER:'MEDIA_PARTNER',
  PLATFORM_OPERATOR:'PLATFORM_OPERATOR',
  SUPER_ADMIN:'SUPER_ADMIN'
});

export const CAPABILITY = Object.freeze({
  READ_COMPETITION:'READ_COMPETITION',
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
  // Kept for backwards compatibility only. New media collaborators are additive
  // grants and never replace the base reporter role.
  [ROLE.MEDIA_PARTNER]: new Set([
    CAPABILITY.READ_COMPETITION,
    CAPABILITY.OBSERVE_RESULT,
    CAPABILITY.PUBLISH_MATCH_EVENT
  ]),
  [ROLE.PLATFORM_OPERATOR]: new Set([
    CAPABILITY.READ_COMPETITION,
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
    CAPABILITY.READ_COMPETITION,
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

function grantCapabilities(grant){
  try{
    const value=JSON.parse(String(grant?.capabilities_json||'[]'));
    return Array.isArray(value)?new Set(value.map(String)):new Set();
  }catch{return new Set();}
}

async function grantsFor(db,telegramUserId,role=null){
  if(!db || !telegramUserId) return [];
  const q=role
    ? await db.prepare(`SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND role=? AND active=1 ORDER BY scope_type,scope_id`).bind(String(telegramUserId),role).all()
    : await db.prepare(`SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND active=1 ORDER BY role,scope_type,scope_id`).bind(String(telegramUserId)).all();
  return q.results || [];
}

export async function matchingScopedGrant(db,reporter,match,role=ROLE.MEDIA_PARTNER){
  if(!reporter?.telegram_user_id || !match) return null;
  const grants=await grantsFor(db,reporter.telegram_user_id,role);
  return grants.find(g=>scopeMatches(g,match)) || null;
}

export async function getActivePartnerMembership(db,telegramUserId,competitionId='ANFA-CHEPICA-2026'){
  if(!db || !telegramUserId) return null;
  return db.prepare(`SELECT * FROM actor_scope_grants
    WHERE telegram_user_id=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION'
      AND scope_id=? AND active=1 AND partner_code IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1`).bind(String(telegramUserId),competitionId).first();
}

// Organization-level coverage. This describes work that Chépica Play has decided
// to cover; it does not by itself authorize every member to write into the match.
export async function getPartnerCoverage(db,partnerCode,matchId){
  if(!db || !partnerCode || !matchId) return null;
  return db.prepare(`SELECT * FROM partner_match_coverages
    WHERE partner_code=? AND match_id=? AND status IN ('ASSIGNED','LIVE')
    LIMIT 1`).bind(String(partnerCode),String(matchId)).first();
}

// Human assignment. This is the operational scope of one correspondent inside
// an organization coverage and is intentionally separate from persistent membership.
export async function getPartnerCoverageAssignment(db,partnerCode,matchId,telegramUserId){
  if(!db || !partnerCode || !matchId || !telegramUserId) return null;
  return db.prepare(`SELECT a.*,c.match_id,c.competition_id,c.status AS coverage_status
    FROM partner_coverage_assignments a
    JOIN partner_match_coverages c ON c.coverage_id=a.coverage_id
    WHERE a.partner_code=? AND a.telegram_user_id=? AND a.status='ACTIVE'
      AND c.partner_code=? AND c.match_id=? AND c.status IN ('ASSIGNED','LIVE')
    LIMIT 1`).bind(String(partnerCode),String(telegramUserId),String(partnerCode),String(matchId)).first();
}

export async function resolveObservationProvenance(db,reporter,match){
  const role=effectiveRole(reporter);
  const base={
    source_type:'PUBLIC_USER',
    source_label:'Telegram · informador comunitario',
    trust_level:'PROVISIONAL',
    scoped:false
  };

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

  // Partner membership enables championship-wide consumption. Partner provenance
  // activates only for the human correspondent assigned to this coverage.
  const membership=await getActivePartnerMembership(db,reporter?.telegram_user_id,match?.competition_id);
  if(membership && grantCapabilities(membership).has(CAPABILITY.OBSERVE_RESULT)){
    const assignment=await getPartnerCoverageAssignment(db,membership.partner_code,match.match_id,reporter?.telegram_user_id);
    if(assignment) return {
      source_type:'MEDIA_PARTNER',
      source_label:`${membership.source_label||membership.partner_code} · transmisión`,
      trust_level:membership.trust_level || 'VERIFIED',
      scoped:true,
      grant_id:membership.grant_id,
      partner_code:membership.partner_code,
      coverage_id:assignment.coverage_id,
      assignment_id:assignment.assignment_id,
      correspondent_actor_id:String(reporter.telegram_user_id)
    };
  }

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

  return base;
}

export async function hasScopedCapability(db,reporter,capability,match){
  if(!reporter || !match) return capability===CAPABILITY.OBSERVE_RESULT;
  const role=effectiveRole(reporter);
  if(role===ROLE.SUPER_ADMIN) return hasCapability(reporter,capability);
  if(role===ROLE.PLATFORM_OPERATOR) return reporter.trust_level==='VERIFIED' && hasCapability(reporter,capability);

  const membership=await getActivePartnerMembership(db,reporter.telegram_user_id,match.competition_id);
  if(membership && grantCapabilities(membership).has(capability)){
    if(capability===CAPABILITY.READ_COMPETITION) return true;
    if(capability===CAPABILITY.OBSERVE_RESULT || capability===CAPABILITY.PUBLISH_MATCH_EVENT){
      return !!(await getPartnerCoverageAssignment(db,membership.partner_code,match.match_id,reporter.telegram_user_id));
    }
  }

  const grants=await grantsFor(db,reporter.telegram_user_id);
  if(grants.some(g=>g.role!==ROLE.MEDIA_PARTNER && scopeMatches(g,match)&&grantCapabilities(g).has(capability))) return true;

  if(role===ROLE.CLUB_ADMIN){
    if(reporter.trust_level!=='VERIFIED' || !hasCapability(reporter,capability)) return false;
    return !!reporter.club_id && (reporter.club_id===match.home_id || reporter.club_id===match.away_id);
  }
  return capability===CAPABILITY.OBSERVE_RESULT;
}