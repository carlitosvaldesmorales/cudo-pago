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
- MEDIA_PARTNER: for the current Chépica Play contract, may consume championship results and register result observations across the competition. It does not gain event publishing or canonical governance.
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

For an active Chépica Play competition membership, a result registered through this flow carries:

- `source_type = MEDIA_PARTNER`
- `source_label = Chépica Play`
- `trust_level = VERIFIED`

No coverage, correspondent assignment, live state or match-event capability is required to register the score because those concepts are outside the current product scope.

## Partner scope

`actor_scope_grants` supports PLATFORM, COMPETITION, CLUB and MATCH scopes. Chépica Play currently uses a persistent `COMPETITION` grant with exactly:

- `READ_COMPETITION`
- `OBSERVE_RESULT`

The competition scope answers *where the two declared capabilities apply*. It must not be used to infer additional functionality.

Binding a real Chépica Play identity still requires an explicit one-time enrollment; enrollment preserves the person's base role and adds the two-capability partner relationship.
