# CUDO Facebook Photo Picker PoC

Scope: QA-only proof that a person can authorize Facebook, review photos returned by Graph API, select one, and copy that image into the CUDO server for later review.

## Non-goals

- No changes to `preview-v8` production.
- No Tally replacement.
- No publishing into `PUBLICO_EXPORT`.
- No scraping of Facebook or Instagram.
- No storage of access tokens on disk.
- No real club-member data until the PoC is explicitly promoted beyond QA.

## Real flow under test

1. User opens the temporary QA URL.
2. `Facebook Login` asks for `public_profile,user_photos`.
3. Server exchanges the OAuth code for a user token.
4. Server queries the current user's profile image and `/me/photos?type=uploaded`.
5. User sees candidate thumbnails and chooses one.
6. Server downloads only that selected image into its QA storage.
7. The screen reports `PoC PASS`; nothing is published to CUDO V8.

## Runtime

The GitHub Actions workflow `cudo-facebook-photo-poc.yml` runs on the existing self-hosted runner at `olam-prd.soaint.local`. It uses host Node plus the existing `cloudflared` binary to expose a temporary Quick Tunnel.

## Required Meta values

The workflow reads, but never prints:

- `CUDO_META_APP_ID`
- `CUDO_META_APP_SECRET`

If either value is absent, the PoC still boots and exposes a setup-required screen. This is intentional so infrastructure and capacity can be validated before asking for a human credential action.

The temporary callback URI is:

`<temporary_public_url>/<persistent_poc_key>/callback`

That exact URI must be allowed in the Meta app before the real OAuth test.

## Success criteria

- self-hosted runtime starts without touching V8 production;
- external QA URL returns HTTP 200;
- Meta OAuth completes for a test/app-role account;
- Graph API returns at least the profile picture or one authorized photo candidate;
- selected image is copied to `~/.cudo-facebook-photo-poc/storage/selected`;
- access token is not persisted;
- baseline and post-start CPU/RAM/disk evidence is recorded by CI.

## Capacity rule

Do not size or buy infrastructure from estimates. Compare the workflow's before/after host metrics and, after a functional PASS, run a small controlled concurrency test if production sizing is needed.
