# Contributor Observation Plane v1

## Purpose

Fútbol Chépica separates contribution from authority. Any Telegram identity may contribute an observation about a result; an observation never mutates canonical state by itself.

## Pattern

Expected State -> Observations -> Reconciliation -> Canonical State

The capture UX follows recognition-over-recall, constrained input, progressive disclosure and explicit confirmation:

Fecha -> Partido -> Serie -> Goles local -> Goles visita -> Confirmar

Normal score entry is button-first. Values above 7 use a button stepper rather than free text.

## Roles

- REPORTER / public identity: may observe.
- CLUB_ADMIN: may observe and administer results within the participating club scope.
- MEDIA_PARTNER: may observe with partner provenance only inside an explicit grant scope; outside that scope the same identity falls back to ordinary public provenance.
- PLATFORM_OPERATOR: operational authority across the platform, but no policy authority and no ability to grant SUPER_ADMIN.
- SUPER_ADMIN: operational authority plus policy/security authority.

Role, trust and scope are intentionally independent dimensions.

## Provenance

Each observation stores source type, source label, trust level, optional evidence reference, observation kind, and the canonical result observed at submission time when one exists.

Observation kinds:

- INITIAL: no canonical result existed.
- CORROBORATION: observation matches the current canonical score.
- DISCREPANCY: observation differs from the current canonical score.

Existing canonical results are never overwritten by the contribution flow.

## Partner scope

`actor_scope_grants` supports PLATFORM, COMPETITION, CLUB and MATCH scopes. MEDIA_PARTNER trust is recognized only when the observed match falls inside an active grant.

No Chépica Play identity or grant is seeded by this change. Binding a real partner requires a concrete authenticated identity and an explicit initial scope.