# Access Capability Matrix v1

| Capability | Public / REPORTER | CLUB_ADMIN | MEDIA_PARTNER | PLATFORM_OPERATOR | SUPER_ADMIN |
|---|---:|---:|---:|---:|---:|
| View public championship / results | yes | yes | yes | yes | yes |
| Register result observation | yes | yes | yes | yes | yes |
| Manage own club results | no | yes, club scope | no | yes | yes |
| Publish match event | no | no | **no (current contract)** | no | yes |
| Review observations | no | yes, participating club scope | no | yes | yes |
| Govern all results | no | no | no | yes | yes |
| Manage clubs | no | no | no | yes | yes |
| Manage access / dirigentes | no | no | no | yes | yes |
| Manage content | no | no | no | yes | yes |
| View operational audit | no | no | no | yes | yes |
| Change platform policy | no | no | no | no | yes |
| Grant SUPER_ADMIN | no | no | no | no | yes |

## MEDIA_PARTNER current product contract

For Chépica Play, `MEDIA_PARTNER` is currently an additive competition-scoped relationship with exactly two product capabilities:

- `READ_COMPETITION`: consume championship results.
- `OBSERVE_RESULT`: register a score as an observation/contribution.

`PUBLISH_MATCH_EVENT`, match coverage, correspondent assignment and live-event capture are explicitly outside the current scope. Context about Chépica Play's transmission operation does not expand this matrix.

## Partner organization identity invariant

`Chépica Play` is one partner organization, not one Telegram user. The organization may have **N independent active Telegram identities** linked to the same `partner_code=CHEPICA_PLAY` and competition scope.

The invariant is:

`PARTNER ORGANIZATION != PERSON IDENTITY`

Each person:

- uses their own Telegram identity;
- receives an individual, single-use invitation;
- receives the same current two capabilities only;
- keeps independent membership lifecycle and audit provenance;
- can be revoked without affecting the other active identities of Chépica Play.

Several individual invitations may coexist in `PENDING` state. Claiming one invitation must not consume or invalidate the others. If a person who is already an active Chépica Play member opens another valid invitation, that invitation must remain available for another person.

The invariant is Separation of Duties: PLATFORM_OPERATOR can run the competition but cannot change the rules that bound its own authority; MEDIA_PARTNER can contribute information but cannot govern canonical truth.
