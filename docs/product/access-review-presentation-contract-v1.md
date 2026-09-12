# Access request review presentation

Human access review must preserve the information supplied during intake. The reviewer must see the declared name, represented club/institution, and the real Telegram technical identity before making a decision.

Canonical invariant:

`INTAKE -> REVIEW PRESENTATION -> HUMAN DECISION -> PERMISSION MATERIALIZATION`

Opening/reviewing the request never grants access. Only the explicit approve decision may create the Chépica Play grant.

The canonical router must evaluate governed confirmation, structured intake, and governed review before the legacy Chépica Play home handler. This prevents old fallback paths from becoming product authority again.
