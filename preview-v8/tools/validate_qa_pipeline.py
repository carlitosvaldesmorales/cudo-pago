#!/usr/bin/env python3
from pathlib import Path

SYNC = Path('.github/workflows/sync-qa-google-data.yml')
LEGACY = Path('.github/workflows/publish-qa-google.yml')

for path in (SYNC, LEGACY):
    if not path.exists():
        raise SystemExit(f'QA PIPELINE: falta {path}')

sync = SYNC.read_text(encoding='utf-8')
legacy = LEGACY.read_text(encoding='utf-8')

required_sync_tokens = [
    'name: CUDO V8 - sync QA Google data',
    'group: cudo-v8-qa-pipeline',
    "git push origin HEAD:qa-v8-google-data",
    "git push origin HEAD:main",
    "'!preview-v8/data/**'",
    "'!preview-v8/media/**'",
    'git add preview-v8/media',
    'Validar que la proyección pública no contenga referencias privadas',
    'Publicar snapshot QA y proyección segura de preview V8',
    'publish/preview-v8/data/${module}.json',
    'preview-v8/data/noticias.json',
    'preview-v8/data/equipos.json',
    'preview-v8/data/plantel.json',
    'preview-v8/data/partidos.json',
    'preview-v8/data/tabla.json',
    'preview-v8/data/galeria.json',
    'preview-v8/media/noticias',
    'preview-v8/media/plantel',
    'preview-v8/media/galeria',
    'QA publish E2E + preview projection',
    'for attempt in 1 2 3',
    'Sync Google attempt ${attempt}/3',
    'Sync Google falló tras 3 intentos',
]
for token in required_sync_tokens:
    if token not in sync:
        raise SystemExit(f'QA PIPELINE: sync canónico incompleto; falta {token!r}')

privacy_tokens = [
    'storage\\.tally\\.so/private',
    'accessToken=',
    'signature=',
]
for token in privacy_tokens:
    if token not in sync:
        raise SystemExit(f'QA PIPELINE: falta guard de privacidad {token!r}')

for forbidden in [
    'git push origin HEAD:main',
    'contents: write',
    'branches:\n      - qa-v8-google-data',
]:
    if forbidden in legacy:
        raise SystemExit(f'QA PIPELINE: publisher legacy conserva autoridad de escritura/triggers: {forbidden!r}')

if 'workflow_dispatch:' not in legacy:
    raise SystemExit('QA PIPELINE: workflow legacy debe quedar sólo como diagnóstico manual')

print('OK  QA pipeline: un solo escritor canónico publica snapshot QA + proyección segura preview-v8 + retry Google acotado')
